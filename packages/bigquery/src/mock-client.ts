// Mock BigQuery client for local development
export class MockBigQuery {
  constructor() {
    console.log('Using MockBigQuery for local development');
  }

  dataset() {
    return {
      get: async () => [{ 
        table: () => ({ 
          get: async () => {},
          insert: async () => {} 
        }) 
      }],
      table: () => ({
        get: async () => {},
        insert: async () => {},
      }),
    }
  }

  async query() {
    return [[]]
  }
}
