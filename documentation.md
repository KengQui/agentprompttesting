# Agent Studio Development Documentation

## Buildforce-Style Context Management

This document describes how Replit Agent should manage development context using a buildforce-inspired pattern. The goal is to maintain continuity across sessions, prevent context loss, and ensure consistent development practices.

## Overview

The buildforce pattern provides a structured approach to AI agent context management:

1. **Sessions**: Temporary working areas for specific features or tasks
2. **Context**: Persistent knowledge repository that survives across sessions
3. **Workflow**: Structured phases for feature development

## Directory Structure

```
project-root/
├── .replit                    # Replit configuration (can init buildforce here)
├── replit.md                  # Project state and preferences
├── sessions/                  # Active development sessions
│   ├── _index.md              # Session index and status overview
│   ├── {feature}-{date}.md    # Feature-specific sessions
│   └── archive/               # Completed sessions
└── context/                   # Persistent knowledge
    ├── architecture/          # System design decisions
    │   └── decisions.md       # ADR-style decision records
    ├── conventions/           # Code patterns and standards
    │   └── patterns.md        # Reusable patterns
    └── verification/          # Testing and validation
        └── checklist.md       # Quality checks
```

## Session Lifecycle

### 1. Research Phase
- Gather requirements and constraints
- Analyze existing codebase
- Document findings in session file
- Status: `research`

### 2. Plan Phase
- Define approach and architecture
- Break down into tasks
- Identify dependencies and blockers
- Status: `planning`

### 3. Build Phase
- Implement features iteratively
- Update TODOs as work progresses
- Document decisions and changes
- Status: `building`

### 4. Complete Phase
- Review implementation
- Update project documentation
- Archive session or mark complete
- Status: `complete`

## Session File Format

Each session should follow this template:

```markdown
# {Feature Name} Session

**Created**: {YYYY-MM-DD}
**Updated**: {YYYY-MM-DD}
**Status**: research | planning | building | complete

## Objective

Clear description of what this session aims to accomplish.

## Context

- Related sessions: {links to related sessions}
- Reference docs: {links to relevant context files}
- Dependencies: {external dependencies or blockers}

## Decisions Made

Document key decisions with rationale:

1. **Decision**: {What was decided}
   - **Rationale**: {Why this approach}
   - **Alternatives considered**: {Other options}
   - **Date**: {When decided}

## Progress

### Completed
- [x] {Completed task with date}

### In Progress
- [ ] {Current work}

### Pending
- [ ] {Future work}

## Blockers

- {Blocker 1}: {Description and resolution plan}

## Notes

Additional context, code snippets, or references.
```

## Context Repository

The `context/` folder stores persistent knowledge that should be referenced across sessions.

### Architecture Decisions

Store in `context/architecture/`:

```markdown
# ADR-{number}: {Title}

**Date**: {YYYY-MM-DD}
**Status**: proposed | accepted | deprecated | superseded

## Context

{Situation that requires a decision}

## Decision

{The decision made}

## Consequences

{Results of this decision}
```

### Code Conventions

Store in `context/conventions/`:

- Naming conventions
- File organization patterns
- API design standards
- Error handling approaches

### Verification Rules

Store in `context/verification/`:

- Testing requirements
- Quality checklists
- Review criteria

## Integration with .replit

The buildforce workflow can be configured in the `.replit` file:

```toml
[agent]
# Existing integrations
integrations = ["javascript_openai:1.0.0"]

# Buildforce context configuration (future)
[agent.context]
sessions_dir = "sessions"
context_dir = "context"
auto_load_sessions = true
```

## Workflow Rules for Replit Agent

### At Session Start
1. Read `replit.md` for project state
2. Check `sessions/` for active sessions with pending TODOs
3. Review `sessions/_index.md` if it exists
4. Load relevant context from `context/` folder

### During Development
1. Create session file for new features
2. Update session file with decisions and progress
3. Mark TODOs complete as work finishes
4. Document blockers immediately

### At Session End
1. Update all pending TODOs in session file
2. Document any unfinished work
3. Update `replit.md` if project state changed
4. Persist important learnings to `context/`

### Session Handoff
When context window resets:
1. Session files preserve state
2. Next session can continue from where we left off
3. No knowledge is lost between conversations

## Example Workflow

### Starting a New Feature

```markdown
# User Authentication Session

**Created**: 2026-01-28
**Status**: planning

## Objective

Implement user authentication for the Agent Studio platform.

## Decisions Made

1. **Decision**: Use Replit Auth integration
   - **Rationale**: Native integration, handles OAuth automatically
   - **Date**: 2026-01-28

## Progress

### Pending
- [ ] Set up Replit Auth integration
- [ ] Create login/logout UI components
- [ ] Protect agent routes with authentication
- [ ] Add user info to agent ownership

## Notes

Reference: Use search_integrations for "authentication"
```

### Continuing After Context Reset

When returning to this session:
1. Agent reads session file
2. Sees pending TODOs
3. Continues from last checkpoint
4. No need to re-explain requirements

## Benefits

1. **Continuity**: Work persists across context resets
2. **Accountability**: Decisions are documented with rationale
3. **Efficiency**: No repeated discussions about resolved issues
4. **Knowledge**: Important patterns are preserved in context/
5. **Transparency**: User can review session files anytime
