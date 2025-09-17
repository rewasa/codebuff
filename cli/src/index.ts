import {
  Renderer,
  toGraphemeString,
  BACKGROUND_COLOR,
  COLOR,
  COLOR_LIST,
} from '@codebuff/display'

import type { Color, Grapheme, TerminalFrame } from '@codebuff/display'

let displayCharacter = 'x'
let color: Color = COLOR.BLACK

function getFrame(rows: number, columns: number): TerminalFrame {
  const terminalFrame: TerminalFrame = {
    frame: Array.from({ length: rows }).map((_, i) => {
      return Array.from({ length: columns }).map((_, j) => {
        if (i === 0 || i === rows - 1 || j === 0 || j === columns - 1) {
          return {
            grapheme: toGraphemeString(displayCharacter),
            textColor: {
              type: 'color',
              color,
            },
            backgroundColor: {
              type: 'color',
              color: BACKGROUND_COLOR.BG_BLACK,
            },
            textStyles: [],
          } satisfies Grapheme
        }
        return {
          grapheme: toGraphemeString(' '),
          textColor: {
            type: 'color',
            color: COLOR.WHITE,
          },
          backgroundColor: {
            type: 'color',
            color: BACKGROUND_COLOR.BG_BLACK,
          },
        }
      })
    }),
    cursor: {
      row: 1,
      column: 1,
      visible: true,
    },
  }
  return terminalFrame
}

// TODO: pipe the old stdout stuff to a file?
const renderer = new Renderer({ stdout: process.stdout, getFrame })

renderer.start()

for (const newChar of 'H e l l o W o r l d') {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  displayCharacter = newChar
  color = COLOR_LIST[Math.floor(Math.random() * COLOR_LIST.length)]
  renderer.refreshScreen()
}
await new Promise((resolve) => setTimeout(resolve, 1000))

renderer.exit()
