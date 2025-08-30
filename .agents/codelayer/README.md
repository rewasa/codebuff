# Codelayer Agent Collection

This folder contains the Codelayer collection of specialized agents. Each agent in this collection is designed to work together as part of a cohesive system.

## Agents

- `codelayer-base.ts` - The foundational agent for the Codelayer collection
- `codebase-analyzer.ts` - Analyzes codebase implementation details
- `codebase-locator.ts` - Locates files and directories relevant to features
- `codebase-pattern-finder.ts` - Finds similar implementations and usage patterns
- `thoughts-analyzer.ts` - Analyzes thoughts documents for insights
- `thoughts-locator.ts` - Discovers relevant documents in thoughts/ directory
- `web-search-researcher.ts` - Comprehensive web research specialist

## Getting Started

To use any Codelayer agent:

```bash
codebuff --agent codelayer-base
```

## Purpose

The Codelayer collection is designed to provide specialized functionality for comprehensive codebase analysis, research, and development support. The agents work together to provide deep insights into code structure, patterns, and documentation.

## Adding New Agents

When adding new agents to this collection:

1. Use the publisher: `codelayer`
2. Import shared types from `../types/agent-definition`
3. Update this README with the new agent
4. Follow established naming conventions

Each agent should have a clear, specific purpose within the Codelayer ecosystem.
