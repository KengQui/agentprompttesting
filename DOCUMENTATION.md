# Agent Studio - Complete Documentation

> Last Updated: January 27, 2026

## Table of Contents
1. [Overview](#overview)
2. [Feature Reference](#feature-reference)
3. [Architecture](#architecture)
4. [API Reference](#api-reference)
5. [Chatbot Components](#chatbot-components)
6. [Data Models](#data-models)
7. [Configuration](#configuration)

---

## Overview

Agent Studio is a web application for creating, configuring, and managing AI agents. Users can define business use cases, system prompts, validation rules, and guardrails through an intuitive 5-step wizard interface.

### Key Capabilities
- Create custom AI agents with specific personas and behaviors
- Configure validation rules and guardrails for each agent
- Test agents through an interactive chat interface
- Manage multiple agents from a central dashboard

---

## Feature Reference

### Core Features

| Feature | Description | Location |
|---------|-------------|----------|
| Agent Creation Wizard | 5-step guided process to create new agents | `/create-agent` |
| Agent Dashboard | View and manage all created agents | `/` (home) |
| Chat Interface | Interactive testing environment for agents | `/chat/:agentId` |
| Agent Settings | Edit or delete existing agents | `/settings/:agentId` |

### Chatbot Features (Intermediate)

| Feature | What It Does | Technical Details |
|---------|--------------|-------------------|
| Cancel Response | Click "Cancel" next to the typing indicator to abort AI responses mid-generation | Server stops saving the response via `req.on("close")` detection |
| Character Limit | 2000 character limit with a live counter | Turns yellow at 80% (1600 chars), red when exceeded |
| Rate Limiting | 2-second cooldown between messages | Client-side countdown display prevents spam |
| Context Tracking | Shows message count in the conversation header | Displays "{n} messages in conversation" |
| Topic Detection | Auto-detects conversation topics | Recognizes: Support, Sales, Questions, Feedback, Scheduling, General |
| Better Errors | Specific messages for common issues | Handles: API key issues, rate limits, connection problems |

### Topic Detection Keywords

| Topic | Keywords Detected |
|-------|-------------------|
| Support | help, support, issue, problem, fix |
| Sales | buy, purchase, price, cost, order |
| Questions | how, what, why, explain, tell me |
| Feedback | thanks, thank you, great, awesome |
| Scheduling | schedule, book, appointment, meeting |
| General | Default when no keywords match |

---

## Architecture

### Project Structure

```
agent-studio/
├── client/src/           # Frontend React application
│   ├── pages/            # Page components
│   │   ├── home.tsx      # Agent dashboard
│   │   ├── create-agent.tsx  # 5-step wizard
│   │   ├── chat.tsx      # Chat interface
│   │   └── settings.tsx  # Agent settings
│   ├── components/ui/    # Shadcn UI components
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Utilities and query client
├── server/               # Backend Express application
│   ├── routes.ts         # API endpoints
│   ├── storage.ts        # Data persistence layer
│   └── gemini.ts         # AI integration
├── shared/               # Shared types and schemas
│   └── schema.ts         # Zod schemas and TypeScript types
└── agents/               # Agent data storage
    └── {agent-id}/       # Per-agent folder
        ├── config.yaml   # Agent configuration
        └── chat.json     # Chat history
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | React 18 with TypeScript |
| Styling | Tailwind CSS + Shadcn UI |
| State Management | TanStack Query (React Query) |
| Routing | Wouter |
| Backend | Express.js |
| AI Provider | Google Gemini (via Google AI Studio) |
| Data Storage | YAML/JSON file persistence |
| Validation | Zod schemas |

---

## API Reference

### Agents

#### List All Agents
```
GET /api/agents
```
**Response:** Array of agent objects

#### Get Single Agent
```
GET /api/agents/:id
```
**Response:** Agent object or 404

#### Create Agent
```
POST /api/agents
Content-Type: application/json

{
  "name": "Agent Name",
  "businessUseCase": "Description of what this agent does",
  "description": "Personality and behavior instructions",
  "validationRules": "Rules the agent must follow",
  "guardrails": "Restrictions and boundaries",
  "status": "configured"
}
```
**Response:** Created agent object (201)

#### Update Agent
```
PATCH /api/agents/:id
Content-Type: application/json

{
  "name": "Updated Name"  // Any fields to update
}
```
**Response:** Updated agent object

#### Delete Agent
```
DELETE /api/agents/:id
```
**Response:** 204 No Content

### Messages

#### Get Chat History
```
GET /api/agents/:id/messages
```
**Response:** Array of message objects

#### Send Message
```
POST /api/agents/:id/messages
Content-Type: application/json

{
  "content": "User message (max 2000 characters)"
}
```
**Response:** Array containing the newly created user message and the AI assistant response

**Example Response:**
```json
[
  {
    "id": "uuid-1",
    "agentId": "agent-uuid",
    "role": "user",
    "content": "Hello!",
    "timestamp": "2026-01-27T12:00:00.000Z"
  },
  {
    "id": "uuid-2", 
    "agentId": "agent-uuid",
    "role": "assistant",
    "content": "Hello! How can I help you today?",
    "timestamp": "2026-01-27T12:00:02.000Z"
  }
]
```

**Notes:**
- Server validates message length (max 2000 chars)
- If client disconnects mid-request, server will not save the AI response
- If AI generation fails, returns a fallback message: "I apologize, but I'm having trouble generating a response..."
- API key errors return a specific message about configuration issues

#### Clear Chat History
```
DELETE /api/agents/:id/messages
```
**Response:** 204 No Content

---

## Chatbot Components

### Message Input Area

```
┌─────────────────────────────────────────────────────────┐
│ [Warning if rate limited or over character limit]       │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ ┌─────┐ │
│ │ Type your message...                        │ │ ➤  │ │
│ └─────────────────────────────────────────────┘ └─────┘ │
├─────────────────────────────────────────────────────────┤
│ Press Enter to send, Shift+Enter for new line  45/2000 │
└─────────────────────────────────────────────────────────┘
```

### Typing Indicator (During AI Response)

```
┌──────────────────────────────┐
│ 🤖  ● ● ●    [Cancel]       │
└──────────────────────────────┘
```

### Context Summary Bar

```
┌─────────────────────────────────────────────────────────┐
│ 💬 12 messages in conversation  [Questions]             │
└─────────────────────────────────────────────────────────┘
```

### Character Counter States

| State | Percentage | Color | Action |
|-------|------------|-------|--------|
| Normal | 0-79% | Gray | Send enabled |
| Warning | 80-99% | Yellow | Send enabled |
| Error | 100%+ | Red | Send disabled |

---

## Data Models

### Agent Schema

```typescript
{
  id: string;              // UUID
  name: string;            // Required, min 1 char
  businessUseCase: string; // Required, min 1 char
  description: string;     // Optional, personality/behavior
  validationRules: string; // Optional, rules to follow
  guardrails: string;      // Optional, restrictions
  status: "draft" | "configured" | "active";
  createdAt: string;       // ISO timestamp
  updatedAt: string;       // ISO timestamp
}
```

### Chat Message Schema

```typescript
{
  id: string;              // UUID
  agentId: string;         // Reference to agent
  role: "user" | "assistant";
  content: string;
  timestamp: string;       // ISO timestamp
}
```

---

## Configuration

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini | Yes |

### Design System

| Property | Value |
|----------|-------|
| Primary Color | Purple (#8B5CF6) |
| Theme | Professional tech, dark mode support |
| Primary Font | Inter (sans-serif) |
| Code Font | JetBrains Mono |

---

## Version History

### January 27, 2026 - Intermediate Chatbot Features
- Added cancel response functionality (server-side support)
- Implemented 2000 character limit with visual counter
- Added 2-second rate limiting between messages
- Added context tracking with message count
- Implemented automatic topic detection
- Improved error handling with specific messages

### January 27, 2026 - Initial MVP
- Created agent data model with YAML file persistence
- Implemented 5-step wizard for agent creation
- Built home page with agent cards
- Added settings page for editing/deleting agents
- Created chat interface with Gemini AI integration

---

## Maintenance Notes

This documentation should be updated whenever new features are added to the project. When making changes:

1. Update the **Feature Reference** tables with new capabilities
2. Add new API endpoints to the **API Reference** section
3. Document any new data models or schema changes
4. Add entries to the **Version History** section

*Tip: Ask the development assistant to "update DOCUMENTATION.md" after completing new features.*
