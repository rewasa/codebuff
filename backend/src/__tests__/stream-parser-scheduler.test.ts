import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test'
import type { WebSocket } from 'ws'
import { processStreamWithTools } from '../tools/stream-parser'
import * as toolExecutor from '../tools/tool-executor'

type MinimalAgentTemplate = any

type MinimalProjectFileContext = any

async function* gen(chunks: string[]): AsyncGenerator<string> {
  for (const c of chunks) {
    yield c
  }
}

const ws = { readyState: 1 } as unknown as WebSocket
const agentTemplate: MinimalAgentTemplate = { id: 'test-agent', model: 'test-model' }
const localAgentTemplates: Record<string, any> = {}
const fileContext: MinimalProjectFileContext = { projectRoot: '/', cwd: '/' }

function tag(name: string, payload: Record<string, any> = {}) {
  const json = JSON.stringify({ cb_tool_name: name, ...payload })
  return `\n<codebuff_tool_call>\n${json}\n</codebuff_tool_call>\n`
}

const baseOptions = {
  ws,
  agentStepId: 'step1',
  clientSessionId: 'sess1',
  fingerprintId: 'fp1',
  userInputId: 'in1',
  userId: 'u1',
  repoId: undefined as string | undefined,
  agentTemplate,
  localAgentTemplates,
  fileContext,
  messages: [],
  agentState: { subgoals: {} } as any,
  agentContext: {},
  onResponseChunk: () => {},
  fullResponse: '',
}

let callOrder: string[]

beforeEach(() => {
  callOrder = []
  mock.restore()
  spyOn(toolExecutor, 'executeToolCall').mockImplementation((args: any) => {
    const { toolName, previousToolCallFinished } = args
    callOrder.push(toolName)
    return Promise.resolve(previousToolCallFinished).then(() => Promise.resolve())
  })
})

async function runWithTags(tagsInStreamOrder: string[]) {
  const stream = gen(tagsInStreamOrder)
  const result = await processStreamWithTools({
    ...baseOptions,
    stream,
  })
  return { result, callOrder: [...callOrder] }
}

const WRITE = 'write_file'
const REPLACE = 'str_replace'
const SPAWN = 'spawn_agents'
const SPAWN_INLINE = 'spawn_agent_inline'
const SPAWN_ASYNC = 'spawn_agents_async'
const END = 'end_turn'

describe('processStreamWithTools scheduling', () => {
  it('executes edits immediately and defers spawns and end_turn (edits → spawns → end)', async () => {
    const chunks = [
      tag(WRITE, { path: 'a.ts', content: 'x' }),
      tag(SPAWN, { agents: [] }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([WRITE, SPAWN, END])
  })

  it('edits still run before spawns when spawns appear first in stream', async () => {
    const chunks = [
      tag(SPAWN, { agents: [] }),
      tag(WRITE, { path: 'a.ts', content: 'x' }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([WRITE, SPAWN, END])
  })

  it('multiple spawns are grouped before end_turn and after edits', async () => {
    const chunks = [
      tag(REPLACE, { path: 'b.ts', replacements: [] }),
      tag(SPAWN_INLINE, { agents: [] }),
      tag(SPAWN_ASYNC, { agents: [] }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([REPLACE, SPAWN_INLINE, SPAWN_ASYNC, END])
  })

  it('interleaved edits and spawns: all edits complete before any spawns; end_turn last', async () => {
    const chunks = [
      tag(SPAWN, { agents: [] }),
      tag(WRITE, { path: 'a.ts', content: '1' }),
      tag(SPAWN_INLINE, { agents: [] }),
      tag(REPLACE, { path: 'b.ts', replacements: [] }),
      tag(SPAWN_ASYNC, { agents: [] }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([WRITE, REPLACE, SPAWN, SPAWN_INLINE, SPAWN_ASYNC, END])
  })

  it('no edits: all spawns execute before end_turn maintaining relative order', async () => {
    const chunks = [
      tag(SPAWN_ASYNC, { agents: [] }),
      tag(SPAWN, { agents: [] }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([SPAWN_ASYNC, SPAWN, END])
  })

  it('handles multiple end_turn calls after spawns', async () => {
    const chunks = [
      tag(WRITE, { path: 'a.ts', content: 'x' }),
      tag(END, {}),
      tag(SPAWN, { agents: [] }),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([WRITE, SPAWN, END, END])
  })

  it('only end_turn calls: they are deferred and run in order', async () => {
    const chunks = [
      tag(END, {}),
      tag(END, {}),
    ]
    const { callOrder } = await runWithTags(chunks)
    expect(callOrder).toEqual([END, END])
  })
})
