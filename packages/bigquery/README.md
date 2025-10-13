# BigQuery Package - Fork Safety

This package provides BigQuery integration for the CodeBuff project. For forks and local development, BigQuery functionality is disabled by default for safety and simplicity.

## Current Status

- **BigQuery is disabled by default** - The package exports mock implementations
- **Original client is preserved** - `client.ts` has been renamed to `client.ts.disabled`
- **No dependencies on Google Cloud** - The mock client has no external dependencies

## For Fork Maintainers

### Default Configuration (Recommended)
By default, this package exports mock implementations that:
- Log debug messages instead of inserting data
- Return empty arrays for queries
- Return `true` for insert operations (indicating "success")

### Enabling BigQuery (Advanced)
If you need real BigQuery functionality:

1. **Rename the client file**:
   ```bash
   mv packages/bigquery/src/client.ts.disabled packages/bigquery/src/client.ts
   ```

2. **Update the index.ts**:
   ```typescript
   // Change this line in packages/bigquery/src/index.ts
   export * from './client'  // instead of './client-mock'
   ```

3. **Set up credentials** and ensure the `@google-cloud/bigquery` dependency is properly configured

### Upstream Updates
When merging updates from upstream:

1. **Always preserve your mock setup** - Don't accept changes to `index.ts` that would re-enable BigQuery
2. **Handle new client.ts** - If upstream adds a new `client.ts`, rename it to `client.ts.disabled`
3. **Update mock if needed** - If upstream adds new functions to the client, add corresponding mock implementations to `client-mock.ts`

## Files Overview

- `index.ts` - Main export (currently exports mock client)
- `client-mock.ts` - Mock implementations (safe for forks)
- `client.ts.disabled` - Original BigQuery client (disabled)
- `schema.ts` - Type definitions (shared by both real and mock clients)

## Environment Variables

- `DISABLE_BIGQUERY=true` - Set in `.envrc` to ensure BigQuery is disabled
- The mock client is used regardless of this setting (for maximum safety)

## Testing

The mock client allows the application to start and run without:
- Google Cloud credentials
- BigQuery project setup
- Network dependencies for BigQuery

All BigQuery operations become no-ops with appropriate logging.