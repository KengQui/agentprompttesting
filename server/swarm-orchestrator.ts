import { storage } from "./storage";
import { generateAgentResponse, type AgentContext, type ChatHistory } from "./gemini";
import { getBryteSystemPrompt } from "./prompt-templates";
import type { Agent, SwarmMessage } from "@shared/schema";

export interface SwarmRoutingResult {
  agentId: string;
  agentName: string;
  reason: string;
  response: string;
}

interface AgentCapability {
  agentId: string;
  name: string;
  role: string;
  businessUseCase: string;
}

let routingGenAI: any = null;

async function getRoutingAI() {
  if (!routingGenAI) {
    const { GoogleGenAI } = await import("@google/genai");
    routingGenAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return routingGenAI;
}

function buildAgentCapabilities(
  agents: Agent[],
  swarmAgentRoles: Map<string, string>
): AgentCapability[] {
  return agents.map((agent) => ({
    agentId: agent.id,
    name: agent.name,
    role: swarmAgentRoles.get(agent.id) || "",
    businessUseCase: agent.businessUseCase.slice(0, 300),
  }));
}

function buildRoutingPrompt(capabilities: AgentCapability[]): string {
  let prompt = `You are the Bryte Orchestrator. Your job is to analyze the user's message and decide which agent should handle it.

Available agents:
`;
  for (const cap of capabilities) {
    prompt += `\n- Agent "${cap.name}" (ID: ${cap.agentId})`;
    if (cap.role) {
      prompt += `\n  Role: ${cap.role}`;
    }
    prompt += `\n  Purpose: ${cap.businessUseCase}`;
  }

  prompt += `

INSTRUCTIONS:
- Analyze the user message and determine which single agent is the best fit.
- Consider the agent's role description and business use case.
- If the message is a follow-up to a previous topic, prefer the agent that was previously handling it.
- If no agent is a clear match, respond with NONE and explain why.

Respond in this exact JSON format (no markdown, no code blocks):
{"agentId": "<agent_id>", "agentName": "<agent_name>", "reason": "<brief reason for selection>"}

If no agent matches:
{"agentId": "NONE", "agentName": "NONE", "reason": "<explanation of why no agent matches>"}`;

  return prompt;
}

function extractLastRoutedAgent(messages: SwarmMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].routedToAgentId) {
      return messages[i].routedToAgentId;
    }
  }
  return null;
}

function buildSwarmChatHistory(messages: SwarmMessage[]): ChatHistory[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

export async function routeMessage(
  swarmId: string,
  sessionId: string,
  userMessage: string
): Promise<SwarmRoutingResult> {
  const swarmAgents = await storage.getSwarmAgents(swarmId);
  if (swarmAgents.length === 0) {
    return {
      agentId: "NONE",
      agentName: "Bryte Assistant",
      reason: "No agents are connected to this swarm",
      response:
        "I don't have any specialized agents connected right now. Please ask an administrator to configure the swarm with the appropriate agents.",
    };
  }

  const agentIds = swarmAgents.map((sa: any) => sa.agentId);
  const swarmAgentRoles = new Map<string, string>();
  for (const sa of swarmAgents) {
    swarmAgentRoles.set(sa.agentId as string, (sa as any).role || "");
  }

  const agents: Agent[] = [];
  for (const id of agentIds) {
    const agent = await storage.getAgent(id as string);
    if (agent) agents.push(agent);
  }

  if (agents.length === 0) {
    return {
      agentId: "NONE",
      agentName: "Bryte Assistant",
      reason: "Connected agents could not be found",
      response:
        "The agents connected to this swarm are no longer available. Please update the swarm configuration.",
    };
  }

  const existingMessages = await storage.getSwarmMessages(sessionId);
  const lastRoutedAgentId = extractLastRoutedAgent(existingMessages);

  let selectedAgentId: string;
  let selectedAgentName: string;
  let routingReason: string;

  if (lastRoutedAgentId && agents.find((a) => a.id === lastRoutedAgentId)) {
    const shouldReroute = await detectTopicSwitch(
      userMessage,
      existingMessages,
      agents,
      swarmAgentRoles,
      lastRoutedAgentId
    );

    if (!shouldReroute) {
      const lastAgent = agents.find((a) => a.id === lastRoutedAgentId)!;
      selectedAgentId = lastAgent.id;
      selectedAgentName = lastAgent.name;
      routingReason = "Continuing previous conversation";
    } else {
      const routing = await classifyAndRoute(
        userMessage,
        agents,
        swarmAgentRoles,
        existingMessages
      );
      selectedAgentId = routing.agentId;
      selectedAgentName = routing.agentName;
      routingReason = routing.reason;
    }
  } else {
    const routing = await classifyAndRoute(
      userMessage,
      agents,
      swarmAgentRoles,
      existingMessages
    );
    selectedAgentId = routing.agentId;
    selectedAgentName = routing.agentName;
    routingReason = routing.reason;
  }

  if (selectedAgentId === "NONE") {
    const brytePrompt = getBryteSystemPrompt();
    const agentNames = agents.map((a) => a.name).join(", ");
    return {
      agentId: "NONE",
      agentName: "Bryte Assistant",
      reason: routingReason,
      response: `I wasn't sure which of my specialized agents would be the best fit for that request. I have access to: ${agentNames}. Could you tell me a bit more about what you need help with so I can route you to the right one?`,
    };
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  if (!selectedAgent) {
    return {
      agentId: "NONE",
      agentName: "Bryte Assistant",
      reason: "Selected agent not found",
      response: "I encountered an issue routing your request. Please try again.",
    };
  }

  const agentContext: AgentContext = {
    name: selectedAgent.name,
    businessUseCase: selectedAgent.businessUseCase,
    description: selectedAgent.description,
    domainKnowledge: selectedAgent.domainKnowledge || undefined,
    domainDocuments: selectedAgent.domainDocuments as any,
    sampleDatasets: selectedAgent.sampleDatasets as any,
    validationRules: selectedAgent.validationRules,
    guardrails: selectedAgent.guardrails,
    promptStyle: selectedAgent.promptStyle as any,
    customPrompt: selectedAgent.customPrompt || undefined,
    availableActions: selectedAgent.availableActions as any,
    mockUserState: selectedAgent.mockUserState as any,
  };

  const agentMessages = existingMessages.filter(
    (m) =>
      m.routedToAgentId === selectedAgentId ||
      m.role === "user"
  );
  const chatHistory = buildSwarmChatHistory(agentMessages);

  const response = await generateAgentResponse(
    agentContext,
    userMessage,
    chatHistory
  );

  return {
    agentId: selectedAgentId,
    agentName: selectedAgentName,
    reason: routingReason,
    response,
  };
}

async function classifyAndRoute(
  userMessage: string,
  agents: Agent[],
  swarmAgentRoles: Map<string, string>,
  existingMessages: SwarmMessage[]
): Promise<{ agentId: string; agentName: string; reason: string }> {
  const capabilities = buildAgentCapabilities(agents, swarmAgentRoles);
  const routingPrompt = buildRoutingPrompt(capabilities);

  let contextHint = "";
  if (existingMessages.length > 0) {
    const recentMessages = existingMessages.slice(-4);
    contextHint =
      "\n\nRecent conversation context:\n" +
      recentMessages
        .map(
          (m) =>
            `${m.role}: ${m.content.slice(0, 100)}${m.routedToAgentName ? ` [handled by ${m.routedToAgentName}]` : ""}`
        )
        .join("\n");
  }

  try {
    const ai = await getRoutingAI();
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: routingPrompt,
        maxOutputTokens: 200,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage + contextHint }],
        },
      ],
    });

    const text = result.text || "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        agentId: parsed.agentId || "NONE",
        agentName: parsed.agentName || "NONE",
        reason: parsed.reason || "No reason provided",
      };
    }
  } catch (error: any) {
    console.error("[SwarmOrchestrator] Routing error:", error?.message);
  }

  if (agents.length === 1) {
    return {
      agentId: agents[0].id,
      agentName: agents[0].name,
      reason: "Only one agent available — routing by default",
    };
  }

  return {
    agentId: "NONE",
    agentName: "NONE",
    reason: "Could not determine the best agent for this request",
  };
}

async function detectTopicSwitch(
  userMessage: string,
  existingMessages: SwarmMessage[],
  agents: Agent[],
  swarmAgentRoles: Map<string, string>,
  currentAgentId: string
): Promise<boolean> {
  const currentAgent = agents.find((a) => a.id === currentAgentId);
  if (!currentAgent) return true;

  const otherAgents = agents.filter((a) => a.id !== currentAgentId);
  if (otherAgents.length === 0) return false;

  const capabilities = buildAgentCapabilities(agents, swarmAgentRoles);

  const prompt = `You are analyzing whether a user's message represents a topic switch that should be routed to a different agent.

Current agent handling the conversation: "${currentAgent.name}" — ${currentAgent.businessUseCase.slice(0, 200)}

All available agents:
${capabilities.map((c) => `- "${c.name}": ${c.role || c.businessUseCase.slice(0, 150)}`).join("\n")}

Recent conversation:
${existingMessages.slice(-3).map((m) => `${m.role}: ${m.content.slice(0, 80)}`).join("\n")}

User's new message: "${userMessage}"

Does this message represent a TOPIC SWITCH away from what "${currentAgent.name}" handles, toward something another agent specializes in?

Respond with exactly: YES or NO`;

  try {
    const ai = await getRoutingAI();
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: prompt,
        maxOutputTokens: 10,
      },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
    });

    const answer = (result.text || "").trim().toUpperCase();
    return answer.startsWith("YES");
  } catch (error: any) {
    console.error("[SwarmOrchestrator] Topic switch detection error:", error?.message);
    return false;
  }
}
