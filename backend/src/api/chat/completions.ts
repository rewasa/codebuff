import type { Request, Response } from 'express'

const RECONNECT_TIME_MS = 5000

export function completionsStreamHandler(req: Request, res: Response) {
  // Mandatory SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // (optional) allow local browser demos
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Flush the headers immediately
  res.flushHeaders?.()

  // Recommended: send a comment or retry hint right away so the client knows we're live
  res.write(`: connected ${new Date().toISOString()}\n`)
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${new Date().toISOString()}\n`)
  }, 30000)
  res.write(`retry: ${RECONNECT_TIME_MS}\n\n`)

  // Send a few messages, then end
  const messages = ['hello', 'from', 'the', 'server']
  let i = 0

  const timer = setInterval(() => {
    if (i >= messages.length) {
      // End the SSE stream gracefully
      res.write('event: asdf\ndata: bye\n\n')
      clearInterval(timer)
      clearInterval(heartbeat)
      res.end()
      return
    }
    // Each SSE message must end with a blank line
    res.write(`data: ${messages[i++]}\n\n`)
  }, 600)

  // Clean up if the client disconnects
  req.on('close', () => {
    clearInterval(timer)
    clearInterval(heartbeat)
    res.end()
  })
}
