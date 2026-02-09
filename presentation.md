# Agent Prompt Construction - Presentation

---

## Overview

Agent Studio constructs AI agent prompts through a structured, multi-step wizard process. Each step contributes a specific layer of information that is ultimately synthesized into a production-ready system prompt using a meta-prompt powered by Google Gemini AI.

---

## The 10-Step Wizard Pipeline

```
Step 1: Business Use Case
        |
Step 2: Agent Name
        |
Step 3: Domain Knowledge
        |
Step 4: Validation Rules
        |
Step 5: Guardrails
        |
Step 6: Sample Data
        |
Step 7: Available Actions
        |
Step 8: Validation Checklist (Quality Gate)
        |
Step 9: Agent Prompt (AI-Generated System Prompt)
        |
Step 10: Welcome Screen (AI-Generated Greeting + Suggested Prompts)
```

---

## Step-by-Step Breakdown

### Step 1: Business Use Case
- **Purpose**: Define the core problem the agent solves and who it serves.
- **Input**: Free-text description of the agent's purpose.
- **Role in Prompt**: Feeds into the ROLE and GOAL sections. The meta-prompt uses this to define the agent's identity, what success looks like, and what problems it solves.
- **Example**: "An HR assistant that helps employees check time-off balances, submit leave requests, and understand company leave policies."

### Step 2: Agent Name
- **Purpose**: Give the agent a human-friendly identity.
- **Input**: Short name for the agent.
- **Role in Prompt**: Used in the ROLE section (e.g., "You are [Agent Name], a [specific role]..."). Also used as a placeholder `{{name}}` in custom prompts.

### Step 3: Domain Knowledge
- **Purpose**: Provide reference facts, policies, procedures, and documents the agent needs to know.
- **Input**: Free text and/or uploaded documents (PDF, CSV, etc.). A Smart Content Extractor can automatically pull business case information from uploaded documents.
- **Role in Prompt**: Placed in the INPUT section wrapped in `<knowledge>` XML tags. The meta-prompt intelligently redistributes content; if domain knowledge contains rule-like statements, those are moved to the CONSTRAINTS section instead.
- **Key Distinction**: Domain knowledge should contain **facts and reference materials**, not rules or instructions. The validation checklist (Step 8) flags this if violated.

### Step 4: Validation Rules
- **Purpose**: Define what makes a valid user request and what conditions must be met.
- **Input**: Markdown-formatted criteria. Can be AI-generated based on the business use case and domain knowledge.
- **AI Generation**: The system generates validation criteria (not rigid step-by-step instructions) focused on:
  - Required information
  - Validation conditions (e.g., "balance must be sufficient")
  - How to handle invalid requests
- **Role in Prompt**: Combined into the CONSTRAINTS section using Must/Cannot/Should format.
- **Example**: "Verify time-off request doesn't exceed available balance. If insufficient, explain accrual schedule."

### Step 5: Guardrails
- **Purpose**: Define safety boundaries and topics the agent must avoid.
- **Input**: Markdown-formatted restrictions. Can be AI-generated.
- **Role in Prompt**: Merged into the CONSTRAINTS section alongside validation rules, formatted as hard restrictions (e.g., "Cannot discuss topics outside the defined scope").
- **Key Distinction**: Guardrails are **absolute restrictions** ("Never", "Always", "Under no circumstances"), while validation rules are **conditional criteria**.

### Step 6: Sample Data
- **Purpose**: Provide real or representative data the agent will reference when answering user queries.
- **Input**: CSV, JSON, or text-based datasets uploaded or generated via AI.
- **Role in Prompt**: Inserted into the INPUT section within `<data>` tags using the `{{SAMPLE_DATA}}` placeholder marker. The system automatically:
  - Strips code block markers from content
  - Counts records in the dataset
  - Labels each dataset with name and format
- **Critical Behavior**: When sample data is present, the system automatically adds **Smart Name Resolution** guidelines to the prompt, instructing the agent to look up people by name rather than expecting users to know internal IDs.

### Step 7: Available Actions
- **Purpose**: Define actions the agent can execute for users (e.g., adding dependents, updating records).
- **Input**: Actions with name, description, required fields, category (create/update/delete), confirmation messages, and success messages.
- **Role in Prompt**: Inserted via the `{{AVAILABLE_ACTIONS}}` placeholder marker in the TASK section. The prompt instructs the agent to:
  1. Acknowledge the request
  2. Gather missing required fields conversationally
  3. Confirm before executing
  4. Execute using a structured action block format
- **Action Execution Format**:
  ```
  ACTION: action_name
  FIELDS: {"field_name": "value"}
  ```
- **Mock User State**: Optionally paired with mock user profile data that actions can reference and modify, presented as "Current User Profile" in the prompt.

### Step 8: Validation Checklist (Quality Gate)
- **Purpose**: Automatically verify the quality and consistency of all configuration before prompt generation.
- **How It Works**: Runs 16 automated checks across 4 categories:

| Category | Checks |
|----------|--------|
| **Separation of Concerns** | Technical details not in business use case; domain knowledge contains facts not rules; guardrails don't contain conditional logic; validation rules don't contain guardrail language |
| **Completeness** | All essential fields are filled; sufficient domain knowledge; validation rules cover edge cases |
| **Clarity** | No cross-references between sections; no meta-comments about the agent; clear and unambiguous language |
| **Wizard Compatibility** | Configuration works with prompt placeholders; no conflicting instructions between sections |

- **Results**: Each check shows pass/fail/unable-to-verify status with specific details.
- **Auto-Fix**: Can automatically move misplaced content between sections (e.g., rule-like content in domain knowledge moved to validation rules).
- **Non-Blocking**: Users can always proceed regardless of results.

### Step 9: Agent Prompt (AI-Generated System Prompt)
- **Purpose**: Generate the final production-ready system prompt using all previous inputs.
- **How It Works**: A meta-prompt instructs Google Gemini AI to intelligently analyze and reorganize all configuration into a structured prompt.

#### The Meta-Prompt Architecture

The meta-prompt follows Anthropic's Production-Ready Prompt Structure with 8 sections:

| Section | Source | Description |
|---------|--------|-------------|
| **1. ROLE** | Agent Name + Business Use Case | Defines the agent's identity and expertise |
| **2. GOAL** | Business Use Case | What success looks like, who the agent helps |
| **3. CONSTRAINTS** | Validation Rules + Guardrails + Domain Knowledge (rules) | Must/Cannot/Should format; includes request faithfulness, clarification consistency, and topic transition handling |
| **4. INPUT** | Domain Knowledge + Sample Data | Reference materials in `<knowledge>` tags, data in `<data>` tags |
| **5. TASK** | Business Use Case + Available Actions | Numbered steps for handling requests with action execution format |
| **6. OUTPUT FORMAT** | Business Use Case | Response structure, tone, and formatting |
| **7. EXAMPLES** | AI-Inferred from Business Use Case | 2-3 realistic example interactions (auto-generated) |
| **8. VERIFICATION CHECKLIST** | AI-Inferred | Pre-response checks relevant to the specific use case |

#### Key Principles Enforced by the Meta-Prompt

- **Intelligent Redistribution**: Content is analyzed and placed where it logically belongs (e.g., rule-like domain knowledge goes to CONSTRAINTS, not INPUT).
- **Request Faithfulness**: The agent must parse user requests carefully and follow stated logic faithfully, never contradicting what the user explicitly said.
- **Single Question Rule**: The agent must ask only ONE clarifying question at a time.
- **Smart Name Resolution**: When data contains people records, the agent resolves names automatically and only asks for disambiguation when multiple matches exist.
- **No Simulation Language**: The prompt never uses words like "simulated", "mock", "demo", or "test" - the agent presents itself as a real professional assistant.
- **Topic Transition Handling**: When a system context note indicates a pending unanswered question and a topic switch, the agent follows the system's instruction to either gently redirect or move on.

#### Placeholder Marker System

Custom prompts support dynamic content injection through placeholder markers:

| Marker | Replaced With |
|--------|---------------|
| `{{name}}` | Agent name |
| `{{businessUseCase}}` | Business use case text |
| `{{domainKnowledge}}` | Domain knowledge + documents |
| `{{validationRules}}` | Validation rules text |
| `{{guardrails}}` | Guardrails text |
| `{{sampleDatasets}}` | Formatted sample data with record counts |
| `{{currentDate}}` | Current date (auto-appended if not used) |
| `{{SAMPLE_DATA}}` | Sample data content (new-style marker) |
| `{{AVAILABLE_ACTIONS}}` | Available actions section (new-style marker) |

#### Prompt Assembly at Runtime

When the agent is used in chat, the system assembles the final prompt through `getSystemPrompt()`:

1. **Custom Prompt Path**: If a custom prompt exists, replace all placeholder markers with actual values, then append any missing sections (actions, mock state, smart name resolution, current date).
2. **Generated Prompt Path**: If no custom prompt exists, use the prompt template system to build a structured prompt with all sections.
3. **Auto-Appended Sections** (always added when applicable):
   - Current Date
   - Available Actions (with execution format)
   - Mock User State (Current User Profile)
   - Smart Name Resolution guidelines

### Step 10: Welcome Screen
- **Purpose**: Create a user-facing greeting and clickable suggested prompts for the chat interface.
- **How It Works**: AI generates the welcome configuration based on the agent's name, business use case, domain knowledge, and sample data.
- **Output**:
  - A short, conversational greeting (1-2 sentences, no agent name included)
  - 4-6 suggested prompts, each with a short title and a ready-to-send prompt
- **Sample Data Integration**: The AI is specifically instructed to use **exact column names, field names, and example values** from the sample data in suggested prompts. For example, if the sample data has a column called "Hourly Pay", the prompts will use "Hourly Pay" and not "HourlyRate" or "Hourly_Rate".
- **User Controls**: Toggle on/off, edit greeting/prompts, add/remove prompts, regenerate with AI.
- **Chat Integration**: When a user opens a new chat session, the welcome screen is displayed. Clicking a suggested prompt immediately sends it as the first message.

---

## How Everything Connects

```
User Inputs (Steps 1-7)
        |
        v
Validation Checklist (Step 8)
   - Checks quality across 4 categories
   - Optional auto-fix for misplaced content
        |
        v
Meta-Prompt Engine (Step 9)
   - Receives all inputs
   - Intelligently redistributes content
   - Generates structured system prompt
   - Infers realistic examples
   - Creates verification checklist
        |
        v
Final System Prompt
   - Used in every chat interaction
   - Dynamically assembled with current date,
     sample data, actions, and mock state
        |
        v
Welcome Screen (Step 10)
   - Uses same inputs (business use case,
     domain knowledge, sample data)
   - Generates greeting + suggested prompts
   - Ensures prompts reference actual data columns
```

---

## Flow Mode Detection

The orchestrator automatically determines the conversation flow style by analyzing the agent's custom prompt:

### Infer-First Mode
Triggered by phrases like "analyze data first", "infer first", "only ask when ambiguous".
- Skips dynamic field collection
- Provides a simple welcome greeting
- AI analyzes available data before asking questions

### Ask-First Mode (Default)
Used when no infer-first phrases are detected.
- Extracts required fields from validation rules
- Welcome message includes questions about required fields
- Information collected upfront in batches

---

## Agent Component Architecture

Each agent gets its own set of components generated from templates:

| Component | Purpose |
|-----------|---------|
| **Turn Manager** | Classifies user intent (question, correction, clarification, go-back) using keyword matching and LLM fallback |
| **Flow Controller** | Manages multi-step conversation flows with configurable steps, validation, and help text |
| **Orchestrator** | Coordinates all components, detects flow mode, and manages the overall conversation turn cycle |

These components work together with the generated system prompt to deliver a coherent conversational experience.

---

## Summary

The agent prompt construction in Agent Studio is a layered, intelligent process:

1. **Structured Input Collection** (Steps 1-7): Each step gathers a specific type of information with clear boundaries.
2. **Quality Assurance** (Step 8): Automated checks catch common mistakes like misplaced rules or missing content.
3. **Intelligent Synthesis** (Step 9): A meta-prompt powered by Gemini AI analyzes, redistributes, and structures all inputs into a production-ready system prompt following prompt engineering best practices.
4. **Dynamic Assembly** (Runtime): The final prompt is assembled with real-time data (current date, sample data, actions) and enhanced with behavioral guidelines (smart name resolution, topic transition handling).
5. **User-Facing Polish** (Step 10): AI generates a welcome screen with data-aware suggested prompts to help users get started quickly.
