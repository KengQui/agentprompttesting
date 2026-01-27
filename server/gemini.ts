import { GoogleGenAI } from "@google/genai";
import { generatePrompt, type PromptContext } from "./prompt-templates";
import type { PromptStyle, DomainDocument } from "@shared/schema";

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

function getSystemPrompt(agent: AgentContext): string {
  // Use custom prompt if the user has edited it
  if (agent.customPrompt && agent.customPrompt.trim()) {
    return agent.customPrompt;
  }
  
  // Otherwise generate using the selected style
  const style = agent.promptStyle || "anthropic";
  const context: PromptContext = {
    name: agent.name,
    businessUseCase: agent.businessUseCase,
    domainKnowledge: agent.domainKnowledge,
    domainDocuments: agent.domainDocuments,
    validationRules: agent.validationRules,
    guardrails: agent.guardrails,
  };
  
  return generatePrompt(style, context);
}

export interface GenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
}

export async function generateValidationRules(context: GenerationContext): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating validation rules for AI agents. Based on the business use case and domain knowledge provided, generate appropriate validation rules in Markdown format.

The validation rules should include:
1. Input Validation Rules - Required fields, format requirements, pattern matching
2. Response Validation - Output constraints, quality checks, approval thresholds

Keep the rules specific to the business context provided. Use bullet points and organize with headers.
Output ONLY the validation rules in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate validation rules for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating safety guardrails for AI agents. Based on the business use case and domain knowledge provided, generate appropriate guardrails in Markdown format.

The guardrails should include:
1. Content Restrictions - Topics to avoid, competitor mentions, sensitive information
2. Safety Boundaries - Actions the agent should never take, escalation triggers

Keep the guardrails specific to the business context provided. Use bullet points and organize with headers.
Output ONLY the guardrails in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate safety guardrails for an AI agent handling this use case.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
}

export async function generateSystemPrompt(context: SystemPromptContext): Promise<string> {
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
      model: "gemini-2.0-flash",
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
