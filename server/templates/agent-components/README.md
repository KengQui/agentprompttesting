# Agent Component Templates

This directory contains template files for agent components. When a new agent is created, these templates are copied to the agent's `components/` directory with placeholders replaced.

## Placeholders

The following placeholders are used in templates and will be replaced when copying:

- `{{AGENT_NAME}}` - The human-readable name of the agent (e.g., "Customer Support Agent")
- `{{CLASS_NAME}}` - A sanitized, PascalCase version of the agent name for class names (e.g., "CustomerSupportAgent")

## Adding New Features

**IMPORTANT**: When you add a new feature to an agent's components, you MUST also update these template files so that newly created agents will automatically receive the feature.

### Steps to add a new feature:

1. Implement the feature in an existing agent's components for testing
2. Once working, copy the changes to the corresponding template file(s) here
3. If adding a new component file, create a new `.template.ts` file and update:
   - `index.template.ts` to export the new component
   - `server/storage.ts` `copyComponentTemplates()` function to copy the new file

### Template Files

- `turn-manager.template.ts` - Intent classification and keyword handling
- `flow-controller.template.ts` - Conversation flow and step management
- `orchestrator.template.ts` - Component coordination and response handling
- `index.template.ts` - Component exports

## Example: Adding a StateSessionManager

If you create a new `StateSessionManager` component:

1. Create `state-session-manager.template.ts` with `{{CLASS_NAME}}` placeholders
2. Update `index.template.ts` to export it
3. Update `copyComponentTemplates()` in `server/storage.ts` to copy the new file
