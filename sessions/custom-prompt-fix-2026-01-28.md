# Custom Prompt Domain Knowledge Fix Session
**Date**: 2026-01-28
**Status**: complete

## Objective
Fix the bug where custom prompts completely replaced all agent configuration (domain knowledge, guardrails, validation rules), causing agents to "forget" their configured knowledge and ignore safety guardrails.

## Problem Analysis
- User reported agent couldn't answer "Where does Stoyan work?" even though "work at UKG" was in domain-knowledge.md
- Agent also disclosed hometown despite guardrail saying "Agent will not expose the hometown of the person"
- Root cause: `getSystemPrompt()` in `server/gemini.ts` returned only the custom prompt text when set, ignoring all other context

## Decisions Made
- Custom prompts should INCLUDE other configuration, not REPLACE it
- Two approaches supported:
  1. **Explicit placeholders**: Users can use `{{domainKnowledge}}`, `{{guardrails}}`, etc. to control where content appears
  2. **Automatic appending**: If no placeholders used, domain knowledge and guardrails are automatically appended
- UI should show available placeholders with click-to-insert functionality

## Implementation
1. Added placeholder constants and processing functions in `server/gemini.ts`:
   - `PROMPT_PLACEHOLDERS` - available placeholder tokens
   - `processCustomPrompt()` - replaces placeholders with actual values
   - `hasPlaceholders()` - checks if custom prompt uses any placeholders
   - `buildDomainKnowledgeText()` / `buildSampleDatasetsText()` - helper functions

2. Modified `getSystemPrompt()` to:
   - Process placeholders if present
   - Auto-append domain knowledge, guardrails, validation rules if no placeholders

3. Updated `client/src/pages/settings.tsx`:
   - Added blue info box showing available placeholders when editing
   - Click on placeholder to insert it at cursor position

## Testing
- E2E test confirmed:
  - Agent now answers "He works at UKG" when asked about workplace
  - Agent refuses to disclose hometown (respects guardrails)

## TODOs
- [x] Modify getSystemPrompt to support dynamic placeholders
- [x] Auto-append domain knowledge and guardrails if no placeholders
- [x] Add UI hints for available placeholders
- [x] Test both domain knowledge and guardrails are working

## Notes
- Architect review passed with minor suggestions:
  - Consider adding truncation limits (like prompt-templates.ts has) for large documents
  - Could use exported AVAILABLE_PLACEHOLDERS in UI instead of hardcoded list
- These are non-blocking improvements for future enhancement
