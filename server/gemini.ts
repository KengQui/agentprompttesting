import { GoogleGenAI } from "@google/genai";
import { generatePrompt, type PromptContext } from "./prompt-templates";
import type { PromptStyle, DomainDocument, GeminiModel, SampleDataset, ClarifyingInsight } from "@shared/schema";
import { defaultGenerationModel } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";

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
}

export interface ChatHistory {
  role: "user" | "assistant";
  content: string;
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

// Build sample datasets section
function buildSampleDatasetsText(agent: AgentContext): string {
  if (!agent.sampleDatasets || agent.sampleDatasets.length === 0) {
    return "";
  }
  
  let section = "User Data Records:\n";
  for (const dataset of agent.sampleDatasets) {
    section += `\n--- ${dataset.name} (${dataset.format.toUpperCase()}) ---\n${dataset.content}\n`;
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

function getSystemPrompt(agent: AgentContext): string {
  // Use custom prompt if the user has edited it
  if (agent.customPrompt && agent.customPrompt.trim()) {
    const customPrompt = agent.customPrompt.trim();
    
    // If custom prompt uses placeholders, process them
    if (hasPlaceholders(customPrompt)) {
      return processCustomPrompt(customPrompt, agent);
    }
    
    // If no placeholders used, append domain knowledge and guardrails automatically
    // This ensures the agent still has access to important context
    const domainKnowledgeText = buildDomainKnowledgeText(agent);
    const sampleDatasetsText = buildSampleDatasetsText(agent);
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
