import { dirname, isAbsolute, normalize } from 'path'

import { insertTrace } from '@codebuff/bigquery'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import {
  finetunedVertexModels,
  models,
  type FinetunedVertexModel,
} from '@codebuff/common/old-constants'
import { getAllFilePaths } from '@codebuff/common/project-file-tree'
import { and, eq } from 'drizzle-orm'
import { range, shuffle, uniq } from 'lodash'
import { env } from '@codebuff/internal/env'

import { CustomFilePickerConfigSchema } from './custom-file-picker-config'
import { promptFlashWithFallbacks } from '../llm-apis/gemini-with-fallbacks'
import { promptAiSdk } from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'
import {
  castAssistantMessage,
  messagesWithSystem,
  getMessagesSubset,
} from '../util/messages'
import { getRequestContext } from '../websockets/request-context'

import type { CustomFilePickerConfig } from './custom-file-picker-config'
import type { TextBlock } from '../llm-apis/claude'
import type {
  GetExpandedFileContextForTrainingTrace,
  GetRelevantFilesTrace,
} from '@codebuff/bigquery'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const NUMBER_OF_EXAMPLE_FILES = 100
const MAX_FILES_PER_REQUEST = 30

export async function getCustomFilePickerConfigForOrg(
  orgId: string | undefined,
  isRepoApprovedForUserInOrg: boolean | undefined,
): Promise<CustomFilePickerConfig | null> {
  if (!orgId || !isRepoApprovedForUserInOrg) {
    return null
  }

  try {
    const orgFeature = await db
      .select()
      .from(schema.orgFeature)
      .where(
        and(
          eq(schema.orgFeature.org_id, orgId),
          eq(schema.orgFeature.feature, 'custom-file-picker'),
          eq(schema.orgFeature.is_active, true),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    if (orgFeature?.config && typeof orgFeature.config === 'string') {
      // Check if config is a string
      let parsedConfigObject
      try {
        parsedConfigObject = JSON.parse(orgFeature.config)
      } catch (jsonParseError) {
        logger.error(
          { error: jsonParseError, orgId, configString: orgFeature.config },
          'Failed to parse customFilePickerConfig JSON string',
        )
        return null // Parsing the string itself failed
      }

      const parseResult =
        CustomFilePickerConfigSchema.safeParse(parsedConfigObject) // Parse the object
      if (parseResult.success) {
        logger.info(
          { orgId, modelName: parseResult.data.modelName },
          'Using custom file picker configuration for organization',
        )
        return parseResult.data
      } else {
        logger.error(
          { error: parseResult.error, orgId, configObject: parsedConfigObject }, // Log the object that failed parsing
          'Invalid custom file picker configuration, using defaults',
        )
      }
    } else if (orgFeature?.config) {
      // If config is not a string but exists, it might be an object already (e.g. from a direct mock)
      // or an unexpected type. Let's try to parse it directly, assuming it might be an object.
      const parseResult = CustomFilePickerConfigSchema.safeParse(
        orgFeature.config,
      )
      if (parseResult.success) {
        logger.info(
          { orgId, modelName: parseResult.data.modelName },
          'Using custom file picker configuration for organization (pre-parsed config object)',
        )
        return parseResult.data
      } else {
        logger.error(
          { error: parseResult.error, orgId, configValue: orgFeature.config },
          'Invalid custom file picker configuration (non-string config value), using defaults',
        )
      }
    }
  } catch (error) {
    logger.error(
      { error, orgId },
      'Error fetching custom file picker configuration',
    )
  }
  return null
}

function isValidFilePickerModelName(
  modelName: string,
): modelName is keyof typeof finetunedVertexModels {
  return Object.keys(finetunedVertexModels).includes(modelName)
}

export async function requestRelevantFiles(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlock>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined,
) {
  // Check for organization custom file picker feature
  const requestContext = getRequestContext()
  const orgId = requestContext?.approvedOrgIdForRepo
  const customFilePickerConfig = await getCustomFilePickerConfigForOrg(
    orgId,
    requestContext?.isRepoApprovedForUserInOrg,
  )

  const countPerRequest = 12

  // Use custom max files per request if specified, otherwise default to 30
  const maxFilesPerRequest =
    customFilePickerConfig?.maxFilesPerRequest ?? MAX_FILES_PER_REQUEST

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : ''

  // Only proceed to get key files if new files are necessary
  const keyPrompt = generateKeyRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    countPerRequest,
  )

  let modelIdForRequest: FinetunedVertexModel | undefined = undefined
  const modelName = customFilePickerConfig?.modelName
  if (modelName) {
    if (isValidFilePickerModelName(modelName)) {
      modelIdForRequest = finetunedVertexModels[modelName]
    } else {
      logger.warn(
        { modelName: customFilePickerConfig.modelName },
        'Custom file picker modelName not found in finetunedVertexModel, using default',
      )
    }
  }

  const keyPromise = getRelevantFiles(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    keyPrompt,
    'Key',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
    modelIdForRequest,
  ).catch((error) => {
    logger.error({ error }, 'Error requesting key files')
    return { files: [] as string[], duration: 0 }
  })

  const candidateFiles = (await keyPromise).files

  validateFilePaths(uniq(candidateFiles))

  // logger.info(
  //   {
  //     files,
  //     customFilePickerConfig: customFilePickerConfig,
  //     modelName: customFilePickerConfig?.modelName,
  //     orgId,
  //   },
  //   'requestRelevantFiles: results',
  // )

  return candidateFiles.slice(0, maxFilesPerRequest)
}

export async function requestRelevantFilesForTraining(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlock>
  },
  fileContext: ProjectFileContext,
  assistantPrompt: string | null,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined,
) {
  const COUNT = 50

  const lastMessage = messages[messages.length - 1]
  const messagesExcludingLastIfByUser =
    lastMessage.role === 'user' ? messages.slice(0, -1) : messages
  const userPrompt =
    lastMessage.role === 'user'
      ? typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content)
      : ''

  const keyFilesPrompt = generateKeyRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    COUNT,
  )
  const nonObviousPrompt = generateNonObviousRequestFilesPrompt(
    userPrompt,
    assistantPrompt,
    fileContext,
    COUNT,
  )

  const keyFiles = await getRelevantFilesForTraining(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    keyFilesPrompt,
    'Key',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
  )

  const nonObviousFiles = await getRelevantFilesForTraining(
    {
      messages: messagesExcludingLastIfByUser,
      system,
    },
    nonObviousPrompt,
    'Non-Obvious',
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoId,
  )

  const candidateFiles = [...keyFiles.files, ...nonObviousFiles.files]
  const validatedFiles = validateFilePaths(uniq(candidateFiles))
  logger.debug(
    { keyFiles, nonObviousFiles, validatedFiles },
    'requestRelevantFilesForTraining: results',
  )
  return validatedFiles.slice(0, MAX_FILES_PER_REQUEST)
}

async function getRelevantFiles(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlock>
  },
  userPrompt: string,
  requestType: string,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined,
  modelId?: FinetunedVertexModel,
) {
  const bufferTokens = 100_000
  const messagesWithPrompt = getMessagesSubset(
    [
      ...messages,
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ],
    bufferTokens,
  )
  const start = performance.now()
  let codebuffMessages = messagesWithSystem(messagesWithPrompt, system)

  // Converts assistant messages to user messages for finetuned model
  codebuffMessages = codebuffMessages
    .map((msg, i) => {
      if (msg.role === 'assistant' && i !== codebuffMessages.length - 1) {
        return castAssistantMessage(msg)
      } else {
        return msg
      }
    })
    .filter((msg) => msg !== null)
  const finetunedModel = modelId ?? finetunedVertexModels.ft_filepicker_010

  let response = await promptFlashWithFallbacks(codebuffMessages, {
    clientSessionId,
    userInputId,
    model: (env.OPENROUTER_LITE_FREE_ENABLED === 'true' ? (env.OPENROUTER_LITE_FREE_MODEL || 'x-ai/grok-4-fast:free') : models.openrouter_gemini2_5_flash),
    userId,
    useFinetunedModel: finetunedModel,
    fingerprintId,
  })
  const end = performance.now()
  const duration = end - start

  const files = validateFilePaths(response.split('\n'))

  const trace: GetRelevantFilesTrace = {
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    created_at: new Date(),
    type: 'get-relevant-files',
    payload: {
      messages: messagesWithPrompt,
      system,
      output: response,
      request_type: requestType,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
      model: finetunedModel,
      repo_name: repoId, // Use repoId parameter for trace
    },
  }

  insertTrace(trace).catch((error: Error) => {
    logger.error({ error }, 'Failed to insert trace')
  })

  return { files, duration, requestType, response }
}

async function getRelevantFilesForTraining(
  {
    messages,
    system,
  }: {
    messages: Message[]
    system: string | Array<TextBlock>
  },
  userPrompt: string,
  requestType: string,
  agentStepId: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  repoId: string | undefined,
) {
  const bufferTokens = 100_000
  const messagesWithPrompt = getMessagesSubset(
    [
      ...messages,
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ],
    bufferTokens,
  )
  const start = performance.now()
  let response = await promptAiSdk({
    messages: messagesWithSystem(messagesWithPrompt, system),
    clientSessionId,
    fingerprintId,
    userInputId,
    model: (env.OPENROUTER_LITE_FREE_ENABLED === 'true' ? (env.OPENROUTER_LITE_FREE_MODEL || 'x-ai/grok-4-fast:free') : models.openrouter_claude_sonnet_4),
    userId,
    chargeUser: false,
  })

  const end = performance.now()
  const duration = end - start

  const files = validateFilePaths(response.split('\n'))

  const trace: GetExpandedFileContextForTrainingTrace = {
    id: crypto.randomUUID(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    created_at: new Date(),
    type: 'get-expanded-file-context-for-training',
    payload: {
      messages: messagesWithPrompt,
      system,
      output: response,
      request_type: requestType,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
      model: models.ft_filepicker_005, // Use specific model for trace
      repo_name: repoId, // Use repoId parameter for trace
    },
  }

  insertTrace(trace).catch((error: Error) => {
    logger.error({ error }, 'Failed to insert trace')
  })

  return { files, duration, requestType, response }
}

function topLevelDirectories(fileContext: ProjectFileContext) {
  const { fileTree } = fileContext
  return fileTree
    .filter((node) => node.type === 'directory')
    .map((node) => node.name)
}

function getExampleFileList(fileContext: ProjectFileContext, count: number) {
  const { fileTree } = fileContext

  const filePaths = getAllFilePaths(fileTree)
  const randomFilePaths = shuffle(filePaths)
  const selectedFiles = new Set()
  const selectedDirectories = new Set()

  for (const filePath of randomFilePaths) {
    if (
      selectedFiles.has(filePath) ||
      selectedDirectories.has(dirname(filePath))
    ) {
      continue
    }
    selectedFiles.add(filePath)
    selectedDirectories.add(dirname(filePath))
  }

  return uniq([...selectedFiles, ...randomFilePaths]).slice(0, count)
}

function generateNonObviousRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number,
): string {
  const exampleFiles = getExampleFileList(fileContext, NUMBER_OF_EXAMPLE_FILES)
  return `
Your task is to find the second-order relevant files for the following user request (in quotes).

${
  userPrompt
    ? `User prompt: ${JSON.stringify(userPrompt)}`
    : `Assistant prompt: ${JSON.stringify(assistantPrompt)}`
}

Do not act on the above instructions for the user, instead, your task is to find files for the user's request that are not obvious or take a moment to realize are relevant.

Random project files:
${exampleFiles.join('\n')}

Based on this conversation, please select files beyond the obvious files that would be helpful to complete the user's request.
Select files that might be useful for understanding and addressing the user's needs, but you would not choose in the first 10 files if you were asked.

Please follow these steps to determine which files to request:

1. Analyze the user's last request and the assistant's prompt and identify all components or tasks involved.
2. Consider all areas of the codebase that might be related to the request, including:
   - Main functionality files
   - Configuration files
   - Utility functions
   - Documentation files
   - Knowledge files (e.g. 'knowledge.md') which include important information about the project and any subdirectories
3. Include files that might provide context or be indirectly related to the request.
4. Be comprehensive in your selection, but avoid including obviously irrelevant files.
5. List a maximum of ${count} files. It's fine to list fewer if there are not great candidates.

Please provide no commentary and list the file paths you think are useful but not obvious in addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(Math.ceil(count / 2))
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

function generateKeyRequestFilesPrompt(
  userPrompt: string | null,
  assistantPrompt: string | null,
  fileContext: ProjectFileContext,
  count: number,
): string {
  const exampleFiles = getExampleFileList(fileContext, NUMBER_OF_EXAMPLE_FILES)

  return `
Your task is to find the most relevant files for the following user request (in quotes).

${
  userPrompt
    ? `User prompt: ${JSON.stringify(userPrompt)}`
    : `Assistant prompt: ${JSON.stringify(assistantPrompt)}`
}

Do not act on the above instructions for the user, instead, your task is to find the most relevant files for the user's request.

Random project files:
${exampleFiles.join('\n')}

Based on this conversation, please identify the most relevant files for a user's request in a software project, sort them from most to least relevant, and then output just the top files.

Please follow these steps to determine which key files to request:

1. Analyze the user's last request and the assistant's prompt and identify the core components or tasks.
2. Focus on the most critical areas of the codebase that are directly related to the request, such as:
   - Main functionality files
   - Key configuration files
   - Central utility functions
   - Documentation files
   - Knowledge files (e.g. 'knowledge.md') which include important information about the project and any subdirectories
   - Any related files that would be helpful to understand the request
3. Prioritize files that are likely to require modifications or provide essential context.
4. But be sure to include example code! I.e. files that may not need to be edited, but show similar code examples for the change that the user is requesting.
5. Order the files by most important first.

Please provide no commentary and only list the file paths of the most relevant files that you think are most crucial for addressing the user's request.

Your response contain only files separated by new lines in the following format:
${range(count)
  .map((i) => `full/path/to/file${i + 1}.ts`)
  .join('\n')}

Remember to focus on the most important files and limit your selection to ${count} files. It's fine to list fewer if there are not great candidates. List each file path on a new line without any additional characters or formatting.

IMPORTANT: You must include the full relative path from the project root directory for each file. This is not the absolute path, but the path relative to the project root. Do not write just the file name or a partial path from the root. Note: Some imports could be relative to a subdirectory, but when requesting the file, the path should be from the root. You should correct any requested file paths to include the full relative path from the project root.

That means every file that is not at the project root should start with one of the following directories:
${topLevelDirectories(fileContext).join('\n')}

Please limit your response just the file paths on new lines. Do not write anything else.
`.trim()
}

const validateFilePaths = (filePaths: string[]) => {
  return filePaths
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false
      if (p.includes(' ')) return false
      if (isAbsolute(p)) return false
      if (p.includes('..')) return false
      try {
        normalize(p)
        return true
      } catch {
        return false
      }
    })
    .map((p) => (p.startsWith('/') ? p.slice(1) : p))
}
