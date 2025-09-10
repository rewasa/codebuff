import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  HIDE_CURSOR,
  moveCursor,
  SHOW_CURSOR,
} from './ansi'
import {
  diffImageCommands,
  fullImageCommands,
  type GraphemeImage,
} from './grapheme-image'

export type TerminalFrame = {
  frame: GraphemeImage
  cursor?: {
    row: number
    column: number
    visible?: boolean
  }
}

type Stdout = {
  write: (data: string) => unknown
  columns: number
  rows: number
  on: (event: 'resize', listener: () => void) => unknown
  removeListener: (event: 'resize', listener: () => void) => unknown
  isTTY: boolean
}

export type GetFrame = (numRows: number, numColumns: number) => TerminalFrame

export class Renderer {
  stdout: Stdout
  fps: number
  refreshAllFps: number
  getFrame: GetFrame

  private lastFrame: GraphemeImage = [[]]
  private lastRefreshTime: number
  private lastFullRefreshTime: number
  private onResize: () => void = () => {}
  private timer: NodeJS.Timeout | null = null
  private interval: NodeJS.Timeout | null = null
  private inProgress: boolean = false

  constructor({
    stdout,
    fps = 30,
    refreshAllFps = 1,
    getFrame,
  }: {
    stdout: Stdout
    fps?: number
    refreshAllFps?: number
    getFrame: GetFrame
  }) {
    if (!stdout.isTTY) {
      throw new Error('Must be interactive terminal.')
    }

    if (fps <= 0) {
      throw new Error('FPS must be greater than 0')
    }

    if (refreshAllFps <= 0) {
      throw new Error('Refresh all FPS must be greater than 0')
    }

    if (refreshAllFps > fps) {
      throw new Error('Refresh all FPS must be FPS or less')
    }

    this.stdout = stdout
    this.fps = fps
    this.refreshAllFps = refreshAllFps
    this.getFrame = (nRows, nCols) => {
      const frame = getFrame(nRows, nCols)
      if (frame.frame.length !== nRows) {
        throw new Error(`Expected ${nRows} rows: got ${frame.frame.length}`)
      }
      for (const [i, row] of frame.frame.entries()) {
        if (row.length !== nCols) {
          throw new Error(
            `Expected all rows to have ${nCols} columns: got ${row.length} in row ${i}`,
          )
        }
      }
      if (!frame.cursor) {
        return frame
      }
      if (frame.cursor.row >= nRows || frame.cursor.row < 0) {
        throw new Error(`Invalid cursor row: ${frame.cursor.row}`)
      }
      if (frame.cursor.column >= nCols || frame.cursor.column < 0) {
        throw new Error(`Invalid cursor column: ${frame.cursor.column}`)
      }
      return frame
    }

    this.lastRefreshTime = 0
    this.lastFullRefreshTime = 0
    this.inProgress = false
  }

  public start() {
    this.inProgress = true
    this.stdout.write(ENTER_ALT_BUFFER)
    this.onResize = () => {
      this.refreshScreen(false, true)
    }
    this.onResize()
    this.stdout.on('resize', this.onResize)
    this.interval = setInterval(() => {
      this.refreshScreen(false, true)
    }, 1000 / this.refreshAllFps)
  }

  private forceRenderFrame(renderAll: boolean = false) {
    if (this.timer) {
      this.timer.close()
      this.timer = null
    }

    const frame = this.getFrame(this.stdout.rows, this.stdout.columns)

    const now = Date.now()
    // dt / 1000 < 1 / refreshAllFps
    if ((now - this.lastFullRefreshTime) * this.refreshAllFps < 1000) {
      renderAll = true
    }

    const commands = renderAll
      ? fullImageCommands(frame.frame)
      : diffImageCommands(this.lastFrame, frame.frame)
    if (frame.cursor) {
      commands.push(moveCursor(frame.cursor.row, frame.cursor.column))
      commands.push(frame.cursor.visible ?? true ? SHOW_CURSOR : HIDE_CURSOR)
    } else {
      commands.push(HIDE_CURSOR)
    }
    if (renderAll) {
      this.lastFullRefreshTime = Date.now()
    }
    this.lastFrame = frame.frame
    this.stdout.write(commands.join(''))
  }

  public refreshScreen(
    waitForNextFrame: boolean = true,
    renderAll: boolean = false,
  ) {
    if (!this.inProgress) {
      throw new Error(
        'Cannot refresh screen while not in progress. Call start() first.',
      )
    }

    if (!waitForNextFrame) {
      this.forceRenderFrame(renderAll)
      return
    }

    const now = Date.now()
    // dt / 1000 < 1 / fps
    if ((now - this.lastRefreshTime) * this.fps < 1000) {
      this.forceRenderFrame(renderAll)
      return
    }

    this.timer = setTimeout(() => {
      this.forceRenderFrame(renderAll)
    }, now - this.lastRefreshTime)
  }

  public exit() {
    if (this.interval) {
      this.interval.close()
      this.interval = null
    }
    if (this.timer) {
      this.timer.close()
      this.timer = null
    }
    this.stdout.removeListener('resize', this.onResize)
    this.stdout.write(EXIT_ALT_BUFFER)
    this.inProgress = false
  }
}
