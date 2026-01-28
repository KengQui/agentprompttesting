# Chat Sessions Feature
**Date**: January 28, 2026
**Status**: building

## Objective
Add session management to the chat interface so users can organize conversations into separate sessions per agent. This enables users to track different test scenarios, switch between conversations, and rename sessions for easy identification.

## Requirements
1. Each agent has multiple sessions (conversations)
2. Users can create new sessions (button next to clear chat)
3. Users can switch between sessions via sidebar
4. Sessions are renamable (for labeling test scenarios)
5. Sessions show preview (first message or topic)
6. Sessions display metadata (created date, message count)

## Decisions Made
- Sessions stored per agent in `agents/{id}/sessions.json`
- Each message gets a `sessionId` field to group by session
- Session schema: id, agentId, title, createdAt, updatedAt
- New session button placed next to existing clear chat button in header
- Session sidebar shows on left side of chat interface

## Data Model Changes
```typescript
// New Session schema
sessionSchema = {
  id: string,
  agentId: string, 
  title: string,           // User-editable
  createdAt: string,
  updatedAt: string
}

// Updated ChatMessage schema
chatMessageSchema = {
  id: string,
  agentId: string,
  sessionId: string,       // NEW - links to session
  role: "user" | "assistant",
  content: string,
  timestamp: string
}
```

## API Endpoints
- `POST /api/agents/:id/sessions` - Create new session
- `GET /api/agents/:id/sessions` - List all sessions (with preview)
- `GET /api/agents/:id/sessions/:sessionId` - Get session details
- `PATCH /api/agents/:id/sessions/:sessionId` - Rename session
- `DELETE /api/agents/:id/sessions/:sessionId` - Delete session
- `GET /api/agents/:id/sessions/:sessionId/messages` - Get session messages

## UI Components
1. **SessionSidebar** - Left panel showing all sessions
   - Session cards with title, preview, date, count
   - Inline rename on click
   - Active session highlighted
   - New session button at top

2. **Header Updates**
   - New Session button (Plus icon) next to Clear Chat button

## TODOs
- [x] Create sessions buildforce session file
- [ ] Add Session schema to shared/schema.ts
- [ ] Add sessionId to chatMessageSchema
- [ ] Update storage.ts with session CRUD methods
- [ ] Add session API routes
- [ ] Create SessionSidebar component
- [ ] Update chat.tsx with session management
- [ ] Migrate existing messages to default session
- [ ] Test end-to-end functionality

## Notes
- Existing messages without sessionId need migration to a default session
- When creating a new agent, auto-create first session
- Session title defaults to "New Session" or first message snippet
