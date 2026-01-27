import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Agent, InsertAgent, UpdateAgent, ChatMessage, InsertChatMessage } from "@shared/schema";

const AGENTS_DIR = "./agents";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAgentDir(agentId: string) {
  return path.join(AGENTS_DIR, agentId);
}

function getConfigPath(agentId: string) {
  return path.join(getAgentDir(agentId), "config.yaml");
}

function getChatPath(agentId: string) {
  return path.join(getAgentDir(agentId), "chat.json");
}

export interface IStorage {
  // Agent operations
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, updates: UpdateAgent): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  
  // Chat operations
  getMessages(agentId: string): Promise<ChatMessage[]>;
  addMessage(message: InsertChatMessage): Promise<ChatMessage>;
  clearMessages(agentId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent>;
  private messages: Map<string, ChatMessage[]>;

  constructor() {
    this.agents = new Map();
    this.messages = new Map();
    this.loadFromDisk();
  }

  private loadFromDisk() {
    ensureDir(AGENTS_DIR);
    
    try {
      const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
      
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const agentId = dir.name;
          const configPath = getConfigPath(agentId);
          const chatPath = getChatPath(agentId);
          
          // Load agent config
          if (fs.existsSync(configPath)) {
            try {
              const content = fs.readFileSync(configPath, "utf-8");
              const agent = this.parseYamlConfig(content, agentId);
              if (agent) {
                this.agents.set(agentId, agent);
              }
            } catch (e) {
              console.error(`Failed to load agent ${agentId}:`, e);
            }
          }
          
          // Load chat history
          if (fs.existsSync(chatPath)) {
            try {
              const content = fs.readFileSync(chatPath, "utf-8");
              const messages = JSON.parse(content) as ChatMessage[];
              this.messages.set(agentId, messages);
            } catch (e) {
              console.error(`Failed to load chat for agent ${agentId}:`, e);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load agents from disk:", e);
    }
  }

  private parseYamlConfig(content: string, agentId: string): Agent | null {
    // Simple YAML parser for our format
    const lines = content.split("\n");
    const agent: Partial<Agent> = { id: agentId };
    let currentKey = "";
    let multilineValue = "";
    let inMultiline = false;

    for (const line of lines) {
      if (line.startsWith("  ") && inMultiline) {
        multilineValue += (multilineValue ? "\n" : "") + line.substring(2);
      } else if (line.match(/^[a-zA-Z_]+:\s*\|$/)) {
        if (inMultiline && currentKey) {
          (agent as any)[currentKey] = multilineValue.trim();
        }
        currentKey = line.split(":")[0];
        multilineValue = "";
        inMultiline = true;
      } else if (line.match(/^[a-zA-Z_]+:/)) {
        if (inMultiline && currentKey) {
          (agent as any)[currentKey] = multilineValue.trim();
          inMultiline = false;
        }
        const [key, ...valueParts] = line.split(":");
        const value = valueParts.join(":").trim();
        if (value) {
          (agent as any)[key] = value.replace(/^["']|["']$/g, "");
        }
        currentKey = key;
      }
    }

    if (inMultiline && currentKey) {
      (agent as any)[currentKey] = multilineValue.trim();
    }

    if (!agent.name || !agent.createdAt) {
      return null;
    }

    return agent as Agent;
  }

  private saveAgentToDisk(agent: Agent) {
    const agentDir = getAgentDir(agent.id);
    ensureDir(agentDir);

    // Save as YAML-like format for readability
    const yaml = `name: "${agent.name}"
status: ${agent.status}
createdAt: ${agent.createdAt}
updatedAt: ${agent.updatedAt}

businessUseCase: |
  ${(agent.businessUseCase || "").split("\n").join("\n  ")}

description: |
  ${(agent.description || "").split("\n").join("\n  ")}

validationRules: |
  ${(agent.validationRules || "").split("\n").join("\n  ")}

guardrails: |
  ${(agent.guardrails || "").split("\n").join("\n  ")}
`;

    fs.writeFileSync(getConfigPath(agent.id), yaml, "utf-8");
  }

  private saveMessagesToDisk(agentId: string) {
    const messages = this.messages.get(agentId) || [];
    const chatPath = getChatPath(agentId);
    ensureDir(getAgentDir(agentId));
    fs.writeFileSync(chatPath, JSON.stringify(messages, null, 2), "utf-8");
  }

  private deleteAgentFromDisk(agentId: string) {
    const agentDir = getAgentDir(agentId);
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true, force: true });
    }
  }

  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    return this.agents.get(id);
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Agent is "configured" when created through wizard (has name and business use case)
    // Status is "draft" only if explicitly set, otherwise defaults to "configured"
    const hasRequiredFields = insertAgent.name && insertAgent.businessUseCase;
    const status = insertAgent.status === "draft" && hasRequiredFields ? "configured" : (insertAgent.status || "configured");
    
    const agent: Agent = {
      id,
      name: insertAgent.name,
      businessUseCase: insertAgent.businessUseCase,
      description: insertAgent.description || "",
      validationRules: insertAgent.validationRules || "",
      guardrails: insertAgent.guardrails || "",
      status,
      createdAt: now,
      updatedAt: now,
    };

    this.agents.set(id, agent);
    this.saveAgentToDisk(agent);
    return agent;
  }

  async updateAgent(id: string, updates: UpdateAgent): Promise<Agent | undefined> {
    const agent = this.agents.get(id);
    if (!agent) return undefined;

    const updatedAgent: Agent = {
      ...agent,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.agents.set(id, updatedAgent);
    this.saveAgentToDisk(updatedAgent);
    return updatedAgent;
  }

  async deleteAgent(id: string): Promise<boolean> {
    if (!this.agents.has(id)) return false;
    
    this.agents.delete(id);
    this.messages.delete(id);
    this.deleteAgentFromDisk(id);
    return true;
  }

  async getMessages(agentId: string): Promise<ChatMessage[]> {
    return this.messages.get(agentId) || [];
  }

  async addMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      id,
      agentId: insertMessage.agentId,
      role: insertMessage.role,
      content: insertMessage.content,
      timestamp: new Date().toISOString(),
    };

    const messages = this.messages.get(insertMessage.agentId) || [];
    messages.push(message);
    this.messages.set(insertMessage.agentId, messages);
    this.saveMessagesToDisk(insertMessage.agentId);
    return message;
  }

  async clearMessages(agentId: string): Promise<void> {
    this.messages.set(agentId, []);
    this.saveMessagesToDisk(agentId);
  }
}

export const storage = new MemStorage();
