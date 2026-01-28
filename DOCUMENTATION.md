# Agent Studio - Complete Documentation

> Last Updated: January 28, 2026

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

Agent Studio is a web application for creating, configuring, and managing AI agents. Users can define business use cases, domain knowledge, validation rules, guardrails, sample datasets, and system prompts through an intuitive 7-step wizard interface.

### Key Capabilities
- Create custom AI agents with specific personas and behaviors
- Upload domain knowledge documents to inform agent responses
- Configure validation rules and guardrails with AI assistance
- Smart context evaluation with clarifying questions
- Guardrail conflict detection with recovery manager
- Upload or generate sample datasets for training context
- Choose between multiple AI prompt styles (Anthropic, Gemini, OpenAI)
- Select AI models for generation (Gemini 2.5/3 Flash and Pro variants)
- Test agents through an interactive chat interface
- Manage multiple agents from a central dashboard

---

## Feature Reference

### Core Features

| Feature | Description | Location |
|---------|-------------|----------|
| Agent Creation Wizard | 7-step guided process (Business Use Case, Agent Name, Domain Knowledge, Validation Rules, Guardrails, Sample Data, Review & Prompt) | `/create-agent` |
| Agent Dashboard | View and manage all created agents | `/` (home) |
| Chat Interface | Interactive testing environment for agents | `/chat/:agentId` |
| Agent Settings | Edit or delete existing agents | `/settings/:agentId` |

### AI Generation Features

| Feature | What It Does | Technical Details |
|---------|--------------|-------------------|
| Smart Context Evaluation | AI evaluates if there's enough context before generating | Opens clarifying dialog when business use case is too minimal |
| Clarifying Questions | Multi-turn Q&A to gather missing information | Collects insights about inputs, outputs, constraints, policies |
| Model Selection | Choose which Gemini model to use for generation | Gemini 2.5 Flash, 2.5 Pro (default), 3 Flash, 3 Pro |
| Validation Rules Generation | AI generates validation rules based on agent context | Uses business use case, domain knowledge, and gathered insights |
| Guardrails Generation | AI generates guardrails based on agent context | Same context as validation rules |
| System Prompt Generation | AI creates prompts in your chosen style | Anthropic (XML), Gemini (Markdown), OpenAI (Bold emphasis) |

### Domain Knowledge & Sample Data

| Feature | What It Does | Technical Details |
|---------|--------------|-------------------|
| Domain Knowledge Input | Text area for typing domain-specific information | Included in AI system prompt |
| Document Upload | Upload .txt, .md, .csv, .json files (up to 5MB each) | Files stored per-agent and included in prompts |
| Sample Data Upload | Upload CSV, JSON, or text datasets (up to 5MB) | Stored in agent configuration |
| Sample Data Generation | AI generates sample datasets | Configure type, count (1-100), format |

### Recovery Manager & Conflict Detection

| Feature | What It Does | Technical Details |
|---------|--------------|-------------------|
| Guardrail Conflict Detection | Validates guardrails against recovery rules | Real-time warnings (debounced 1s) |
| Conflict Types | Error, Warning, Info levels | Each includes actionable suggestions |
| Escalation Detection | Detects when human support is needed | User request, out-of-scope, sensitive topics, low confidence |

### Chatbot Features

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
├── personality-prompt.txt  # Platform-wide chatbot personality (edit this!)
├── client/src/             # Frontend React application
│   ├── pages/              # Page components
│   │   ├── home.tsx        # Agent dashboard
│   │   ├── create-agent.tsx  # 7-step wizard
│   │   ├── chat.tsx        # Chat interface
│   │   └── settings.tsx    # Agent settings
│   ├── components/
│   │   ├── ui/             # Shadcn UI components
│   │   └── ClarifyingChatDialog.tsx  # Context gathering dialog
│   ├── hooks/              # Custom React hooks
│   └── lib/
│       ├── queryClient.ts  # TanStack Query setup
│       └── prompt-preview.ts  # Prompt style generation
├── server/                 # Backend Express application
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Data persistence layer
│   ├── gemini.ts           # AI integration
│   └── components/         # Server components
│       └── recovery-manager.ts  # Error recovery & escalation
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Zod schemas and TypeScript types
└── agents/                 # Agent data storage
    └── {agent-id}/         # Per-agent folder
        ├── config.yaml     # Agent configuration
        ├── chat.json       # Chat history
        └── components/     # Per-agent turn management
            ├── turn-manager.ts
            ├── flow-controller.ts
            ├── state-manager.ts
            └── orchestrator.ts
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
  "domainKnowledge": "Domain-specific information",
  "validationRules": "Rules the agent must follow",
  "guardrails": "Restrictions and boundaries",
  "promptStyle": "anthropic" | "gemini" | "openai" | "custom",
  "customPrompt": "Custom system prompt (if promptStyle is custom)",
  "sampleDatasets": [],
  "clarifyingInsights": [],
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
    "timestamp": "2026-01-28T12:00:00.000Z"
  },
  {
    "id": "uuid-2", 
    "agentId": "agent-uuid",
    "role": "assistant",
    "content": "Hello! How can I help you today?",
    "timestamp": "2026-01-28T12:00:02.000Z"
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

### Document & Data Upload

#### Upload Domain Knowledge Document
```
POST /api/upload-document
Content-Type: multipart/form-data

file: (binary file, .txt/.md/.csv/.json, max 5MB)
```
**Response:** `{ content: "file contents as string" }`

#### Upload Sample Data
```
POST /api/upload-sample-data
Content-Type: multipart/form-data

file: (binary file, CSV/JSON/text, max 5MB)
```
**Response:** Sample dataset object

### AI Generation

#### Evaluate Context Sufficiency
```
POST /api/generate/evaluate-context
Content-Type: application/json

{
  "businessUseCase": "Description of agent's purpose",
  "domainKnowledge": "Domain information (optional)"
}
```
**Response:** `{ sufficient: boolean, missingAreas: string[] }`

#### Clarifying Chat (Multi-turn Q&A)
```
POST /api/generate/clarifying-chat
Content-Type: application/json

{
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "previousInsights": [],
  "userMessage": "User's answer to clarifying question"
}
```
**Response:** `{ response: "Next question or confirmation", complete: boolean }`

#### Generate Validation Rules
```
POST /api/generate/validation-rules
Content-Type: application/json

{
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "model": "gemini-2.5-pro"  // Optional, defaults to gemini-2.5-pro
}
```
**Response:** `{ validationRules: "Generated rules text" }`

#### Generate Validation Rules with Insights
```
POST /api/generate/validation-rules-with-insights
Content-Type: application/json

{
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "clarifyingInsights": [{ question, answer, category }],
  "model": "gemini-2.5-pro"
}
```
**Response:** `{ validationRules: "Generated rules incorporating insights" }`

#### Generate Guardrails
```
POST /api/generate/guardrails
Content-Type: application/json

{
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "validationRules": "Rules text",
  "model": "gemini-2.5-pro"
}
```
**Response:** `{ guardrails: "Generated guardrails text" }`

#### Generate Guardrails with Insights
```
POST /api/generate/guardrails-with-insights
Content-Type: application/json

{
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "validationRules": "Rules text",
  "clarifyingInsights": [{ question, answer, category }],
  "model": "gemini-2.5-pro"
}
```
**Response:** `{ guardrails: "Generated guardrails incorporating insights" }`

#### Generate Sample Data
```
POST /api/generate/sample-data
Content-Type: application/json

{
  "businessUseCase": "Description",
  "dataType": "customer records",
  "recordCount": 10,
  "format": "json",
  "model": "gemini-2.5-pro"
}
```
**Response:** Sample dataset object with generated content

#### Generate System Prompt
```
POST /api/generate/system-prompt
Content-Type: application/json

{
  "name": "Agent Name",
  "businessUseCase": "Description",
  "domainKnowledge": "Domain info",
  "validationRules": "Rules",
  "guardrails": "Guardrails",
  "promptStyle": "anthropic" | "gemini" | "openai"
}
```
**Response:** `{ prompt: "Generated system prompt in chosen style" }`

### Validation

#### Check Guardrail Conflicts
```
POST /api/validate/guardrail-conflicts
Content-Type: application/json

{
  "guardrails": "Guardrails text to validate"
}
```
**Response:** Array of conflict objects
```json
[
  {
    "type": "error" | "warning" | "info",
    "message": "Description of the conflict",
    "suggestion": "How to resolve it"
  }
]
```

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
  id: string;                    // UUID
  name: string;                  // Required, min 1 char
  businessUseCase: string;       // Required, min 1 char
  domainKnowledge: string;       // Optional, domain-specific info
  validationRules: string;       // Optional, rules to follow
  guardrails: string;            // Optional, restrictions
  promptStyle: "anthropic" | "gemini" | "openai" | "custom";
  customPrompt: string;          // Optional, custom system prompt
  sampleDatasets: SampleDataset[];  // Optional, uploaded/generated datasets
  clarifyingInsights: ClarifyingInsight[];  // Optional, gathered Q&A insights
  status: "draft" | "configured" | "active";
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}
```

### Sample Dataset Schema

```typescript
{
  id: string;           // UUID
  name: string;         // Dataset name
  description: string;  // Optional description
  content: string;      // The actual data content
  format: string;       // "json" | "csv" | "text"
  isGenerated: boolean; // true if AI-generated, false if uploaded
  createdAt: string;    // ISO timestamp
}
```

### Clarifying Insight Schema

```typescript
{
  question: string;    // The clarifying question asked
  answer: string;      // User's answer
  category: string;    // Category: inputs, outputs, constraints, policies, data_types
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

### Guardrail Conflict Schema

```typescript
{
  type: "error" | "warning" | "info";
  message: string;      // Description of the conflict
  suggestion: string;   // How to resolve it
}
```

---

## Configuration

### Chatbot Personality (Platform Owner)

The chatbot's personality is controlled by the **platform owner** (you), not by individual admins or agents.

**To change the chatbot's personality:**
1. Open `personality-prompt.txt` in the project root
2. Edit the text to define how your chatbot should behave
3. Save the file - changes take effect immediately

**Example content:**
```
You are a helpful, friendly, and professional AI assistant.

Be conversational and approachable while maintaining accuracy.
Always aim to provide clear, concise, and helpful responses.
If you're unsure about something, be honest about your limitations.
```

> **Note:** This personality applies to all agents. Individual agents can still have their own business use case, domain knowledge, validation rules, and guardrails - but the core personality is shared.

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini | Yes |

### AI Models Available

| Model ID | Display Name | Notes |
|----------|--------------|-------|
| `gemini-2.5-flash` | Gemini 2.5 Flash | Fast responses |
| `gemini-2.5-pro` | Gemini 2.5 Pro | Default, balanced |
| `gemini-3-flash-preview` | Gemini 3 Flash | Preview, fast |
| `gemini-3-pro-preview` | Gemini 3 Pro | Preview, most capable |

### Design System

| Property | Value |
|----------|-------|
| Primary Color | Purple (#8B5CF6) |
| Theme | Professional tech, dark mode support |
| Primary Font | Inter (sans-serif) |
| Code Font | JetBrains Mono |

---

## Version History

### January 28, 2026 - Smart Generation with Clarifying Questions
- AI evaluates context sufficiency before generating validation rules or guardrails
- Opens conversational dialog when context is insufficient
- Multi-turn Q&A to gather missing information (inputs, outputs, constraints, policies, data types)
- Gathered insights stored in agent configuration
- Split button design: main button generates with default model, dropdown for model selection
- New API endpoints for context evaluation and clarifying chat
- New ClarifyingChatDialog component

### January 28, 2026 - Recovery Manager & Guardrail Conflict Detection
- New RecoveryManager class for error recovery and escalation
- Detects when escalation to human support is needed
- Validates guardrails against recovery rules for conflicts
- Real-time conflict warnings in Guardrails step (debounced 1s)
- Conflict types: error, warning, info with actionable suggestions

### January 28, 2026 - Sample Data Upload and Generation
- New Sample Data step (Step 6) in the creation wizard
- Upload sample datasets (CSV, JSON, text up to 5MB)
- AI-powered sample data generation with customizable options
- Model selection for generation
- Wizard now has 7 steps

### January 28, 2026 - Prompt Style Default Change
- "Write Your Own" is now the default prompt style
- Users start with a blank prompt textarea
- Prompt generation only happens when selecting another style

### January 27, 2026 - Model Selection for AI Generation
- Dropdown menu for Generate buttons
- Choose between Gemini 2.5 Flash, 2.5 Pro, 3 Flash, 3 Pro
- Available in both wizard and settings page

### January 27, 2026 - AI-Powered System Prompt Generation
- Gemini generates custom system prompts based on selected style
- Incorporates all agent configuration into the prompt
- Loading state and regenerate functionality
- Auto-regenerates when configuration changes

### January 27, 2026 - Prompt Style Selector
- Choose between Anthropic, Gemini, and OpenAI prompt styles
- Each style follows provider's best practices
- Preview and edit prompts before creating agent
- "Learn more" popup with detailed explanations

### January 27, 2026 - Domain Knowledge Feature
- New Domain Knowledge step (Step 3) in wizard
- Type domain knowledge or upload documents
- Supported file types: .txt, .md, .csv, .json (up to 5MB)

### January 27, 2026 - Per-Agent Turn Management
- Modular component architecture for conversation flow
- Keyword-based intent detection with LLM fallback
- Supported intents: answer_question, go_back, change_previous_answer, request_clarification

### January 27, 2026 - Platform-Controlled Personality
- Moved chatbot personality to `personality-prompt.txt` file
- Platform owner can edit personality without touching code
- Personality is shared across all agents

### January 27, 2026 - Intermediate Chatbot Features
- Cancel response functionality (server-side support)
- 2000 character limit with visual counter
- 2-second rate limiting between messages
- Context tracking with message count
- Automatic topic detection
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
