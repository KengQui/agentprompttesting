# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application for creating, configuring, and managing AI agents. Users can define business use cases, domain knowledge, validation rules, guardrails, and sample datasets through an intuitive 7-step wizard interface.

## Recent Changes
- **January 28, 2026**: Added Recovery Manager Component with Guardrail Conflict Detection
  - New RecoveryManager class in `server/components/recovery-manager.ts`
  - Handles error recovery and escalation to human support
  - Detects when escalation is needed (user request, out-of-scope, sensitive topics, low confidence, max retries)
  - Tracks escalation state per conversation
  - Validates guardrails against recovery rules for conflicts
  - New API endpoint: POST /api/validate/guardrail-conflicts
  - Real-time conflict warnings in Guardrails step of creation wizard (debounced 1s)
  - Conflict types: error, warning, info with actionable suggestions
  - New types: EscalationReason, RecoveryResult, EscalationContext, GuardrailConflict, RecoveryConfig

- **January 28, 2026**: Added Sample Data Upload and Generation Feature
  - New Sample Data step (Step 6) in the creation wizard
  - Users can upload sample datasets (CSV, JSON, text files up to 5MB)
  - AI-powered sample data generation using Gemini
  - Customize data type, record count (1-100), and output format
  - Model selection for generation (Gemini 2.5 Flash, 2.5 Pro, 3 Flash, 3 Pro)
  - Sample data template with example customer records
  - Backend endpoints: POST /api/generate/sample-data, POST /api/upload-sample-data
  - Settings page updated with Sample Data section
  - Wizard now has 7 steps (Sample Data is Step 6, Review is Step 7)
  - SampleDataset schema includes: id, name, description, content, format, isGenerated, createdAt

- **January 27, 2026**: Model Selection for AI Generation
  - Added dropdown menu to Generate buttons for validation rules and guardrails
  - Users can choose between Gemini 2.5 Flash, 2.5 Pro (default), 3 Flash, and 3 Pro
  - Model selection available in both wizard and settings page
  - Uses correct API model names (gemini-3-flash-preview, gemini-3-pro-preview for Gemini 3 models)

- **January 27, 2026**: AI-Powered System Prompt Generation
  - Gemini now generates custom system prompts based on selected style (Anthropic, Gemini, OpenAI)
  - The generated prompt incorporates all agent configuration (name, use case, domain knowledge, rules, guardrails)
  - Backend endpoint: POST /api/generate/system-prompt
  - Loading state with spinner while Gemini generates the prompt
  - Regenerate button to create a new prompt
  - Falls back to local template if API fails or required fields are missing
  - Auto-regenerates when configuration changes (name, use case, knowledge, rules, guardrails, style)

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
