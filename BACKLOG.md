# Development Backlog

This file tracks features and improvements planned for future development.

---

## Priority: High

### 1. Conversation Recovery System
**Status:** Planned  
**Added:** January 29, 2026

**Description:**  
Implement a comprehensive conversation recovery strategy to handle communication breakdowns including ambiguity, AI uncertainty, and misunderstandings.

**Components to Build:**

1. **Ambiguity Detection**
   - Detect when user questions are unclear or vague
   - Trigger targeted clarifying questions
   - Track clarification attempts to avoid loops

2. **Uncertainty Handling**
   - Confidence scoring for AI responses
   - Acknowledge uncertainty rather than guessing
   - Offer alternative interpretations when confidence is low

3. **Misunderstanding Repair**
   - Detect repair intents ("no", "that's wrong", "I meant...")
   - Gracefully recover and re-ask for clarification
   - Maintain conversation context during repair

4. **Context Reset**
   - Allow users to say "let's start over" or "forget that"
   - Clear confusion state while preserving relevant history
   - Provide fresh start without losing session

5. **Confirmation Loops**
   - For important or irreversible actions, confirm understanding
   - Summarize what was understood before proceeding
   - Allow corrections before action

**Related Files:**
- `server/components/orchestrator.ts`
- `agents/{agentId}/components/orchestrator.ts`
- `server/components/turn-manager.ts`
- `server/components/flow-controller.ts`
- `server/components/state-manager.ts`

**Implementation Notes:**
- Leverage existing orchestrator architecture
- Add new intents for repair/reset in turn manager
- Consider adding confidence metadata to AI responses
- May need conversation state tracking for multi-turn repairs

---

## Priority: Medium

### 2. Automatic Retry for AI Failures
**Status:** Planned  
**Added:** January 29, 2026

**Description:**  
Add retry mechanism when AI responses fail validation or API errors occur.

**Features:**
- Retry 1-2 times before showing recovery message
- Exponential backoff for rate limiting
- Different retry strategies for different error types

---

### 3. Prompt Diagnosis Tool
**Status:** Planned  
**Added:** January 29, 2026

**Description:**  
When users experience unexpected behavior in agent conversations, provide a diagnostic tool to identify whether the issue stems from the system prompt configuration or the agent's runtime behavior (validation rules, guardrails, domain knowledge).

**Features:**
- "Diagnose Issue" button on problematic messages in chat interface
- AI-powered analysis comparing the response against system prompt vs agent configuration
- Clear verdict identifying the likely source (system prompt, guardrails, validation rules, domain knowledge, etc.)
- Actionable suggestions for fixing the identified issue
- Option to test with modified configuration before applying changes

**Implementation Approach:**
1. Add diagnosis button to individual chat messages
2. Send conversation context + all prompt components to AI for analysis
3. Display diagnosis panel showing:
   - Which component is likely causing the behavior
   - Specific rules/sections that may be conflicting
   - Suggested fixes with one-click apply option

**Related Files:**
- `client/src/pages/chat.tsx`
- `server/routes.ts` (new diagnosis endpoint)
- Agent configuration files in `agents/{agentId}/`

**Notes:**
- Could integrate with existing tracing/debugging panel
- Consider caching diagnosis results for repeated issues

---

## Priority: Low

### 4. Unit Tests for Response Validation
**Status:** Planned  
**Added:** January 29, 2026

**Description:**  
Add unit tests for `validateAIResponse()` helper to prevent regressions.

---

## Completed

_No completed items yet._
