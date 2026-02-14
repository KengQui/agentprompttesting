# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application for the end-to-end creation, configuration, and management of AI agents. It provides an intuitive wizard interface for users to define essential AI agent parameters such as business use cases, domain knowledge, validation rules, guardrails, sample datasets, and simulated actions. The platform aims to streamline the development and deployment of tailored AI agents for various business needs, offering capabilities like AI-powered "Prompt Coach," automated topic switch detection, and direct action execution for realistic testing of agent workflows. The project's vision is to enable businesses to easily create and deploy highly customized AI agents, increasing efficiency and automating complex tasks.

## User Preferences
- Using Google Gemini AI via Google AI Studio (API key authentication mode)
- Requires GEMINI_API_KEY secret to be configured
- GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION secrets are also stored but not currently used
- Prompt generation uses only Google Gemini style (standardized)
- Test Login Credentials: Username: `kengqui.chia@ukg.com` / Password: `123456`

## System Architecture
Agent Studio utilizes a modern web application architecture with a clear separation between frontend and backend.

### Frontend
- **Tech Stack**: React, TypeScript, TanStack Query, Wouter, Tailwind CSS, Shadcn UI.
- **UI/UX**: Professional tech theme with dark mode, Inter for sans-serif fonts, JetBrains Mono for code. Primary color scheme is purple (#8B5CF6).
- **Core Features**:
    - **Agent Creation Wizard**: A 10-step process for defining agent parameters, including: Business Use Case, Agent Name, Domain Knowledge, Validation Rules, Guardrails, Sample Data, Available Actions (for simulation), Validation Checklist (16 automated checks with auto-fix), Agent Prompt, and Welcome Screen (AI-generated greeting and suggested prompts).
    - **Chat Interface**: For testing agents, featuring multiple renamable sessions, a collapsible session sidebar, a context progress bar, and the ability to cancel AI responses.
    - **Agent Management**: Pages for listing, editing, and deleting agents.
    - **AI-Powered Prompt Generation**: System prompts are automatically generated using Google Gemini AI, curating domain knowledge, embedding validation rules, enforcing guardrails, and determining output formats based on the use case.
    - **Smart Generation**: AI evaluates context and asks clarifying questions for generating validation rules or guardrails.
    - **Smart Content Extractor**: Automatically extracts business case information from uploaded domain documents.
    - **Prompt Coach**: An AI-powered chatbot that analyzes agent configuration and suggests improvements through conversational interaction, with "Apply" buttons to update the configuration directly.

### Backend
- **Tech Stack**: Node.js, Express.js.
- **Core Features**:
    - **Agent API**: CRUD operations for agents, chat messages, and session management.
    - **Document Upload API**: For handling domain knowledge documents.
    - **AI Generation APIs**: Endpoints for generating system prompts, validation rules, guardrails, and sample data using Google Gemini.
    - **Recovery Manager**: Handles error recovery and guardrail conflict detection.
    - **Turn Management**: Modular, per-agent component architecture for intent detection and conversational flow.
    - **Enhanced Prompt Processing**: Uses placeholder markers (`{{MARKER_NAME}}`) for dynamic content replacement.
    - **Flow Mode Detection**: Orchestrator automatically detects "infer-first" or "ask-first" conversation flow based on the agent's custom prompt.
    - **Action Simulation**: Allows AI agents to execute actions directly by outputting special action blocks, updating mock user state without connecting to real APIs.

### Authentication System
- **User Authentication**: Username/password registration with bcrypt hashing.
- **Session Management**: Cookie-based sessions with 7-day expiration.
- **Password Reset**: Username-only verification for password reset.
- **Agent Isolation**: Each user can only manage their own agents.
- **Protected Routes**: All agent-related routes enforce ownership verification.
- **Data Persistence**: Users stored in `/users/users.json`.

### Agent Component Templates
- **Template System**: Agent components (TurnManager, FlowController, Orchestrator) are generated from templates in `/server/templates/agent-components/`. When a new agent is created, these templates are copied to `/agents/{agent-id}/components/` with placeholders replaced. New features for agent components **MUST** be added to the corresponding template files.

### Data Persistence
- **Agent Configuration**: Stored in dedicated folders (`/agents/{agent-id}/`) with a multi-file structure (e.g., `meta.yaml`, `business-use-case.md`, `validation-rules.yaml`, `custom-prompt.md`, `available-actions.json`).
- **Per-Session Message Storage**: Chat messages stored in individual session files (`/agents/{agent-id}/sessions/{session-id}/messages.json`) for independent experiment threads and session isolation.
- **In-memory storage**: Utilizes nested Maps for transient data, persisted to YAML/JSON files.

### Prompt Coach (Detailed)
The Prompt Coach is an AI-powered chatbot that helps users improve their agent configurations through conversational interaction.

**Frontend**: `client/src/components/prompt-coach.tsx` (431 lines)
- Renders as a collapsible panel in the agent wizard sidebar
- Components: `PromptCoachTrigger` (toggle button) and `PromptCoach` (main chat panel)
- Shows AI messages with embedded "Apply" buttons for suggested changes
- Tracks which suggestions have been applied via `appliedChanges` Set per message
- Chat history is persisted per agent and survives page refreshes
- Uses `SuggestedChange` interface: `{ field, action ("replace"|"append"), content, explanation }`

**Backend Endpoints** (in `server/routes.ts`):
- `POST /api/agents/:id/prompt-coach` — Sends user message + chat history, returns AI response with optional `suggestedChanges[]`
- `POST /api/agents/:id/prompt-coach/apply` — Applies a suggested change to one of 4 fields: businessUseCase, domainKnowledge, validationRules, guardrails. Auto-regenerates the system prompt after applying.
- `GET /api/agents/:id/prompt-coach/history` — Retrieves persisted chat history
- `PUT /api/agents/:id/prompt-coach/history` — Saves chat history
- `DELETE /api/agents/:id/prompt-coach/history` — Clears chat history

**AI Logic** (in `server/gemini.ts`):
- `buildPromptCoachSystemPrompt()` — Builds the coach's system prompt, injecting all agent config fields as context
- `generatePromptCoachResponse()` — Sends to Gemini AI with chat history, returns `{ message, suggestedChanges? }`
- `parseSuggestedChanges()` — Extracts ```suggested_change JSON blocks from AI response
- `cleanCoachResponse()` — Strips suggested_change blocks from the display message
- Coach can suggest changes to 4 apply-able fields: businessUseCase, domainKnowledge, validationRules, guardrails
- Coach can advise on (but not apply changes to) read-only fields: sampleData, welcomeConfig, availableActions
- Has a hardcoded "Concise Mode" for agent "life agent 8" — should be generalized

**Current Limitations / Improvement Areas**:
- Hardcoded concise mode for one specific agent instead of being a general setting
- Coach sees full agent config every message (no context optimization like the chat system has)
- No awareness of the generated system prompt — can only see raw config fields
- "Apply" only works for 4 text fields — can't suggest changes to sample data, actions, or welcome config
- No undo for applied changes
- No tracking of what changes were previously applied across sessions

### Smart Context Management
- **Context Classification** (`classifyMessageContext()` in `server/gemini.ts`): Keyword-based classifier that analyzes each user message to determine which prompt sections (data, actions, domain knowledge, mock state) should be included. Reduces prompt size for simple messages.
- **System Context Stripping**: Classifier strips `[SYSTEM CONTEXT: ...]` prefixes injected by the orchestrator before classifying, preventing false keyword matches from prior conversation turns.
- Runs at the app level in `generateAgentResponse()` — benefits all agents automatically.

## External Dependencies
- **Google Gemini AI**: Used for generating agent responses, system prompts, validation rules, guardrails, and sample data.
- **Chroma Research**: The concept of context rot and token usage monitoring is based on research from Chroma.
- **Third-party Libraries**:
    - **React**: Frontend UI library.
    - **TypeScript**: For type-safe development.
    - **TanStack Query**: For data fetching and state management.
    - **Wouter**: For client-side routing.
    - **Tailwind CSS**: For utility-first CSS styling.
    - **Shadcn UI**: UI component library.
    - **Zod**: For schema validation.