# Code Conventions and Patterns

## File Organization

### Frontend (`client/src/`)
- Pages in `pages/` directory
- Shared components in `components/`
- Utilities in `lib/`
- Hooks in `hooks/`

### Backend (`server/`)
- Routes in `routes.ts`
- Storage interface in `storage.ts`
- Modular components in `components/`

### Shared (`shared/`)
- Types and schemas in `schema.ts`

## Naming Conventions

- **Files**: kebab-case (`create-agent.tsx`)
- **Components**: PascalCase (`CreateAgentWizard`)
- **Functions**: camelCase (`generateAgentResponse`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_MESSAGE_LENGTH`)

## API Patterns

- RESTful endpoints under `/api/`
- Zod validation for request bodies
- Consistent error response format: `{ message: string }`

## Component Patterns

- Wizard steps as separate components
- Form state managed with react-hook-form
- Data fetching with TanStack Query
- Toast notifications for user feedback

## Agent Storage Pattern

Each agent in `agents/{uuid}/`:
```
agents/{uuid}/
├── meta.yaml
├── business-use-case.md
├── domain-knowledge.md
├── validation-rules.yaml
├── guardrails.yaml
├── custom-prompt.md
├── domain-documents.json
├── sample-data.json
├── chat.json
└── components/
```
