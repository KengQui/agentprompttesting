import { GoogleGenAI } from "@google/genai";

// Google AI Studio SDK integration for Gemini
// Requires GEMINI_API_KEY secret to be set
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

export interface AgentContext {
  name: string;
  businessUseCase: string;
  description: string;
  validationRules: string;
  guardrails: string;
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

  const systemPrompt = buildSystemPrompt(agent);

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

function buildSystemPrompt(agent: AgentContext): string {
  let systemPrompt = `You are an AI assistant named "${agent.name}".`;

  if (agent.businessUseCase) {
    systemPrompt += `\n\nYour purpose: ${agent.businessUseCase}`;
  }

  if (agent.description) {
    systemPrompt += `\n\nYour personality and behavior: ${agent.description}`;
  }

  if (agent.validationRules) {
    systemPrompt += `\n\nValidation rules you must follow:\n${agent.validationRules}`;
  }

  if (agent.guardrails) {
    systemPrompt += `\n\nGuardrails and restrictions:\n${agent.guardrails}`;
  }

  systemPrompt += `\n\nAlways be helpful, accurate, and stay within your defined scope. If a request falls outside your capabilities or guardrails, politely explain why you cannot assist with that specific request.`;

  return systemPrompt;
}
