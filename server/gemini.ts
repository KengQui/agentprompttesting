import { GoogleGenAI } from "@google/genai";
import { generatePrompt, type PromptContext } from "./prompt-templates";
import type { PromptStyle, DomainDocument, GeminiModel, SampleDataset, ClarifyingInsight, AgentAction, MockUserState } from "@shared/schema";
import { defaultGenerationModel } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

export interface ContextEvaluationResult {
  hasEnoughContext: boolean;
  missingAreas: string[];
  initialQuestion: string | null;
}

export interface ClarifyingChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClarifyingChatContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  clarifyingInsights?: ClarifyingInsight[];
  generationType: "validation" | "guardrails";
  chatHistory: ClarifyingChatMessage[];
}

export interface ClarifyingChatResponse {
  message: string;
  isReadyToGenerate: boolean;
  gatheredInsight?: ClarifyingInsight;
}

// Google AI Studio SDK integration for Gemini
// Requires GEMINI_API_KEY secret to be set
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export interface AgentContext {
  name: string;
  businessUseCase: string;
  description: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  sampleDatasets?: SampleDataset[];
  validationRules: string;
  guardrails: string;
  promptStyle?: PromptStyle;
  customPrompt?: string;
  availableActions?: AgentAction[];
  mockUserState?: MockUserState[];
}

export interface ChatHistory {
  role: "user" | "assistant";
  content: string;
}

// Result of parsing an AI response for action blocks
export interface ParsedActionResult {
  hasAction: boolean;
  actionName?: string;
  actionFields?: Record<string, any>;
  cleanedResponse: string;
  rawActionBlock?: string;
  parseError?: string;
}

// Result of executing an action
export interface ActionExecutionResult {
  success: boolean;
  actionName: string;
  fields: Record<string, any>;
  message: string;
  updatedMockState?: MockUserState[];
}

// Parse action blocks from AI response
export function parseActionFromResponse(response: string): ParsedActionResult {
  const actionBlockRegex = /```action\s*\n?([\s\S]*?)```/i;
  const match = response.match(actionBlockRegex);
  
  if (!match) {
    return { hasAction: false, cleanedResponse: response };
  }
  
  const rawBlock = match[0];
  const blockContent = match[1].trim();
  
  // Parse the action block
  const actionNameMatch = blockContent.match(/^ACTION:\s*(.+?)$/mi);
  // Use multiline capture to handle pretty-printed JSON spanning multiple lines
  const fieldsMatch = blockContent.match(/^FIELDS:\s*([\s\S]+)$/mi);
  
  if (!actionNameMatch) {
    return { hasAction: false, cleanedResponse: response };
  }
  
  const actionName = actionNameMatch[1].trim();
  let actionFields: Record<string, any> = {};
  let parseError: string | undefined;
  
  if (fieldsMatch) {
    try {
      // Try to parse the fields as JSON
      const rawFields = fieldsMatch[1].trim();
      actionFields = JSON.parse(rawFields);
    } catch (e) {
      console.error("Failed to parse action fields:", e);
      parseError = `Failed to parse action fields: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
    }
  }
  
  // Remove the action block from the response for clean display
  const cleanedResponse = response.replace(rawBlock, '').trim();
  
  return {
    hasAction: true,
    actionName,
    actionFields,
    cleanedResponse,
    rawActionBlock: rawBlock,
    parseError
  };
}

// Execute a simulated action and update mock state
export function executeSimulatedAction(
  actionName: string,
  fields: Record<string, any>,
  availableActions: AgentAction[],
  currentMockState: MockUserState[]
): ActionExecutionResult {
  // Find the action definition
  const action = availableActions.find(
    a => a.name.toLowerCase() === actionName.toLowerCase() || 
         a.name.toLowerCase().replace(/\s+/g, '_') === actionName.toLowerCase()
  );
  
  if (!action) {
    return {
      success: false,
      actionName,
      fields,
      message: `Action "${actionName}" is not available.`
    };
  }
  
  // Validate required fields are present (check for undefined/null, not falsy)
  const missingFields = action.requiredFields.filter(
    f => (fields[f.name] === undefined || fields[f.name] === null) && f.name !== 'id'
  );
  
  if (missingFields.length > 0) {
    return {
      success: false,
      actionName,
      fields,
      message: `Missing required fields: ${missingFields.map(f => f.label).join(', ')}`
    };
  }
  
  // Clone the mock state for modification
  const updatedMockState = JSON.parse(JSON.stringify(currentMockState)) as MockUserState[];
  
  // Determine target profile/entity based on action name and provided fields
  // Look for fields like 'profileId', 'entityId', 'targetId', or state category matches
  const targetId = fields.profileId || fields.entityId || fields.targetId || fields.id;
  
  // Apply simulated action effects based on category
  if (action.category === 'create' || action.category === 'add') {
    // For create/add actions, add the new item to the most appropriate state
    const targetState = updatedMockState.find(s => 
      s.name.toLowerCase().includes(action.name.split(' ').pop()?.toLowerCase() || '') ||
      action.name.toLowerCase().includes(s.name.toLowerCase())
    );
    
    if (targetState && Array.isArray(targetState.fields)) {
      targetState.fields.push({
        id: `sim_${Date.now()}`,
        ...fields,
        createdAt: new Date().toISOString()
      });
    } else if (targetState && typeof targetState.fields === 'object') {
      // If fields is an object that should contain arrays, try to find the right array
      const fieldsObj = targetState.fields as Record<string, any>;
      for (const key of Object.keys(fieldsObj)) {
        if (Array.isArray(fieldsObj[key])) {
          fieldsObj[key].push({
            id: `sim_${Date.now()}`,
            ...fields,
            createdAt: new Date().toISOString()
          });
          break;
        }
      }
    }
  } else if (action.category === 'update' || action.category === 'modify') {
    // For update actions, modify the targeted state or array item
    let updated = false;
    
    // First try to find and update an item in an array by targetId
    if (targetId) {
      for (const state of updatedMockState) {
        // Handle array-based fields (e.g., list of dependents, policies)
        if (Array.isArray(state.fields)) {
          const itemIndex = state.fields.findIndex(
            (item: any) => item.id === targetId || item.entityId === targetId || item.dependentId === targetId
          );
          if (itemIndex >= 0) {
            Object.assign(state.fields[itemIndex], fields);
            updated = true;
            break;
          }
        } 
        // Handle object with nested arrays
        else if (typeof state.fields === 'object') {
          const fieldsObj = state.fields as Record<string, any>;
          // Check if this object directly matches targetId
          if (fieldsObj.id === targetId || fieldsObj.employeeId === targetId || fieldsObj.userId === targetId) {
            Object.assign(fieldsObj, fields);
            updated = true;
            break;
          }
          // Check nested arrays
          for (const key of Object.keys(fieldsObj)) {
            if (Array.isArray(fieldsObj[key])) {
              const itemIndex = fieldsObj[key].findIndex(
                (item: any) => item.id === targetId || item.entityId === targetId || item.dependentId === targetId
              );
              if (itemIndex >= 0) {
                Object.assign(fieldsObj[key][itemIndex], fields);
                updated = true;
                break;
              }
            }
          }
          if (updated) break;
        }
      }
    }
    
    // Fallback: match by action name if no targetId or not found
    if (!updated) {
      const targetState = updatedMockState.find(s => 
        s.name.toLowerCase().includes(action.name.split(' ').pop()?.toLowerCase() || '') ||
        action.name.toLowerCase().includes(s.name.toLowerCase())
      );
      
      if (targetState && typeof targetState.fields === 'object' && !Array.isArray(targetState.fields)) {
        Object.assign(targetState.fields, fields);
        updated = true;
      }
    }
    
    if (!updated) {
      return {
        success: false,
        actionName: action.name,
        fields,
        message: `Could not find target to update. ${targetId ? `No item with ID ${targetId} was found.` : 'Please specify a target ID.'}`
      };
    }
  } else if (action.category === 'delete' || action.category === 'remove') {
    // For delete actions, remove items from arrays
    let deleted = false;
    
    if (targetId) {
      for (const state of updatedMockState) {
        // Handle top-level arrays
        if (Array.isArray(state.fields)) {
          const originalLength = state.fields.length;
          state.fields = state.fields.filter(
            (item: any) => item.id !== targetId && item.entityId !== targetId && item.dependentId !== targetId
          );
          if (state.fields.length < originalLength) {
            deleted = true;
            break;
          }
        }
        // Handle object with nested arrays
        else if (typeof state.fields === 'object') {
          const fieldsObj = state.fields as Record<string, any>;
          for (const key of Object.keys(fieldsObj)) {
            if (Array.isArray(fieldsObj[key])) {
              const originalLength = fieldsObj[key].length;
              fieldsObj[key] = fieldsObj[key].filter(
                (item: any) => item.id !== targetId && item.entityId !== targetId && item.dependentId !== targetId
              );
              if (fieldsObj[key].length < originalLength) {
                deleted = true;
                break;
              }
            }
          }
          if (deleted) break;
        }
      }
    }
    
    if (!deleted) {
      return {
        success: false,
        actionName: action.name,
        fields,
        message: `Could not find item to delete. ${targetId ? `No item with ID ${targetId} was found.` : 'Please specify a target ID.'}`
      };
    }
  }
  
  // Build success message
  let message = action.successMessage || `Successfully executed: ${action.name}`;
  
  // Replace placeholders in success message
  for (const [key, value] of Object.entries(fields)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'gi'), String(value));
  }
  
  return {
    success: true,
    actionName: action.name,
    fields,
    message,
    updatedMockState
  };
}

export async function generateAgentResponse(
  agent: AgentContext,
  userMessage: string,
  chatHistory: ChatHistory[] = []
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const systemPrompt = getSystemPrompt(agent);

  const contents = [
    ...chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: contents,
    });

    return response.text || "I apologize, but I was unable to generate a response. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate response: ${error?.message || error}`);
  }
}

// Available placeholders for custom prompts
const PROMPT_PLACEHOLDERS = {
  name: "{{name}}",
  businessUseCase: "{{businessUseCase}}",
  domainKnowledge: "{{domainKnowledge}}",
  validationRules: "{{validationRules}}",
  guardrails: "{{guardrails}}",
  sampleDatasets: "{{sampleDatasets}}",
  currentDate: "{{currentDate}}",
};

// Build domain knowledge section including documents
function buildDomainKnowledgeText(agent: AgentContext): string {
  let section = "";
  
  if (agent.domainKnowledge) {
    section += agent.domainKnowledge;
  }
  
  if (agent.domainDocuments && agent.domainDocuments.length > 0) {
    if (section) section += "\n\n";
    section += "Reference Documents:";
    for (const doc of agent.domainDocuments) {
      section += `\n\n--- ${doc.filename} ---\n${doc.content}`;
    }
  }
  
  return section;
}

// Helper to strip markdown code block markers from content
function stripCodeBlocks(content: string): string {
  // Remove opening code blocks like ```json, ```csv, ``` etc.
  let cleaned = content.replace(/^```(?:json|csv|text|)?\s*\n?/gi, '');
  // Remove closing code blocks
  cleaned = cleaned.replace(/\n?```\s*$/gi, '');
  return cleaned.trim();
}

// Build sample datasets section
function buildSampleDatasetsText(agent: AgentContext): string {
  if (!agent.sampleDatasets || agent.sampleDatasets.length === 0) {
    return "";
  }
  
  let section = "User Data Records:\n";
  for (const dataset of agent.sampleDatasets) {
    // Strip code block markers from the content
    const cleanedContent = stripCodeBlocks(dataset.content);
    section += `\n--- ${dataset.name} (${dataset.format.toUpperCase()}) ---\n${cleanedContent}\n`;
  }
  return section;
}

// Replace placeholders in custom prompt with actual values
function processCustomPrompt(customPrompt: string, agent: AgentContext): string {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const domainKnowledgeText = buildDomainKnowledgeText(agent);
  const sampleDatasetsText = buildSampleDatasetsText(agent);
  
  // Replace all placeholders with actual values
  let processedPrompt = customPrompt
    .replace(/\{\{name\}\}/gi, agent.name || "")
    .replace(/\{\{businessUseCase\}\}/gi, agent.businessUseCase || "")
    .replace(/\{\{domainKnowledge\}\}/gi, domainKnowledgeText)
    .replace(/\{\{validationRules\}\}/gi, agent.validationRules || "")
    .replace(/\{\{guardrails\}\}/gi, agent.guardrails || "")
    .replace(/\{\{sampleDatasets\}\}/gi, sampleDatasetsText)
    .replace(/\{\{currentDate\}\}/gi, currentDate);
  
  return processedPrompt;
}

// Check if custom prompt uses any placeholders
function hasPlaceholders(customPrompt: string): boolean {
  const placeholderPattern = /\{\{(name|businessUseCase|domainKnowledge|validationRules|guardrails|sampleDatasets|currentDate)\}\}/gi;
  return placeholderPattern.test(customPrompt);
}

// Build action simulation section for system prompt
function buildActionsText(agent: AgentContext): string {
  if (!agent.availableActions || agent.availableActions.length === 0) {
    return "";
  }
  
  let section = `## Available Actions (Action Simulation Mode)

You can SIMULATE performing the following actions when users request them. You should act as a helpful guide who "pretends" to take action on behalf of the user. This means you walk them through the process step-by-step, narrating what you're doing as if you're actually performing the action in a real system.

### How to Simulate Actions:

1. **Acknowledge the request** - Confirm you understand what they want to do
2. **Gather information** - If any required fields are missing, ask for them conversationally
3. **Walk through the steps** - Describe what you're doing step-by-step, as if you're navigating a real system:
   - "Let me pull up your account..."
   - "I'm navigating to the [relevant section]..."
   - "Now I'm entering the information you provided..."
   - "Submitting the request..."
4. **Execute the action** - Output the action block in this format (this is processed by the system):

\`\`\`action
ACTION: action_name
FIELDS: {"field_name": "value", "other_field": "value"}
\`\`\`

5. **Confirm completion** - After the action block, provide a friendly confirmation of what was done and any next steps

### Example Conversation Flow:

User: "I need to add my new baby to my health insurance"

Good response: "Congratulations on your new baby! I'd be happy to help you add them to your health insurance.

Let me walk you through this:

1. **Pulling up your benefits profile...** I can see you're currently enrolled in the Premium Health Plan.

2. **Navigating to dependent management...** I'm opening the section where we can add family members.

3. **Adding your new dependent...** I'll need a few details:
   - What is your baby's name?
   - What is their date of birth?
   - Would you like to add them to dental and vision as well?

[After user provides info]

Perfect! Let me complete this for you:

1. **Entering dependent information...** Adding [baby's name] as a dependent child.
2. **Updating coverage elections...** Adding them to your medical, dental, and vision plans.
3. **Submitting the changes...**

\`\`\`action
ACTION: add_dependent
FIELDS: {"name": "Baby Name", "relationship": "child", "dob": "2024-01-15", "plans": ["medical", "dental", "vision"]}
\`\`\`

Done! I've successfully added [baby's name] to your health insurance. The changes will be effective as of their birth date. You should receive a confirmation email shortly, and new insurance cards will be mailed within 7-10 business days.

Is there anything else you'd like me to help you with?"

### Available Actions:\n`;

  for (const action of agent.availableActions) {
    section += `\n**${action.name}** (${action.category})\n`;
    section += `Description: ${action.description}\n`;
    if (action.requiredFields.length > 0) {
      section += `Required fields:\n`;
      for (const field of action.requiredFields) {
        section += `  - ${field.name} (${field.type}): ${field.label}`;
        if (field.options) {
          section += ` [Options: ${field.options.join(", ")}]`;
        }
        section += `\n`;
      }
    }
    if (action.confirmationMessage) {
      section += `Confirmation to show before executing: "${action.confirmationMessage}"\n`;
    }
    if (action.successMessage) {
      section += `Success message to show after: "${action.successMessage}"\n`;
    }
  }
  
  section += `\n### Important Guidelines:
- Always narrate your actions as if you're actually performing them in a real system
- Reference the user's mock data when relevant (e.g., "I can see you're enrolled in...")
- Be conversational and helpful, not robotic
- Walk users through each step so they understand what's happening
- After completing an action, explain any next steps or what they should expect
`;
  
  return section;
}

// Build mock user state section for system prompt
function buildMockUserStateText(agent: AgentContext): string {
  if (!agent.mockUserState || agent.mockUserState.length === 0) {
    return "";
  }
  
  let section = "## Current User Profile (Mock Data for Simulation)\n\n";
  section += "This is the simulated user's current data. Reference this when answering questions about their profile or when actions would modify their data.\n\n";
  
  for (const state of agent.mockUserState) {
    section += `### ${state.name}\n`;
    if (state.description) {
      section += `${state.description}\n`;
    }
    section += "```json\n" + JSON.stringify(state.fields, null, 2) + "\n```\n\n";
  }
  
  return section;
}

function getSystemPrompt(agent: AgentContext): string {
  // Use custom prompt if the user has edited it
  if (agent.customPrompt && agent.customPrompt.trim()) {
    const customPrompt = agent.customPrompt.trim();
    
    // If custom prompt uses placeholders, process them
    if (hasPlaceholders(customPrompt)) {
      let prompt = processCustomPrompt(customPrompt, agent);
      // Also add actions and mock state
      const actionsText = buildActionsText(agent);
      const mockStateText = buildMockUserStateText(agent);
      if (actionsText) prompt += `\n\n${actionsText}`;
      if (mockStateText) prompt += `\n\n${mockStateText}`;
      return prompt;
    }
    
    // If no placeholders used, append domain knowledge and guardrails automatically
    // This ensures the agent still has access to important context
    const domainKnowledgeText = buildDomainKnowledgeText(agent);
    const sampleDatasetsText = buildSampleDatasetsText(agent);
    const actionsText = buildActionsText(agent);
    const mockStateText = buildMockUserStateText(agent);
    const currentDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    let fullPrompt = customPrompt;
    
    // Add current date
    fullPrompt += `\n\n## Current Date\nToday is: ${currentDate}`;
    
    // Add business use case if available
    if (agent.businessUseCase) {
      fullPrompt += `\n\n## Purpose\n${agent.businessUseCase}`;
    }
    
    // Add domain knowledge if available
    if (domainKnowledgeText) {
      fullPrompt += `\n\n## Domain Knowledge\n${domainKnowledgeText}`;
    }
    
    // Add sample datasets if available
    if (sampleDatasetsText) {
      fullPrompt += `\n\n## User Data\n${sampleDatasetsText}`;
    }
    
    // Add validation rules if available
    if (agent.validationRules) {
      fullPrompt += `\n\n## Validation Rules\n${agent.validationRules}`;
    }
    
    // Add guardrails if available - these are critical for safety
    if (agent.guardrails) {
      fullPrompt += `\n\n## Guardrails (CRITICAL - Must Follow)\n${agent.guardrails}`;
    }
    
    // Add available actions if configured
    if (actionsText) {
      fullPrompt += `\n\n${actionsText}`;
    }
    
    // Add mock user state if configured
    if (mockStateText) {
      fullPrompt += `\n\n${mockStateText}`;
    }
    
    return fullPrompt;
  }
  
  // Otherwise generate using the selected style
  const style = agent.promptStyle || "anthropic";
  const context: PromptContext = {
    name: agent.name,
    businessUseCase: agent.businessUseCase,
    domainKnowledge: agent.domainKnowledge,
    domainDocuments: agent.domainDocuments,
    sampleDatasets: agent.sampleDatasets,
    validationRules: agent.validationRules,
    guardrails: agent.guardrails,
  };
  
  return generatePrompt(style, context);
}

// Export for use in UI hints
export const AVAILABLE_PLACEHOLDERS = Object.values(PROMPT_PLACEHOLDERS);

export interface GenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  model?: GeminiModel;
}

export async function generateValidationRules(context: GenerationContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating validation rules for AI agents. Based on the business use case and domain knowledge provided, generate appropriate validation criteria in Markdown format.

The validation criteria should define WHAT MAKES A VALID REQUEST, not step-by-step processes:
1. Required Information - What information is needed (but agent can gather it flexibly)
2. Validation Criteria - What conditions must be met (e.g., "balance must be sufficient", "date must be in future")
3. What to do when validation fails - How to handle invalid requests

CRITICAL: Write CRITERIA and PRINCIPLES, not rigid step-by-step instructions.
- ✅ Good: "Verify time-off request doesn't exceed available balance. If insufficient, explain accrual schedule."
- ❌ Bad: "Step 1: Ask for start date. Step 2: Ask for end date. Step 3: Check balance."

The agent will apply these criteria flexibly in conversation. Focus on what makes requests valid/invalid.
Output ONLY the validation criteria in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate validation rules for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Input Validation Rules\n\n- Unable to generate validation rules. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate validation rules: ${error?.message || error}`);
  }
}

export async function generateGuardrails(context: GenerationContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating safety guardrails for AI agents. Based on the business use case and domain knowledge provided, generate appropriate guardrails in Markdown format.

The guardrails should define BOUNDARIES and ESCALATION CRITERIA:
1. What NOT to do - Specific actions/topics the agent should avoid
2. When to escalate - Clear criteria for routing to human support (not rigid rules)
3. Privacy/Security - What sensitive data to protect

CRITICAL: Write PRINCIPLES that guide behavior, not rigid scripts.
- ✅ Good: "Don't approve time-off requests (only managers can). Escalate when: request violates blackout period, balance calculation unclear."
- ❌ Bad: "If user asks to approve, say 'I cannot approve requests' and ask if they want to view instead."

Focus on defining boundaries and escalation triggers. The agent will apply these principles naturally.
Output ONLY the guardrails in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate safety guardrails for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Agent Guardrails\n\n- Unable to generate guardrails. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate guardrails: ${error?.message || error}`);
  }
}

export interface SystemPromptContext {
  name: string;
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  validationRules?: string;
  guardrails?: string;
  promptStyle: PromptStyle;
  model?: GeminiModel;
}

export async function generateSystemPrompt(context: SystemPromptContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const styleInstructions: Record<PromptStyle, string> = {
    anthropic: `Generate the system prompt using Anthropic Claude's recommended XML-based format. Use XML tags like <role>, <purpose>, <context>, <rules>, and <constraints> to clearly separate different sections. This structured approach helps Claude understand boundaries between different types of information.`,
    gemini: `Generate the system prompt using Google Gemini's recommended Markdown-based format. Use clear Markdown headers (##) to organize sections. Place constraints and restrictions at the end of the prompt. Use bullet points for lists and keep the structure clean and readable.`,
    openai: `Generate the system prompt using OpenAI's recommended conversational format. Write the prompt as a natural conversation establishing the AI's role and behavior. Use clear, direct language without heavy formatting. Focus on tone and personality while maintaining clarity.`,
    custom: `Generate the system prompt in a clean, professional format. Use clear structure with sections for role, purpose, context, rules, and constraints. Adapt the format based on what works best for the specific use case.`,
  };

  const systemPrompt = `You are an expert prompt engineer specializing in creating high-quality system prompts for AI agents.

Your task is to generate a complete, production-ready system prompt for an AI agent based on the configuration provided.

${styleInstructions[context.promptStyle]}

The system prompt should:
1. Clearly establish the agent's identity and role
2. Define the agent's purpose based on the business use case
3. Incorporate any domain knowledge naturally
4. Include validation rules as behavioral guidelines
5. Embed guardrails as firm constraints the agent must follow
6. Be professional, clear, and comprehensive

Output ONLY the system prompt - no explanations, no code blocks, no markdown wrapping around the prompt itself. The output should be ready to use directly as a system prompt.`;

  const userPrompt = `Create a system prompt for an AI agent with the following configuration:

Agent Name: ${context.name}

Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge:\n${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

${context.validationRules ? `Validation Rules:\n${context.validationRules}` : ""}

${context.guardrails ? `Guardrails:\n${context.guardrails}` : ""}

Prompt Style: ${context.promptStyle}

Generate a complete system prompt following the ${context.promptStyle} prompt engineering best practices.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "Unable to generate system prompt. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate system prompt: ${error?.message || error}`);
  }
}

export interface SampleDataGenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  dataType?: string;
  recordCount?: number;
  format?: "json" | "csv" | "text";
  model?: GeminiModel;
}

export async function generateSampleData(context: SampleDataGenerationContext): Promise<SampleDataset> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const format = context.format || "json";
  const recordCount = context.recordCount || 10;
  const dataType = context.dataType || "sample records";

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const formatInstructions: Record<string, string> = {
    json: `Output the data as a valid JSON array. Each record should be a JSON object with relevant fields. Example format:
[
  { "field1": "value1", "field2": "value2" },
  { "field1": "value3", "field2": "value4" }
]`,
    csv: `Output the data as CSV format with a header row. Use comma as delimiter. Example format:
field1,field2,field3
value1,value2,value3
value4,value5,value6`,
    text: `Output the data as plain text with each record on a new line. Use a clear, consistent format that's easy to parse.`
  };

  const systemPrompt = `You are an expert at creating realistic sample datasets for AI chatbot testing. Based on the business use case and domain knowledge provided, generate sample data that would be useful for testing and training the chatbot.

The sample data should:
1. Be realistic and relevant to the business context
2. Include a variety of scenarios and edge cases
3. Contain accurate, plausible data (names, dates, numbers, etc.)
4. Be formatted consistently and ready to use

${formatInstructions[format]}

Generate exactly ${recordCount} records.
Output ONLY the data in the specified format, nothing else. No explanations, no code blocks, no markdown wrapping.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Data Type Requested: ${dataType}
Number of Records: ${recordCount}
Output Format: ${format.toUpperCase()}

Generate sample ${dataType} data for testing this AI chatbot.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    const dataset: SampleDataset = {
      id: uuidv4(),
      name: `Generated ${dataType} (${format.toUpperCase()})`,
      description: `AI-generated sample ${dataType} with ${recordCount} records`,
      content: content,
      format: format,
      isGenerated: true,
      createdAt: new Date().toISOString(),
    };

    return dataset;
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate sample data: ${error?.message || error}`);
  }
}

export async function evaluateContextSufficiency(
  context: GenerationContext,
  generationType: "validation" | "guardrails"
): Promise<ContextEvaluationResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content.slice(0, 500)}`).join("\n\n")
    : "";

  const typeDescription = generationType === "validation" 
    ? "input/output validation rules (data formats, required fields, constraints)"
    : "safety guardrails (content restrictions, safety boundaries, escalation triggers)";

  const systemPrompt = `You are an expert at evaluating whether there is enough context to generate high-quality ${typeDescription} for an AI agent.

Your task is to analyze the provided business use case and domain knowledge to determine if there is sufficient information.

You must respond with ONLY a JSON object in this exact format:
{
  "hasEnoughContext": true/false,
  "missingAreas": ["area1", "area2"],
  "initialQuestion": "Your first clarifying question if context is insufficient, or null if sufficient"
}

Consider these factors:
- Is the business use case specific enough to understand what the agent does?
- Are there enough details about the types of inputs/data the agent will handle?
- Is the industry/domain context clear enough?
- For validation rules: Are data types, formats, and constraints inferable?
- For guardrails: Are sensitive topics, risks, and boundaries identifiable?

Be reasonable - you don't need exhaustive detail, just enough to generate useful ${generationType === "validation" ? "rules" : "guardrails"}.
If the context is minimal (e.g., just a brief use case with no domain knowledge), mark hasEnoughContext as false.`;

  const userPrompt = `Evaluate if there is enough context to generate ${generationType === "validation" ? "validation rules" : "guardrails"}:

Business Use Case: ${context.businessUseCase || "(empty)"}

Domain Knowledge: ${context.domainKnowledge || "(empty)"}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : "Domain Documents: (none)"}

Respond with the JSON evaluation.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        hasEnoughContext: result.hasEnoughContext === true,
        missingAreas: result.missingAreas || [],
        initialQuestion: result.initialQuestion || null,
      };
    }
    
    return {
      hasEnoughContext: true,
      missingAreas: [],
      initialQuestion: null,
    };
  } catch (error: any) {
    console.error("Context evaluation error:", error?.message || error);
    return {
      hasEnoughContext: true,
      missingAreas: [],
      initialQuestion: null,
    };
  }
}

export async function processClarifyingChat(
  context: ClarifyingChatContext,
  userMessage: string
): Promise<ClarifyingChatResponse> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content.slice(0, 300)}`).join("\n\n")
    : "";

  const existingInsights = context.clarifyingInsights?.length
    ? context.clarifyingInsights.map(i => `Q: ${i.question}\nA: ${i.answer}`).join("\n\n")
    : "";

  const typeDescription = context.generationType === "validation" 
    ? "input/output validation rules"
    : "safety guardrails";

  const systemPrompt = `You are a helpful assistant gathering information to generate high-quality ${typeDescription} for an AI agent.

Current context about the agent:
- Business Use Case: ${context.businessUseCase || "(not specified)"}
- Domain Knowledge: ${context.domainKnowledge || "(none)"}
${domainDocsText ? `- Domain Documents:\n${domainDocsText}` : ""}
${existingInsights ? `\nPreviously gathered insights:\n${existingInsights}` : ""}

Your role:
1. Ask ONE focused clarifying question at a time to gather missing information
2. After the user answers, acknowledge their response briefly
3. If you now have enough context, say you're ready to generate
4. Keep questions conversational and easy to understand

You must respond with ONLY a JSON object:
{
  "message": "Your response message to the user",
  "isReadyToGenerate": true/false,
  "gatheredInsight": {
    "question": "The question you asked that they answered",
    "answer": "Summary of their answer (if they just responded to a question)"
  }
}

Set isReadyToGenerate to true only when you have gathered enough useful information (after 1-3 questions typically).
If the user just answered a question, include gatheredInsight. If you're asking the first question, omit it.`;

  const contents = [
    ...context.chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: contents,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const chatResponse: ClarifyingChatResponse = {
        message: result.message || "I'm ready to generate now.",
        isReadyToGenerate: result.isReadyToGenerate === true,
      };
      
      if (result.gatheredInsight?.question && result.gatheredInsight?.answer) {
        chatResponse.gatheredInsight = {
          id: uuidv4(),
          question: result.gatheredInsight.question,
          answer: result.gatheredInsight.answer,
          category: context.generationType === "validation" ? "validation" : "guardrails",
          createdAt: new Date().toISOString(),
        };
      }
      
      return chatResponse;
    }
    
    return {
      message: "I have enough information now. Ready to generate!",
      isReadyToGenerate: true,
    };
  } catch (error: any) {
    console.error("Clarifying chat error:", error?.message || error);
    throw new Error(`Failed to process chat: ${error?.message || error}`);
  }
}

export async function generateValidationRulesWithInsights(
  context: GenerationContext & { clarifyingInsights?: ClarifyingInsight[] }
): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const insightsText = context.clarifyingInsights?.length
    ? context.clarifyingInsights
        .filter(i => i.category === "validation" || i.category === "general")
        .map(i => `Q: ${i.question}\nA: ${i.answer}`)
        .join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating validation rules for AI agents. Based on the business use case, domain knowledge, and additional insights provided, generate appropriate validation criteria in Markdown format.

The validation criteria should define WHAT MAKES A VALID REQUEST, not step-by-step processes:
1. Required Information - What information is needed (but agent can gather it flexibly)
2. Validation Criteria - What conditions must be met (e.g., "balance must be sufficient", "date must be in future")
3. What to do when validation fails - How to handle invalid requests

CRITICAL: Write CRITERIA and PRINCIPLES, not rigid step-by-step instructions.
- ✅ Good: "Verify time-off request doesn't exceed available balance. If insufficient, explain accrual schedule."
- ❌ Bad: "Step 1: Ask for start date. Step 2: Ask for end date. Step 3: Check balance."

The agent will apply these criteria flexibly in conversation. Focus on what makes requests valid/invalid.
Output ONLY the validation criteria in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

${insightsText ? `Additional Context from Q&A:\n${insightsText}` : ""}

Generate validation rules for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Input Validation Rules\n\n- Unable to generate validation rules. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate validation rules: ${error?.message || error}`);
  }
}

export async function generateGuardrailsWithInsights(
  context: GenerationContext & { clarifyingInsights?: ClarifyingInsight[] }
): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const insightsText = context.clarifyingInsights?.length
    ? context.clarifyingInsights
        .filter(i => i.category === "guardrails" || i.category === "general")
        .map(i => `Q: ${i.question}\nA: ${i.answer}`)
        .join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating safety guardrails for AI agents. Based on the business use case, domain knowledge, and additional insights provided, generate appropriate guardrails in Markdown format.

The guardrails should define BOUNDARIES and ESCALATION CRITERIA:
1. What NOT to do - Specific actions/topics the agent should avoid
2. When to escalate - Clear criteria for routing to human support (not rigid rules)
3. Privacy/Security - What sensitive data to protect

CRITICAL: Write PRINCIPLES that guide behavior, not rigid scripts.
- ✅ Good: "Don't approve time-off requests (only managers can). Escalate when: request violates blackout period, balance calculation unclear."
- ❌ Bad: "If user asks to approve, say 'I cannot approve requests' and ask if they want to view instead."

Focus on defining boundaries and escalation triggers. The agent will apply these principles naturally.
Output ONLY the guardrails in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

${insightsText ? `Additional Context from Q&A:\n${insightsText}` : ""}

Generate safety guardrails for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Agent Guardrails\n\n- Unable to generate guardrails. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate guardrails: ${error?.message || error}`);
  }
}

// ====== Action Simulation Generation ======

export interface ActionsGenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  model?: GeminiModel;
}

export interface GeneratedActionsResult {
  actions: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    requiredFields: Array<{
      name: string;
      type: "string" | "number" | "boolean" | "date" | "select";
      label: string;
      required: boolean;
      options?: string[];
      description?: string;
    }>;
    confirmationMessage: string;
    successMessage: string;
    affectedDataFields: string[];
  }>;
  mockUserState: Array<{
    id: string;
    name: string;
    description: string;
    fields: Record<string, any>;
    isGenerated: boolean;
    createdAt: string;
  }>;
}

export async function generateActionsAndMockData(context: ActionsGenerationContext): Promise<GeneratedActionsResult> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at designing agent capabilities for HR/business AI assistants. Based on the business use case, generate a list of ACTIONS the agent can simulate (fake execute) and MOCK USER DATA for testing.

Your response must be ONLY valid JSON with this exact structure:
{
  "actions": [
    {
      "name": "action_name_snake_case",
      "description": "What this action does",
      "category": "category_name",
      "requiredFields": [
        {
          "name": "field_name",
          "type": "string|number|boolean|date|select",
          "label": "Human Readable Label",
          "required": true,
          "options": ["option1", "option2"],
          "description": "Field description"
        }
      ],
      "confirmationMessage": "Message shown before executing: You are about to...",
      "successMessage": "Message shown after success: Successfully...",
      "affectedDataFields": ["field1", "field2"]
    }
  ],
  "mockUserState": [
    {
      "name": "Profile/Record Name",
      "description": "What this data represents",
      "fields": {
        "fieldName": "value",
        "anotherField": 123
      }
    }
  ]
}

Guidelines:
1. Generate 3-8 realistic actions the agent could perform
2. Actions should be things users would ask to do (submit, update, add, remove, request, etc.)
3. Each action should have realistic required fields
4. Generate 1-3 mock data profiles with realistic sample data
5. Mock data should include fields that actions will read/modify
6. Use realistic but clearly fake sample data (e.g., "Jane Doe", "john.smith@company.com")

Output ONLY the JSON, no markdown, no explanation.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate actions and mock user data for this AI agent.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    // Parse the JSON response
    let parsed;
    try {
      // Clean up potential markdown wrapping
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse generated actions JSON:", content);
      throw new Error("Failed to parse generated actions. Please try again.");
    }

    // Add IDs and timestamps to the parsed data
    const now = new Date().toISOString();
    const actions = (parsed.actions || []).map((action: any, index: number) => ({
      id: uuidv4(),
      name: action.name || `action_${index}`,
      description: action.description || "",
      category: action.category || "general",
      requiredFields: (action.requiredFields || []).map((field: any) => ({
        name: field.name || "",
        type: field.type || "string",
        label: field.label || field.name || "",
        required: field.required !== false,
        options: field.options,
        description: field.description,
      })),
      confirmationMessage: action.confirmationMessage || "",
      successMessage: action.successMessage || "",
      affectedDataFields: action.affectedDataFields || [],
    }));

    const mockUserState = (parsed.mockUserState || []).map((state: any) => ({
      id: uuidv4(),
      name: state.name || "Mock Profile",
      description: state.description || "",
      fields: state.fields || {},
      isGenerated: true,
      createdAt: now,
    }));

    return { actions, mockUserState };
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate actions: ${error?.message || error}`);
  }
}

// Smart Business Case Extractor
// Reads extraction rules from config file and extracts only prompt-relevant content

export interface ExtractionRulesConfig {
  description: string;
  version: string;
  keepCategories: Record<string, {
    description: string;
    keywords: string[];
    sectionHeaders: string[];
  }>;
  discardCategories: Record<string, {
    description: string;
    keywords: string[];
    sectionHeaders: string[];
  }>;
  extractionPrompt: string;
  outputFormat: {
    includeExtractedSections: boolean;
    includeDiscardedSummary: boolean;
    maxLength: number;
  };
}

export interface ExtractionResult {
  extractedContent: string;
  discardedSummary: string[];
  keepCategories: string[];
  success: boolean;
  error?: string;
}

function loadExtractionRules(): ExtractionRulesConfig {
  // Use process.cwd() which is reliable in both ESM and CJS environments
  const rulesPath = path.join(process.cwd(), "server", "extraction-rules.json");
  
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, "utf-8");
    return JSON.parse(content);
  }
  
  throw new Error(`Extraction rules config not found at: ${rulesPath}`);
}

export async function extractBusinessCaseContent(
  businessCaseText: string,
  model?: GeminiModel
): Promise<ExtractionResult> {
  const modelToUse = model || defaultGenerationModel;
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Load the extraction rules from config
  let rules: ExtractionRulesConfig;
  try {
    rules = loadExtractionRules();
  } catch (error: any) {
    console.error("Failed to load extraction rules:", error?.message || error);
    return {
      extractedContent: businessCaseText,
      discardedSummary: [],
      keepCategories: [],
      success: false,
      error: "Failed to load extraction rules config: " + (error?.message || String(error))
    };
  }

  // Build the system prompt from config
  const keepCategoriesList = Object.entries(rules.keepCategories)
    .map(([name, cat]) => `- **${name}**: ${cat.description}`)
    .join("\n");
  
  const discardCategoriesList = Object.entries(rules.discardCategories)
    .map(([name, cat]) => `- **${name}**: ${cat.description}`)
    .join("\n");

  const systemPrompt = `${rules.extractionPrompt}

## Categories to KEEP (extract this content):
${keepCategoriesList}

## Categories to DISCARD (remove this content):
${discardCategoriesList}

Respond with a JSON object containing:
{
  "extractedContent": "The cleaned business case with only prompt-relevant content, formatted clearly",
  "discardedSummary": ["List of section names/topics that were removed"],
  "keepCategories": ["List of categories that were found and kept"]
}

Keep the extracted content well-organized and readable. Remove any ROI formulas, metrics, implementation plans, and executive summaries. Focus on what defines agent behavior.`;

  const userPrompt = `Extract the prompt-relevant content from this business case document:

---
${businessCaseText}
---

Return only the JSON response with extracted content.`;

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    // Parse the JSON response
    let parsed;
    try {
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse extraction result:", content);
      return {
        extractedContent: businessCaseText,
        discardedSummary: [],
        keepCategories: [],
        success: false,
        error: "Failed to parse extraction result"
      };
    }

    // Enforce max length if configured
    let extractedContent = parsed.extractedContent || businessCaseText;
    if (rules.outputFormat.maxLength && extractedContent.length > rules.outputFormat.maxLength) {
      extractedContent = extractedContent.substring(0, rules.outputFormat.maxLength) + "\n\n[Content truncated to fit maximum length]";
    }

    return {
      extractedContent,
      discardedSummary: parsed.discardedSummary || [],
      keepCategories: parsed.keepCategories || [],
      success: true
    };
  } catch (error: any) {
    console.error("Gemini API error during extraction:", error?.message || error);
    return {
      extractedContent: businessCaseText,
      discardedSummary: [],
      keepCategories: [],
      success: false,
      error: `Extraction failed: ${error?.message || error}`
    };
  }
}
