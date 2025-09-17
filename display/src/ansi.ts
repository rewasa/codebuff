import { some } from 'lodash'

export const RESET = 'RESET' as const

export const MODIFIER_LIST = [
  'BOLD',
  'DIM',
  'ITALIC',
  'UNDERLINE',
  'BLINK',
  'RAPID_BLINK',
  'REVERSE_VIDEO',
  'HIDDEN',
  'STRIKETHROUGH',
  'DOUBLE_UNDERLINE',
] as const
export type Modifier = (typeof MODIFIER_LIST)[number]
export const MODIFIER = Object.fromEntries(
  MODIFIER_LIST.map((modifier) => [modifier, modifier]),
) as {
  [K in Modifier]: K
}

export const COLOR_LIST = [
  'BLACK',
  'RED',
  'GREEN',
  'YELLOW',
  'BLUE',
  'MAGENTA',
  'CYAN',
  'WHITE',
  'BRIGHT_BLACK',
  'BRIGHT_RED',
  'BRIGHT_GREEN',
  'BRIGHT_YELLOW',
  'BRIGHT_BLUE',
  'BRIGHT_MAGENTA',
  'BRIGHT_CYAN',
  'BRIGHT_WHITE',
] as const
export type Color = (typeof COLOR_LIST)[number]
export const COLOR = Object.fromEntries(
  COLOR_LIST.map((color) => [color, color]),
) as {
  [K in Color]: K
}

export const BACKGROUND_COLOR_LIST = [
  'BG_BLACK',
  'BG_RED',
  'BG_GREEN',
  'BG_YELLOW',
  'BG_BLUE',
  'BG_MAGENTA',
  'BG_CYAN',
  'BG_WHITE',
  'BG_BRIGHT_BLACK',
  'BG_BRIGHT_RED',
  'BG_BRIGHT_GREEN',
  'BG_BRIGHT_YELLOW',
  'BG_BRIGHT_BLUE',
  'BG_BRIGHT_MAGENTA',
  'BG_BRIGHT_CYAN',
  'BG_BRIGHT_WHITE',
] as const
export type BackgroundColor = (typeof BACKGROUND_COLOR_LIST)[number]
export const BACKGROUND_COLOR = Object.fromEntries(
  BACKGROUND_COLOR_LIST.map((color) => [color, color]),
) as {
  [K in BackgroundColor]: K
}

export const STYLES = [
  RESET,
  ...MODIFIER_LIST,
  ...COLOR_LIST,
  ...BACKGROUND_COLOR_LIST,
] as const
export type Style = (typeof STYLES)[number]
export const STYLE = Object.fromEntries(
  STYLES.map((style) => [style, style]),
) as {
  [K in Style]: K
}
const STYLE_CODE = {
  RESET: 0,
  BOLD: 1,
  DIM: 2,
  ITALIC: 3,
  UNDERLINE: 4,
  BLINK: 5,
  RAPID_BLINK: 6,
  REVERSE_VIDEO: 7,
  HIDDEN: 8,
  STRIKETHROUGH: 9,
  DOUBLE_UNDERLINE: 21,
  BLACK: 30,
  RED: 31,
  GREEN: 32,
  YELLOW: 33,
  BLUE: 34,
  MAGENTA: 35,
  CYAN: 36,
  WHITE: 37,
  BG_BLACK: 40,
  BG_RED: 41,
  BG_GREEN: 42,
  BG_YELLOW: 43,
  BG_BLUE: 44,
  BG_MAGENTA: 45,
  BG_CYAN: 46,
  BG_WHITE: 47,
  BRIGHT_BLACK: 90,
  BRIGHT_RED: 91,
  BRIGHT_GREEN: 92,
  BRIGHT_YELLOW: 93,
  BRIGHT_BLUE: 94,
  BRIGHT_MAGENTA: 95,
  BRIGHT_CYAN: 96,
  BRIGHT_WHITE: 97,
  BG_BRIGHT_BLACK: 100,
  BG_BRIGHT_RED: 101,
  BG_BRIGHT_GREEN: 102,
  BG_BRIGHT_YELLOW: 103,
  BG_BRIGHT_BLUE: 104,
  BG_BRIGHT_MAGENTA: 105,
  BG_BRIGHT_CYAN: 106,
  BG_BRIGHT_WHITE: 107,
} as const satisfies Record<Style, number>

export type RGB = [red: number, green: number, blue: number]

export function ansiCode(
  data:
    | { type: 'style'; style: Style }
    | { type: 'text' | 'background'; rgb: RGB },
): string {
  if (data.type === 'style') {
    return `\x1b[${STYLE_CODE[data.style]}m`
  }

  if (some(data.rgb, (v) => v > 255 || v < 0)) {
    throw new Error(
      `RGB values must be between 0 and 255. Got: ${JSON.stringify(data.rgb)}`,
    )
  }

  const first = {
    text: 38,
    background: 48,
  }[data.type]
  return `\x1b[${first};2;${data.rgb[0]};${data.rgb[1]};${data.rgb[2]}m`
}

export function moveCursor(row: number, column: number): string {
  return `\x1b[${row + 1};${column + 1}H`
}

export const HIDE_CURSOR = '\x1b[?25l'
export const SHOW_CURSOR = '\x1b[?25h'
export const ENTER_ALT_BUFFER = '\x1b[?1049h'
export const EXIT_ALT_BUFFER = '\x1b[?1049l'
