# Engineering Handoff Memo: Conversational UX Behaviors for HCM Expression Builder

**Date:** February 13, 2026
**From:** Agent Studio Prototype Team
**To:** HCM Product Engineering Team

---

## Purpose

This memo documents conversational UX behaviors implemented in the Agent Studio prototype for the **HCM Report Custom Column Expression Builder** agent. These behaviors improve the natural feel of the conversation when users build and create calculated columns. They are currently implemented as prototype-level logic and should be built natively into the HCM product's conversation flow.

---

## Behavior 1: Natural Language Approval Detection

### What It Does
When the AI presents a completed expression with a "Create new column" action available, users can approve creation using natural phrases instead of only clicking the action button.

### Accepted Approval Phrases (non-exhaustive)
- "approved", "this is approved", "i approve"
- "go ahead", "looks good", "sounds good"
- "do it", "create it", "make it", "build it", "add it"
- "yes please", "please create", "please add"
- "perfect", "that works", "all good"
- "let's create it", "let's go", "let's do it"
- "confirmed", "good to go", "proceed"
- "ship it", "lgtm", "absolutely", "definitely", "for sure"
- "that's good", "that's great", "that's correct", "that's right"

### Negation Handling
The system blocks approval when negation words are present:
- **Blocked:** "don't create it", "do not add it", "cancel", "stop", "wait", "hold on", "never", "not yet"
- **Allowed (negation exceptions):** "no issues, go ahead", "no problems, looks good", "no worries, create it", "no objections", "no concerns"

### Conversation History Scanning
The system scans the conversation history to find the most recent AI message that offered a "Create new column" action. It also checks that no column was already created after that point (to prevent duplicate creation). This means:
- Users can have back-and-forth discussions about the expression, and still approve later with a natural phrase
- If the expression was revised, the system finds the latest version
- If a column was already created, the approval phrase is treated as a regular message

### Product Requirement
The HCM product should support natural language approval for column creation — not just explicit button clicks. The detection should be context-aware (knows there's a pending expression) and should handle negation gracefully.

---

## Behavior 2: One-Shot Column Creation

### What It Does
When a user's initial message explicitly asks to **create a column** (not just write an expression), the AI generates the expression and creates the column in a single response — skipping the usual two-step flow of "present expression → wait for approval → create."

### Triggering Patterns
Messages that contain an action verb ("create", "build", "add", "make") followed closely by "column" (within a few words):
- "Create a column that calculates overtime rate"
- "Build me a new column that concatenates first and last name"
- "Add a column for total compensation"
- "Make a custom column with hourly rate times 1.5"

### Non-Triggering Patterns (normal two-step flow)
Messages that don't pair an action verb with "column", or only ask for an expression:
- "Write an expression that adds BaseSalary and Bonus"
- "How would I calculate total compensation?"
- "What's the formula for overtime rate?"
- "Show me how to concatenate two fields"
- "Help with a column for overtime" (no creation verb)
- "I need a column that shows full employee name" (no creation verb)

### Guard Condition
One-shot creation only activates when there is **no pending expression** in the conversation. If the AI has already presented an expression with a "Create new column" option that hasn't been acted on yet, the normal approval flow continues. If a column was already created (post-creation state), one-shot can activate again for the next request.

### Product Requirement
The HCM product should detect when users want end-to-end column creation (not just expression help) and streamline the flow accordingly. The key signal is the word "column" paired with action verbs like "create", "build", "add", or "make."

---

## Behavior 3: Split-Bubble UI for Column Creation Confirmations

### What It Does
When the AI confirms a column was successfully created, the response is split into multiple chat bubbles with animation for a polished conversational feel, rather than displaying everything in one large block.

### Product Requirement
The HCM product's chat UI should support multi-part responses where confirmation messages can be visually separated (e.g., expression summary in one bubble, creation confirmation in another, follow-up options in a third).

---

## Summary Table

| Behavior | Trigger | Result | Fallback |
|---|---|---|---|
| Natural Approval | User types approval phrase when expression is pending | Column created immediately | Treated as regular message |
| One-Shot Creation | User says "create/build/add a column..." in initial message | Expression generated + column created in one turn | Normal two-step flow |
| Split-Bubble UI | AI confirms column creation | Response split into animated bubbles | Single response block |

---

## Notes
- All three behaviors are prototype-specific implementations in `server/routes.ts` (server-side detection) and `client/src/pages/chat.tsx` (UI splitting). They should be implemented natively in the HCM product's conversation engine.
- The approval phrase list and one-shot patterns should be treated as starting points — the product team may want to use a more sophisticated NLU approach rather than regex matching for production.
- The negation exception list ("no issues", "no problems", etc.) is important to avoid false negatives where users express approval with a leading "no."
