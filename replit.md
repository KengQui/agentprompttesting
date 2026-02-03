# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application designed for the end-to-end creation, configuration, and management of AI agents. It provides an intuitive 8-step wizard interface for users to define essential AI agent parameters such as business use cases, domain knowledge, validation rules, guardrails, sample datasets, and simulated actions. The platform aims to streamline the development and deployment of tailored AI agents for various business needs.

## Recent Changes (Since Jan 29, 2026)
- **Direct Action Execution**: Agents now execute actions directly instead of narrating navigation steps to users
- **Prompt Style Standardization**: Simplified to use only Google Gemini style (removed other prompt styles)
- **Enhanced Prompt Markers**: New placeholder marker replacement system (`{{MARKER_NAME}}`) for dynamic prompt generation
- **Smart Content Extractor**: Automatically extracts business case information from uploaded documents
- **Mock Mode Toggle**: Added ability to toggle mock mode for testing agent configurations
- **Trace Logging**: Added `traces.json` for tracking agent interactions and debugging
- **Clarifying Insights**: Added `clarifying-insights.json` to store AI clarification flow data

## Action Simulation Feature
Agent Studio supports action simulation, allowing AI agents to execute actions directly (e.g., adding dependents to health policies, updating employee records) without connecting to real APIs. This enables realistic testing of agent workflows.

### How It Works
1. **Configure Actions**: In the wizard's "Available Actions" step (step 7), users can auto-generate or manually define actions with required fields, categories (create, update, delete), confirmation messages, and success messages.
2. **Set Up Mock User State**: Define mock user profiles with sample data that actions can reference and modify.
3. **AI Executes Actions**: When users chat with the agent, the AI executes actions directly by outputting special action blocks in the format:
   ```action
   ACTION: action_name
   FIELDS: {"field": "value"}
   ```
4. **State Updates**: The system parses action blocks, validates fields, executes simulated updates to mock state, and returns clean confirmation messages to users.

### Key Files
- `server/gemini.ts`: Contains `parseActionFromResponse()` and `executeSimulatedAction()` functions
- `server/routes.ts`: Integrates action processing in chat message handlers (4 code paths)
- `shared/schema.ts`: Defines `AgentAction` and `MockUserState` types
- `/agents/{agent-id}/available-actions.json`: Stores configured actions for each agent
- `/agents/{agent-id}/mock-user-state.json`: Stores mock user profile data for action simulation

## User Preferences
- Using Google Gemini AI (via Google AI Studio) for agent responses
- Requires GEMINI_API_KEY secret to be configured
- Prompt generation uses only Google Gemini style (standardized)

## Authentication System
- **User Authentication**: Username/password registration with bcrypt password hashing
- **Session Management**: Cookie-based sessions with 7-day expiration, httpOnly and sameSite=lax flags
- **Password Reset**: Username-only verification - user enters username to verify account exists, then sets new password
- **Agent Isolation**: Each user can only see and manage their own agents; agents are associated with userId
- **Backward Compatibility**: Legacy agents without userId are accessible for migration purposes
- **Protected Routes**: All agent-related routes (sessions, messages, traces, config-history) enforce ownership verification
- **Storage**: Users stored in `/users/users.json` with file-based persistence

## System Architecture
Agent Studio utilizes a modern web application architecture with a clear separation between frontend and backend.

### Frontend
- **Tech Stack**: React, TypeScript, TanStack Query, Wouter, Tailwind CSS, Shadcn UI.
- **UI/UX**: Features a professional tech theme with dark mode support. Uses Inter for sans-serif fonts and JetBrains Mono for code. The primary color scheme is purple (#8B5CF6).
- **Core Features**:
    - **Agent Creation Wizard**: An 8-step process guiding users through defining agent parameters:
        1. Business Use Case - Define the problem this agent solves
        2. Agent Name - Name your agent
        3. Domain Knowledge - Add knowledge and documents
        4. Validation Rules - Set input/output validation rules
        5. Guardrails - Define safety boundaries
        6. Sample Data - Upload or generate sample data
        7. Available Actions - Define actions agent can simulate
        8. Review - Define your agent's prompt
    - **Chat Interface**: For testing and interacting with configured agents, with the following features:
        - **Session Management**: Multiple renamable sessions per agent for organizing test scenarios
        - **Session Sidebar**: Collapsible sidebar showing all sessions with previews, message counts, and inline renaming
        - **Context Progress Bar**: Compact header indicator showing context window fill level with color-coded status
        - **Cancel Response**: Ability to cancel AI responses mid-generation
        - **Mock Mode Toggle**: Enable/disable mock mode for testing
    - **Agent Management**: Pages for listing, editing, and deleting agents.
    - **AI-Powered Prompt Generation**: System prompts are automatically generated using Google Gemini AI with a meta-prompt that follows prompt engineering best practices. The AI curates domain knowledge, embeds validation rules naturally, makes guardrails enforceable, and determines appropriate output formats based on the use case. Users can optionally customize the generated prompt.
    - **Smart Generation**: AI evaluates context and engages in clarifying questions when necessary to gather sufficient information for generating validation rules or guardrails.
    - **Smart Content Extractor**: Automatically extracts business case information from uploaded domain documents.

### Backend
- **Tech Stack**: Node.js, Express.js.
- **Core Features**:
    - **Agent API**: CRUD operations for agents, chat messages, and session management.
    - **Document Upload API**: For handling domain knowledge documents.
    - **AI Generation APIs**: Endpoints for generating system prompts, validation rules, guardrails, and sample data using Google Gemini.
    - **Recovery Manager**: Component for handling error recovery and guardrail conflict detection, escalating to human support when needed.
    - **Turn Management**: Modular, per-agent component architecture for intent detection and conversational flow.
    - **Enhanced Prompt Processing**: Uses placeholder markers (`{{MARKER_NAME}}`) for dynamic content replacement in prompts.

### Agent Component Templates
- **Template System**: Agent components (TurnManager, FlowController, Orchestrator) are generated from templates in `/server/templates/agent-components/`.
- **How it works**: When a new agent is created, the template files are copied to `/agents/{agent-id}/components/` with placeholder values replaced (e.g., `{{AGENT_NAME}}`, `{{CLASS_NAME}}`).
- **CRITICAL RULE**: When adding new features to agent components, you **MUST** also update the corresponding template files so that newly created agents automatically receive those features.
  - Template files: `turn-manager.template.ts`, `flow-controller.template.ts`, `orchestrator.template.ts`, `index.template.ts`
  - To add a new component: Create a new `.template.ts` file, update `index.template.ts` to export it, and update the `copyComponentTemplates()` function in `server/storage.ts` to copy it.
- **See**: `/server/templates/agent-components/README.md` for detailed instructions.

### Data Persistence
- **Agent Configuration**: Each agent's configuration is stored in a dedicated folder (`/agents/{agent-id}/`) using a multi-file structure for modularity:
  - `meta.yaml` - Agent metadata (name, dates, userId)
  - `business-use-case.md` - Business use case description
  - `domain-knowledge.md` - Domain knowledge content
  - `validation-rules.yaml` - Validation rules configuration
  - `guardrails.yaml` - Guardrails configuration
  - `custom-prompt.md` - Custom system prompt
  - `domain-documents.json` - Uploaded domain documents
  - `sample-data.json` - Sample data for testing
  - `sessions.json` - List of chat session records
  - `available-actions.json` - Configured actions for simulation
  - `mock-user-state.json` - Mock user profile data for action simulation
  - `clarifying-insights.json` - AI clarification flow data
  - `traces.json` - Agent interaction traces for debugging
  - `components/` - Generated agent component files (TurnManager, FlowController, Orchestrator)
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
