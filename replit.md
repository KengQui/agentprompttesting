# Agent Studio - AI Agent Configuration Platform

## Overview
Agent Studio is a web application for creating, configuring, and managing AI agents. Users can define business use cases, system prompts, validation rules, and guardrails through an intuitive 5-step wizard interface.

## Recent Changes
- **January 27, 2026**: Initial MVP implementation
  - Created agent data model with YAML file persistence
  - Implemented 5-step wizard for agent creation
  - Built home page with agent cards
  - Added settings page for editing/deleting agents
  - Created chat interface with simulated responses (no AI integration)

## Project Architecture

### Frontend (`client/src/`)
- **Pages**:
  - `pages/home.tsx` - Agent listing with cards
  - `pages/create-agent.tsx` - 5-step wizard for creating agents
  - `pages/chat.tsx` - Chat interface for testing agents
  - `pages/settings.tsx` - Edit/delete agent configuration
- **Tech Stack**: React, TypeScript, TanStack Query, Wouter, Tailwind CSS, Shadcn UI

### Backend (`server/`)
- **Routes** (`routes.ts`):
  - `GET/POST /api/agents` - List/create agents
  - `GET/PATCH/DELETE /api/agents/:id` - Agent CRUD operations
  - `GET/POST/DELETE /api/agents/:id/messages` - Chat message operations
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
