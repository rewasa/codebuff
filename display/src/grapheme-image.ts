import GraphemeSplitter from 'grapheme-splitter'
import { isEqual } from 'lodash'
import stringWidth from 'string-width'
import stripAnsi from 'strip-ansi'

import {
  type Color,
  type BackgroundColor,
  type RGB,
  type Modifier,
  ansiCode,
  moveCursor,
} from './ansi'

export const BLANK_GRAPHEME = ' ' as $GraphemeString
type $GraphemeString = string & { readonly _brand: 'GraphemeString' }

export type Grapheme = {
  grapheme: $GraphemeString
  textColor?: { type: 'color'; color: Color } | { type: 'rgb'; rgb: RGB }
  backgroundColor?:
    | { type: 'color'; color: BackgroundColor }
    | { type: 'rgb'; rgb: RGB }
  textStyles?: Modifier[]
}

const splitter = new GraphemeSplitter()

export function toGraphemeString(grapheme: string): $GraphemeString {
  const stripped = stripAnsi(grapheme)
  const numGraphemes = splitter.countGraphemes(stripped)
  if (numGraphemes === 0) {
    return BLANK_GRAPHEME
  }

  const first = splitter.iterateGraphemes(stripped).next()
    .value as $GraphemeString
  if (stringWidth(first) < 1) {
    return BLANK_GRAPHEME
  }
  return first
}

function equalStyles(a: Grapheme, b: Grapheme): boolean {
  type GraphemeStyle = Omit<Grapheme, 'grapheme'> &
    Partial<Pick<Grapheme, 'grapheme'>>
  const aStyles: GraphemeStyle = { ...a }
  delete aStyles.grapheme
  const bStyles: GraphemeStyle = { ...b }
  delete bStyles.grapheme
  return isEqual(aStyles, bStyles)
}

function graphemeCommands(grapheme: Grapheme): string[] {
  const commands: string[] = []
  if (grapheme.textColor) {
    commands.push(
      ansiCode(
        grapheme.textColor.type === 'color'
          ? {
              type: 'style',
              style: grapheme.textColor.color,
            }
          : {
              type: 'text',
              rgb: grapheme.textColor.rgb,
            },
      ),
    )
  }
  if (grapheme.backgroundColor) {
    commands.push(
      ansiCode(
        grapheme.backgroundColor.type === 'color'
          ? {
              type: 'style',
              style: grapheme.backgroundColor.color,
            }
          : {
              type: 'text',
              rgb: grapheme.backgroundColor.rgb,
            },
      ),
    )
  }

  if (grapheme.textStyles) {
    for (const style of grapheme.textStyles) {
      commands.push(ansiCode({ type: 'style', style }))
    }
  }

  commands.push(grapheme.grapheme)

  return commands
}

function graphemeDiffCommands(
  prevGrapheme: Grapheme | null,
  newGrapheme: Grapheme,
): string[] {
  if (!prevGrapheme) {
    return graphemeCommands(newGrapheme)
  }

  if (equalStyles(prevGrapheme, newGrapheme)) {
    return [newGrapheme.grapheme]
  }

  return [
    ...ansiCode({ type: 'style', style: 'RESET' }),
    ...graphemeCommands(newGrapheme),
  ]
}

export type GraphemeImage = Grapheme[][]

export function fullImageCommands(image: GraphemeImage): string[] {
  const commands: string[] = [moveCursor(0, 0)]

  let lastGrapheme: Grapheme | null = null
  for (const row of image) {
    for (const grapheme of row) {
      commands.push(...graphemeDiffCommands(lastGrapheme, grapheme))
      lastGrapheme = grapheme
    }
  }

  return commands
}

export function diffImageCommands(
  oldImage: GraphemeImage,
  newImage: GraphemeImage,
): string[] {
  if (oldImage.length !== newImage.length) {
    return fullImageCommands(newImage)
  }
  if (oldImage[0].length !== newImage[0].length) {
    return fullImageCommands(newImage)
  }

  const commands: string[] = []
  let prevGrapheme: Grapheme | null = null
  let skipped = false
  for (const [r, row] of oldImage.entries()) {
    const oldRow = oldImage[r]
    for (const [c, grapheme] of row.entries()) {
      const oldGrapheme = oldRow[c]
      if (isEqual(grapheme, oldGrapheme)) {
        skipped = true
        continue
      }

      if (skipped) {
        commands.push(moveCursor(r, c))
        skipped = false
      }

      commands.push(...graphemeDiffCommands(prevGrapheme, grapheme))
      prevGrapheme = grapheme
    }
  }
  return commands
}
