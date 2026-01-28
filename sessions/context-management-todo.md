# Context Management TODO Session

**Created**: January 28, 2026  
**Status**: Active  
**Topic**: Message Threading & Context Window Management

## Discussion Summary

During our conversation, we identified critical gaps in the current chat system:

### Current Issues
1. **chat.json stores ALL messages** - No limit, no pruning. Every message is persisted indefinitely.
2. **No context window management** - Entire chat history is sent to Gemini with each request.
3. **No context drift handling** - Neither Gemini, Replit, nor custom logic manages conversation drift.

### Buildforce-CLI Pattern Analysis
We analyzed the buildforce-cli repository (https://github.com/berserkdisruptors/buildforce-cli) and identified their session/context management approach:

1. **Sessions folder** (`.buildforce/sessions/`):
   - Contains named session folders like `{feature-name}-{timestamp}`
   - Each session has: `spec.yaml`, `plan.yaml`, `research.yaml`
   - Tracks workflow: research → plan → build → complete

2. **Context folder** (`.buildforce/context/`):
   - Persistent knowledge repository
   - Organized by category: `architecture/`, `conventions/`, `verification/`
   - Has `_index.yaml` to track all context entries

3. **Key Concepts**:
   - Context persists across sessions in version-controlled files
   - Sessions are temporary working areas for specific tasks
   - Accumulated knowledge prevents "amnesic" behavior
   - Deviation tracking logs when implementation differs from plan

## Implemented Solution

### Session Schema (shared/schema.ts)
- `SessionMeta`: id, agentId, name, status, topic, intent, messageCount, totalTokens
- `SessionMessage`: Extended from ChatMessage with tokenCount, summarized flag
- `ContextSummary`: Summarized older messages with messageRange, topics, keyDecisions
- `SessionTodo`: Task tracking with id, content, status, priority
- `SessionContext`: What gets sent to LLM (recentMessages + summarizedContext + activeTodos)
- `SessionConfig`: maxMessagesInContext, maxTokensInContext, summarizationThreshold

### Session Manager (server/components/session-manager.ts)
- Creates/loads sessions from `agents/{id}/sessions/{sessionId}/`
- Each session has: meta.yaml, messages.json, summaries.json, todos.json
- Sliding window: keeps last N messages in context
- Auto-summarization when messages exceed threshold
- TODO tracking within sessions

### API Endpoints
- `GET /api/agents/:id/sessions` - List all sessions
- `GET /api/agents/:id/sessions/active` - Get or create active session
- `POST /api/agents/:id/sessions` - Create new session
- `GET /api/agents/:agentId/sessions/:sessionId` - Get specific session
- `GET /api/agents/:agentId/sessions/:sessionId/context` - Get context for LLM
- `POST /api/agents/:agentId/sessions/:sessionId/messages` - Add message
- `GET/POST/PATCH /api/agents/:agentId/sessions/:sessionId/todos` - TODO management
- `POST /api/agents/:agentId/sessions/:sessionId/archive` - Archive session

## Remaining TODOs

### High Priority
- [ ] Integrate session context into the main chat API (replace old chat.json loading)
- [ ] Add AI-powered summarization using Gemini for older messages
- [ ] Implement topic/intent detection for conversations

### Medium Priority
- [ ] Create UI for viewing session history and TODOs
- [ ] Add session switching in the chat interface
- [ ] Implement session export/import functionality

### Low Priority
- [ ] Add metrics dashboard for token usage per session
- [ ] Implement session archival policies (auto-archive old sessions)
- [ ] Add cross-session knowledge persistence (like buildforce's context repository)

## Configuration

Default session configuration:
```typescript
{
  maxMessagesInContext: 20,      // Keep last 20 messages
  maxTokensInContext: 8000,      // Token limit for context
  summarizationThreshold: 15,    // Summarize after 15+ messages
  autoSummarize: true            // Auto-summarize older messages
}
```
