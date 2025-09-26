# n8n Agent Suite - Enhanced Workflow Management

## Overview

The n8n agent suite provides comprehensive workflow management capabilities similar to MCP (Model Context Protocol) implementations. These agents work together to create, update, debug, test, and manage n8n workflows on Railway instances.

## Agent Capabilities

### n8n-mcp-server

**Purpose**: Model Context Protocol (MCP) server for standardized n8n workflow operations

**Key Features**:

- Implements MCP protocol for tool discovery and execution
- Provides standardized JSON-RPC style communication
- Batch operations support
- Event monitoring and streaming
- State persistence and management
- Resource discovery (nodes, credentials, webhooks)

**MCP Tools**:

- `workflows_list`: List workflows with filtering
- `workflow_get`: Get workflow details
- `workflow_create`: Create from definition
- `workflow_update`: Update existing workflow
- `workflow_delete`: Delete workflow
- `workflow_execute`: Execute with data
- `workflow_activate/deactivate`: Control workflow state
- `executions_list`: List executions
- `execution_get`: Get execution details
- `nodes_list`: List available node types
- `credentials_list`: List credentials
- `webhook_register`: Register webhook endpoints
- `webhook_test`: Test webhook functionality
- `batch_operation`: Execute multiple operations

**Usage Examples**:

```bash
# Use MCP server for batch operations
spawn n8n-mcp-server "Execute batch: create 3 workflows, activate them, and test webhooks"

# Node discovery
spawn n8n-mcp-server "List all available trigger nodes"

# Webhook management
spawn n8n-mcp-server "Register webhook /my-endpoint for workflow abc-123"
```

### 1. n8n-workflow-manager

**Purpose**: Complete lifecycle management of n8n workflows

**Key Features**:

- Create workflows from natural language descriptions
- Update existing workflows (add/remove nodes, modify connections)
- Debug workflow executions
- Deploy, activate, and deactivate workflows
- Execute workflows with test data
- Manage workflow versions and backups
- Handle webhook configurations
- Optimize workflow performance

**Input Parameters**:

- `operation`: create, update, delete, list, get, execute, activate, deactivate
- `workflowId`: ID of the workflow to operate on
- `workflowData`: Workflow definition (for create/update)
- `executionData`: Data to execute workflow with

**Usage Examples**:

```bash
# Create a new workflow
spawn n8n-workflow-manager "Create an Instagram DM auto-reply workflow that responds to keyword 'HELP'"

# Update existing workflow
spawn n8n-workflow-manager "Add error handling to workflow ig-dm-auto-reply"

# Debug workflow
spawn n8n-workflow-manager "Debug the failed execution of meta-ads-uploader workflow"
```

### 2. n8n-debugger

**Purpose**: Advanced debugging and troubleshooting of n8n workflows

**Key Features**:

- Analyze failed and successful executions
- Trace data flow through workflow nodes
- Identify performance bottlenecks
- Debug node configurations and connections
- Analyze error patterns and suggest fixes
- Test individual nodes with sample data
- Generate detailed debug reports

**Input Parameters**:

- `executionId`: Specific execution ID to debug
- `workflowId`: Workflow ID to analyze
- `errorType`: node_error, connection_error, auth_error, data_error, timeout
- `debugLevel`: basic, detailed, verbose

**Usage Examples**:

```bash
# Debug specific execution
spawn n8n-debugger "Analyze execution 12345 and find why it failed"

# Debug workflow errors
spawn n8n-debugger "Find all authentication errors in workflow ig-dm-auto-reply"

# Performance analysis
spawn n8n-debugger "Identify performance bottlenecks in meta-ads-uploader workflow"
```

### 3. n8n-api-client

**Purpose**: Direct REST API interactions with n8n instance

**Key Features**:

- Manage workflows (CRUD operations)
- Monitor executions and debug errors
- Handle credentials and variables
- Configure webhook endpoints
- Access node information
- Manage workflow settings

**Input Parameters**:

- `method`: GET, POST, PUT, PATCH, DELETE
- `path`: API path (e.g., /api/v1/workflows)
- `body`: Request body for POST/PUT/PATCH
- `query`: Query parameters
- `headers`: Additional headers
- `format`: json, raw, pretty

**Usage Examples**:

```bash
# List all workflows
spawn n8n-api-client "List all active workflows"

# Get execution details
spawn n8n-api-client "Get details of execution 12345"

# Create new workflow
spawn n8n-api-client "Create workflow from workflow.json file"
```

### 4. n8n-workflow-tester

**Purpose**: Comprehensive testing and validation of n8n workflows

**Key Features**:

- Unit testing individual nodes
- Integration testing with external services
- End-to-end workflow validation
- Performance and stress testing
- Webhook endpoint testing
- Data validation and transformation testing
- Regression testing
- Load testing

**Input Parameters**:

- `workflowId`: Workflow ID or name to test
- `testType`: unit, integration, e2e, performance, stress, validation
- `testData`: Test data to use
- `testCases`: Array of test cases with input/output expectations
- `iterations`: Number of test iterations for performance testing

**Usage Examples**:

```bash
# Test webhook endpoint
spawn n8n-workflow-tester "Test Instagram webhook with sample DM data"

# Performance test
spawn n8n-workflow-tester "Run performance test on meta-ads-uploader with 100 iterations"

# End-to-end test
spawn n8n-workflow-tester "Run e2e test for complete UGC pipeline workflow"
```

## Workflow Templates

The `.agents/n8n-workflow-templates.ts` file provides pre-built templates:

- **Basic Webhook Handler**: Simple webhook endpoint with data processing
- **Scheduled Task**: Cron-based scheduled workflows
- **Error Handler**: Centralized error handling workflow
- **Data Transformation Pipeline**: ETL-style data processing
- **Database Operations**: Database query and batch processing

### Workflow Patterns

- **Retry with Exponential Backoff**: Automatic retry logic with increasing delays
- **Parallel Processing**: Split data into branches for concurrent processing
- **Rate Limiting**: Control request rate to external APIs
- **Error Branching**: Conditional error handling paths

## Common Workflows

### Creating a New Workflow

1. Use `n8n-workflow-manager` to create the workflow structure
2. Use `n8n-workflow-tester` to validate with test data
3. Use `n8n-workflow-manager` to activate the workflow
4. Use `n8n-debugger` if any issues arise

### Updating an Existing Workflow

1. Use `n8n-workflow-manager` to fetch current workflow
2. Make modifications using `n8n-workflow-manager`
3. Use `n8n-workflow-tester` to test changes
4. Use `n8n-workflow-manager` to deploy updates
5. Use `n8n-debugger` to verify execution

### Debugging Failed Executions

1. Use `n8n-debugger` to analyze execution logs
2. Use `n8n-api-client` to get detailed execution data
3. Use `n8n-workflow-tester` to reproduce the issue
4. Use `n8n-workflow-manager` to apply fixes
5. Use `n8n-workflow-tester` to validate the fix

## Best Practices

1. **Always test before deploying**: Use n8n-workflow-tester for comprehensive validation
2. **Version control workflows**: Export workflows to JSON files for backup
3. **Monitor executions**: Regularly check for failed executions using n8n-debugger
4. **Use test data**: Create realistic test datasets for validation
5. **Document workflows**: Add descriptions and comments to workflow nodes
6. **Handle errors gracefully**: Implement error branches and retry logic
7. **Optimize performance**: Use n8n-debugger to identify and fix bottlenecks
8. **Secure credentials**: Use n8n's credential management system

## Environment Configuration

All agents use these environment variables:

- `N8N_API_URL_RAILWAY`: Base URL for n8n instance
- `N8N_API_KEY_RAILWAY`: API key for authentication

## Integration with Other Systems

The n8n agents can work with:

- Instagram API for DM automation
- Meta Ads API for advertising campaigns
- UGC (User Generated Content) pipelines
- Social media publishing platforms
- Webhook-based integrations

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Verify API keys and credentials
2. **Timeout Errors**: Increase timeout settings or add retry logic
3. **Data Format Errors**: Validate JSON structure and field types
4. **Rate Limiting**: Implement delays between API calls
5. **Connection Errors**: Check network connectivity and firewall rules

### Debug Commands

```bash
# Check n8n connectivity
curl "${N8N_API_URL_RAILWAY}/api/v1/workflows" -H "X-N8N-API-KEY: ${N8N_API_KEY_RAILWAY}"

# Get recent errors
tsx n8n-service.ts errors

# Test webhook
tsx n8n-service.ts test-webhook test-endpoint '{"test": "data"}'
```

## MCP Protocol Implementation

The n8n-mcp-server implements the Model Context Protocol for standardized tool execution:

### Request Format

```json
{
  "tool": "workflow_create",
  "data": {
    "name": "My Workflow",
    "nodes": [...],
    "connections": {...}
  }
}
```

### Response Format

```json
{
  "success": true,
  "data": {...},
  "error": null
}
```

### Error Handling

```json
{
  "success": false,
  "error": {
    "code": "workflow_not_found",
    "message": "Workflow with ID xyz not found",
    "retryable": false
  }
}
```

## Future Enhancements

- Visual workflow builder integration
- Automated workflow optimization
- Machine learning-based error prediction
- Advanced performance analytics
- Workflow template marketplace integration
