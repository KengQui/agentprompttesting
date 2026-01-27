# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application for creating, configuring, and managing AI agents. Users can define business use cases, domain knowledge, validation rules, and guardrails through an intuitive 6-step wizard interface.

## Recent Changes
- **January 27, 2026**: Added Prompt Style Selector with multi-provider templates
  - Users can choose between Anthropic, Gemini, and OpenAI prompt styles
  - Each style follows that provider's best practices for prompt engineering
  - Anthropic: XML tags (<role>, <purpose>, <context>, <constraints>)
  - Gemini: Markdown headers with constraints at end
  - OpenAI: Markdown with bold emphasis and explicit role definitions
  - Preview and edit the generated prompt before creating the agent
  - Custom prompts are saved and used instead of auto-generated ones
  - Prompt configuration added to both wizard and settings page
  - Shared utility: `client/src/lib/prompt-preview.ts` for consistent preview generation
  - Radio buttons for prompt style selection (more intuitive than tabs)
  - "Learn more" popup dialog with detailed explanations and links to each provider's documentation

- **January 27, 2026**: Added Domain Knowledge feature with document upload
  - New Domain Knowledge step (Step 3) in the creation wizard
  - Users can type domain knowledge directly or upload documents
  - Supported file types: .txt, .md, .csv, .json (up to 5MB each)
  - File upload endpoint: POST /api/upload-document
  - Domain knowledge and documents are included in the AI system prompt
  - Settings page updated with Domain Knowledge section and file upload

- **January 27, 2026**: Moved agent personality to platform-owner controlled file
  - Created `personality-prompt.txt` in project root for platform owner to edit
  - Backend now reads personality from this file instead of per-agent settings
  - Removed System Prompt/Description field from agent settings page and creation wizard
  - Wizard Step 2 now only asks for Agent Name (no personality/description field)

- **January 27, 2026**: Added per-agent turn management system
  - Created modular component architecture: turn-manager, flow-controller, state-manager, orchestrator
  - Per-agent components in `agents/{id}/components/` with customizable templates
  - Keyword-based intent detection with LLM fallback for ambiguous cases
  - Supported intents: answer_question, go_back, change_previous_answer, request_clarification
  - Automatic component template generation for new agents
  - Intent context passed to Gemini for better response generation

- **January 27, 2026**: Added intermediate chatbot features
  - Cancel response: Users can abort AI responses mid-generation (server-side support)
  - Character limit: 2000 character limit with visual counter (warning at 80%, error when exceeded)
  - Rate limiting: 2-second cooldown between messages to prevent spam
  - Context tracking: Shows message count and auto-detected conversation topic
  - Topic detection: Recognizes Support, Sales, Questions, Feedback, Scheduling topics
  - Improved error handling: Specific messages for API key, rate limit, and network errors
  
- **January 27, 2026**: Initial MVP implementation
  - Created agent data model with YAML file persistence
  - Implemented 5-step wizard for agent creation
  - Built home page with agent cards
  - Added settings page for editing/deleting agents
  - Created chat interface with Gemini AI integration

## Project Architecture

### Frontend (`client/src/`)
- **Pages**:
  - `pages/home.tsx` - Agent listing with cards
  - `pages/create-agent.tsx` - 6-step wizard for creating agents
  - `pages/chat.tsx` - Chat interface for testing agents
  - `pages/settings.tsx` - Edit/delete agent configuration
- **Tech Stack**: React, TypeScript, TanStack Query, Wouter, Tailwind CSS, Shadcn UI

### Backend (`server/`)
- **Routes** (`routes.ts`):
  - `GET/POST /api/agents` - List/create agents
  - `GET/PATCH/DELETE /api/agents/:id` - Agent CRUD operations
  - `GET/POST/DELETE /api/agents/:id/messages` - Chat message operations
  - `POST /api/upload-document` - Upload domain knowledge documents
- **Storage** (`storage.ts`): In-memory storage with YAML/JSON file persistence

### Data Persistence (`agents/`)
- Each agent stored in `/agents/{agent-id}/` folder
- `config.yaml` - Agent configuration (YAML format)
- `chat.json` - Chat history (JSON format)

### Shared (`shared/`)
- `schema.ts` - TypeScript types and Zod schemas for agents and messages

## Design System
- **Primary Color**: Purple (#8B5CF6)
- **Theme**: Professional tech theme with dark mode support
- **Font**: Inter (sans-serif), JetBrains Mono (code)

## User Preferences
- Using Google Gemini AI (via Google AI Studio) for agent responses
- Requires GEMINI_API_KEY secret to be configured

## Running the Project
```bash
npm run dev
```
Frontend and backend run together on port 5000.
