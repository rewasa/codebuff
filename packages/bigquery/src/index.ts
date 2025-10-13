// Always use mock implementation for forks (safer default)
// The original client.ts has been renamed to client.ts.disabled
// To re-enable BigQuery, rename client.ts.disabled back to client.ts
// and change the import below to './client'
export * from './client-mock'
export * from './schema'
