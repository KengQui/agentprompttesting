# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application designed for the end-to-end creation, configuration, and management of AI agents. It provides an intuitive 7-step wizard interface for users to define essential AI agent parameters such as business use cases, domain knowledge, validation rules, guardrails, and sample datasets. The platform aims to streamline the development and deployment of tailored AI agents for various business needs.

## User Preferences
- Using Google Gemini AI (via Google AI Studio) for agent responses
- Requires GEMINI_API_KEY secret to be configured

## Authentication System
- **User Authentication**: Username/password registration with bcrypt password hashing
- **Session Management**: Cookie-based sessions with 7-day expiration, httpOnly and sameSite=lax flags
- **Password Reset**: Username-only verification - user enters username to verify account exists, then sets new password
- **Agent Isolation**: Each user can only see and manage their own agents; agents are associated with userId
- **Backward Compatibility**: Legacy agents without userId are accessible for migration purposes
- **Protected Routes**: All agent-related routes (sessions, messages, traces, config-history) enforce ownership verification
- **Storage**: Users stored in `/data/users.json` with file-based persistence

## System Architecture
Agent Studio utilizes a modern web application architecture with a clear separation between frontend and backend.

### Frontend
- **Tech Stack**: React, TypeScript, TanStack Query, Wouter, Tailwind CSS, Shadcn UI.
- **UI/UX**: Features a professional tech theme with dark mode support. Uses Inter for sans-serif fonts and JetBrains Mono for code. The primary color scheme is purple (#8B5CF6).
- **Core Features**:
    - **Agent Creation Wizard**: A 7-step process guiding users through defining agent parameters.
    - **Chat Interface**: For testing and interacting with configured agents, with the following features:
        - **Session Management**: Multiple renamable sessions per agent for organizing test scenarios
        - **Session Sidebar**: Collapsible sidebar showing all sessions with previews, message counts, and inline renaming
        - **Context Progress Bar**: Compact header indicator showing context window fill level with color-coded status
        - **Cancel Response**: Ability to cancel AI responses mid-generation
    - **Agent Management**: Pages for listing, editing, and deleting agents.
    - **Multi-provider Prompt Styling**: Users can select and preview system prompt styles tailored for Anthropic, Gemini, or OpenAI, with custom prompt editing capabilities.
    - **Smart Generation**: AI evaluates context and engages in clarifying questions when necessary to gather sufficient information for generating validation rules or guardrails.

### Backend
- **Tech Stack**: Node.js, Express.js.
- **Core Features**:
    - **Agent API**: CRUD operations for agents, chat messages, and session management.
    - **Document Upload API**: For handling domain knowledge documents.
    - **AI Generation APIs**: Endpoints for generating system prompts, validation rules, guardrails, and sample data using various AI models.
    - **Recovery Manager**: Component for handling error recovery and guardrail conflict detection, escalating to human support when needed.
    - **Turn Management**: Modular, per-agent component architecture for intent detection and conversational flow.

### Agent Component Templates
- **Template System**: Agent components (TurnManager, FlowController, Orchestrator) are generated from templates in `/server/templates/agent-components/`.
- **How it works**: When a new agent is created, the template files are copied to `/agents/{agent-id}/components/` with placeholder values replaced (e.g., `{{AGENT_NAME}}`, `{{CLASS_NAME}}`).
- **CRITICAL RULE**: When adding new features to agent components, you **MUST** also update the corresponding template files so that newly created agents automatically receive those features.
  - Template files: `turn-manager.template.ts`, `flow-controller.template.ts`, `orchestrator.template.ts`, `index.template.ts`
  - To add a new component: Create a new `.template.ts` file, update `index.template.ts` to export it, and update the `copyComponentTemplates()` function in `server/storage.ts` to copy it.
- **See**: `/server/templates/agent-components/README.md` for detailed instructions.

### Data Persistence
- **Agent Configuration**: Each agent's configuration is stored in a dedicated folder (`/agents/{agent-id}/`) using a multi-file structure for modularity:
  - `meta.yaml` - Agent metadata (name, dates)
  - `business-use-case.md` - Business use case description
  - `domain-knowledge.md` - Domain knowledge content
  - `validation-rules.yaml` - Validation rules configuration
  - `guardrails.yaml` - Guardrails configuration
  - `custom-prompt.md` - Custom system prompt
  - `domain-documents.json` - Uploaded domain documents
  - `sample-data.json` - Sample data for testing
  - `sessions.json` - List of chat session records
- **Per-Session Message Storage**: Chat messages are stored in individual session files at `/agents/{agent-id}/sessions/{session-id}/messages.json`. This architecture:
  - Enables independent experiment threads per session
  - Supports session isolation for testing different scenarios
  - Includes automatic migration from legacy single-file `chat.json` format
  - Provides cross-session message queries sorted by timestamp
  - Cleans up orphaned session folders during clear operations
- **In-memory storage**: Utilizes nested Maps (`Map<agentId, Map<sessionId, ChatMessage[]>>`) for transient data, with persistence to YAML/JSON files.

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