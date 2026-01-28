# Architecture Decision Records

## ADR-001: Buildforce-Style Context Management

**Date**: 2026-01-28
**Status**: accepted

### Context

Replit Agent loses context between sessions due to context window limits. We needed a way to persist important decisions, TODOs, and project state.

### Decision

Adopt a buildforce-inspired pattern:
- `sessions/` folder for development sessions
- `context/` folder for persistent knowledge
- Structured workflow: research > plan > build > complete

### Consequences

- Agent can continue work across context resets
- Decisions are documented with rationale
- User has visibility into development progress
- Slightly more overhead for session management

## ADR-002: Multi-File Agent Storage

**Date**: 2026-01-28
**Status**: accepted

### Context

Originally agents were stored in a single `config.yaml` file. This made it difficult to manage individual sections.

### Decision

Split agent storage into multiple files:
- `meta.yaml` - Agent metadata
- `business-use-case.md` - Business use case content
- `domain-knowledge.md` - Domain knowledge
- `validation-rules.yaml` - Validation rules
- `guardrails.yaml` - Guardrails
- `custom-prompt.md` - Custom prompt template
- `domain-documents.json` - Document references
- `sample-data.json` - Sample datasets
- `chat.json` - Chat history

### Consequences

- Better organization and modularity
- Easier to edit individual sections
- More files to manage
- Requires migration for legacy agents
