// Simple console logger for mock client (no dependency on other packages)
const logger = {
  debug: (obj: any, msg?: string) => console.log('DEBUG:', msg || obj),
  info: (obj: any, msg?: string) => console.log('INFO:', msg || obj),
  warn: (obj: any, msg?: string) => console.warn('WARN:', msg || obj),
  error: (obj: any, msg?: string) => console.error('ERROR:', msg || obj),
}
import type { BaseTrace, GetRelevantFilesTrace, Relabel, Trace } from './schema'

/**
 * Mock BigQuery client that provides no-op implementations of all BigQuery functions
 * This allows the application to run without BigQuery dependency
 */
export class MockBigQueryClient {
  async setupBigQuery(dataset?: string) {
    logger.debug('BigQuery disabled - using mock client')
    return Promise.resolve()
  }
}

// Mock implementations of all exported functions
export async function setupBigQuery(dataset?: string) {
  logger.debug('BigQuery disabled - setupBigQuery is a no-op')
  return Promise.resolve()
}

export async function insertTrace(params: { trace: Trace; logger?: any; dataset?: string }): Promise<boolean> {
  logger.debug({ traceId: params.trace.id, type: params.trace.type }, 'BigQuery disabled - insertTrace is a no-op')
  return Promise.resolve(true)
}

// Legacy signature support (single trace parameter)
export async function insertTraceLegacy(trace: Trace, dataset?: string): Promise<boolean> {
  logger.debug({ traceId: trace.id, type: trace.type }, 'BigQuery disabled - insertTrace is a no-op')
  return Promise.resolve(true)
}

export async function insertRelabel(relabel: Relabel, dataset?: string): Promise<boolean> {
  logger.debug({ relabelId: relabel.id }, 'BigQuery disabled - insertRelabel is a no-op')
  return Promise.resolve(true)
}

export async function getRecentTraces(limit: number = 10, dataset?: string): Promise<Trace[]> {
  logger.debug({ limit }, 'BigQuery disabled - getRecentTraces returns empty array')
  return Promise.resolve([])
}

export async function getRecentRelabels(limit: number = 10, dataset?: string): Promise<Relabel[]> {
  logger.debug({ limit }, 'BigQuery disabled - getRecentRelabels returns empty array')
  return Promise.resolve([])
}

export async function getTracesWithoutRelabels(
  model: string,
  limit: number = 100,
  userId?: string,
  dataset?: string,
): Promise<GetRelevantFilesTrace[]> {
  logger.debug({ model, limit, userId }, 'BigQuery disabled - getTracesWithoutRelabels returns empty array')
  return Promise.resolve([])
}

export async function getTracesWithRelabels(
  model: string,
  limit: number = 100,
  dataset?: string,
): Promise<{ trace: GetRelevantFilesTrace; relabel: Relabel }[]> {
  logger.debug({ model, limit }, 'BigQuery disabled - getTracesWithRelabels returns empty array')
  return Promise.resolve([])
}

export async function getTracesAndRelabelsForUser(
  userId?: string,
  limit: number = 50,
  cursor?: string,
  dataset?: string,
  joinType: 'INNER' | 'LEFT' = 'LEFT',
) {
  logger.debug({ userId, limit, cursor, joinType }, 'BigQuery disabled - getTracesAndRelabelsForUser returns empty array')
  return Promise.resolve([])
}

export interface TraceBundle {
  trace: GetRelevantFilesTrace
  relatedTraces: BaseTrace[]
  relabels: Relabel[]
}

export async function getTracesAndAllDataForUser(
  userId?: string,
  limit = 50,
  pageCursor?: string,
  dataset?: string,
): Promise<TraceBundle[]> {
  logger.debug({ userId, limit, pageCursor }, 'BigQuery disabled - getTracesAndAllDataForUser returns empty array')
  return Promise.resolve([])
}

export async function insertMessage(params: { row: any; logger?: any }): Promise<boolean> {
  logger.debug({ messageId: params.row.id }, 'BigQuery disabled - insertMessage is a no-op')
  return Promise.resolve(true)
}
