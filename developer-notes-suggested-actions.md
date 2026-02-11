# Developer Notes: Suggested Action Pills

## Overview
When the AI agent presents a new calculated column expression (Step 1 response), it outputs a special marker instead of asking an open-ended question. The frontend detects this marker and renders clickable pill buttons beneath the message bubble.

## Marker Format
```
{{SUGGESTED_ACTIONS:Label 1|Label 2|Label 3}}
```

- The marker appears at the end of the agent's response text.
- Labels are separated by the pipe character `|`.
- There can be any number of labels (typically 3).

### Example in Agent Output
```
This expression will produce a **Numeric** output.

Suggested column name: **Years of Service**

{{SUGGESTED_ACTIONS:Use this expression|Validate with sample data|Explain this expression}}
```

## Parsing Logic
1. Search the agent's response text for the pattern `{{SUGGESTED_ACTIONS:...}}`.
2. Extract the content between the colon and the closing `}}`.
3. Split by `|` to get individual pill labels.
4. Strip the marker from the displayed message text.

### Regex
```
/\{\{SUGGESTED_ACTIONS:(.*?)\}\}/g
```

## Pill Behavior

Each pill sends its label text as the user's next message. The agent uses different pill sets at different stages of the conversation:

**After presenting an expression (initial, revised, or from a suggestion):**

| Pill Label | On Click |
|---|---|
| Use this expression | Sends "Use this expression" as the user's next message |
| Validate with sample data | Sends "Validate with sample data" as the user's next message |
| Explain this expression | Sends "Explain this expression" as the user's next message |

**After the user accepts an expression ("Use this expression"):**

| Pill Label | On Click |
|---|---|
| See related expressions | Sends "See related expressions" as the user's next message |
| Create new expression | Sends "Create new expression" as the user's next message |
| I'm done | Sends "I'm done" as the user's next message |

**After validation preview:**

| Pill Label | On Click |
|---|---|
| Use this expression | Sends "Use this expression" as the user's next message |
| Revise this expression | Sends "Revise this expression" as the user's next message |
| Explain this expression | Sends "Explain this expression" as the user's next message |

**After explanation:**

| Pill Label | On Click |
|---|---|
| Use this expression | Sends "Use this expression" as the user's next message |
| Revise this expression | Sends "Revise this expression" as the user's next message |
| Validate with sample data | Sends "Validate with sample data" as the user's next message |

## Display Rules
- Only render pills on the **most recent** assistant message (not on older messages in the thread).
- Once any pill is clicked, **hide all pills** immediately — they should not be clickable again.
- If the agent is currently generating a response (typing indicator visible), do not allow pill clicks.
- The marker text itself should **never** be visible to the user — strip it before rendering.

## Styling
- Render as horizontal inline pills beneath the message bubble, with small spacing between them.
- Use an outline/muted badge or button style consistent with the app's design system.
- Pills should feel like interactive controls, visually distinct from the message text.
- Align pills with the message content (offset from the left to match the message bubble's left edge, accounting for the avatar).

## Extensibility
This marker convention is generic. Any agent prompt can use `{{SUGGESTED_ACTIONS:...}}` to present contextual action pills. The pill labels and count are determined entirely by the prompt — no frontend code changes are needed to support different agents with different pill labels.
