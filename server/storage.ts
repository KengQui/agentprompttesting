import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Agent, InsertAgent, UpdateAgent, ChatMessage, InsertChatMessage, DomainDocument, SampleDataset, AgentStatus, PromptStyle, ClarifyingInsight, ChatSession, InsertChatSession, UpdateChatSession, ChatSessionWithPreview } from "@shared/schema";

const AGENTS_DIR = "./agents";
const COMPONENT_TEMPLATES_DIR = "./server/components";

// File names for the multi-file agent structure
const AGENT_FILES = {
  META: "meta.yaml",
  BUSINESS_USE_CASE: "business-use-case.md",
  DOMAIN_KNOWLEDGE: "domain-knowledge.md",
  VALIDATION_RULES: "validation-rules.yaml",
  GUARDRAILS: "guardrails.yaml",
  CUSTOM_PROMPT: "custom-prompt.md",
  DOMAIN_DOCUMENTS: "domain-documents.json",
  SAMPLE_DATA: "sample-data.json",
  CHAT: "chat.json",
  SESSIONS: "sessions.json",
  // Legacy file for migration
  LEGACY_CONFIG: "config.yaml",
  LEGACY_DATA: "data.json",
};

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getAgentDir(agentId: string) {
  return path.join(AGENTS_DIR, agentId);
}

function getAgentFilePath(agentId: string, fileName: string) {
  return path.join(getAgentDir(agentId), fileName);
}

function getChatPath(agentId: string) {
  return getAgentFilePath(agentId, AGENT_FILES.CHAT);
}

function getSessionsDir(agentId: string) {
  return path.join(getAgentDir(agentId), "sessions");
}

function getSessionDir(agentId: string, sessionId: string) {
  return path.join(getSessionsDir(agentId), sessionId);
}

function getSessionMessagesPath(agentId: string, sessionId: string) {
  return path.join(getSessionDir(agentId, sessionId), "messages.json");
}

function getComponentsDir(agentId: string) {
  return path.join(getAgentDir(agentId), "components");
}

// Helper to read a text file safely
function readTextFile(filePath: string): string {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8").trim();
  }
  return "";
}

// Helper to write a text file
function writeTextFile(filePath: string, content: string) {
  fs.writeFileSync(filePath, content || "", "utf-8");
}

// Helper to read a JSON file safely
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch (e) {
      console.error(`Failed to parse JSON file ${filePath}:`, e);
      return defaultValue;
    }
  }
  return defaultValue;
}

// Helper to write a JSON file
function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// Parse simple YAML for meta.yaml (key: value format only)
function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      result[key] = value.replace(/^["']|["']$/g, "").trim();
    }
  }
  return result;
}

// Generate simple YAML from object (key: value format only)
function generateSimpleYaml(data: Record<string, string | undefined>): string {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: "${value}"`)
    .join("\n");
}

const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'templates', 'agent-components');

function readTemplate(templateName: string): string {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  return fs.readFileSync(templatePath, 'utf-8');
}

function applyTemplatePlaceholders(template: string, agentName: string, className: string): string {
  return template
    .replace(/\{\{AGENT_NAME\}\}/g, agentName)
    .replace(/\{\{CLASS_NAME\}\}/g, className);
}

function copyComponentTemplates(agentId: string, agentName: string) {
  const componentsDir = getComponentsDir(agentId);
  ensureDir(componentsDir);

  const sanitizedName = agentName.replace(/[^a-zA-Z0-9]/g, '');
  const className = sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);

  const templateFiles = [
    { template: 'turn-manager.template.ts', output: 'turn-manager.ts' },
    { template: 'flow-controller.template.ts', output: 'flow-controller.ts' },
    { template: 'orchestrator.template.ts', output: 'orchestrator.ts' },
    { template: 'index.template.ts', output: 'index.ts' },
  ];

  for (const { template, output } of templateFiles) {
    const templateContent = readTemplate(template);
    const content = applyTemplatePlaceholders(templateContent, agentName, className);
    fs.writeFileSync(path.join(componentsDir, output), content, 'utf-8');
  }
}

export interface IStorage {
  // Agent operations
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, updates: UpdateAgent): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  
  // Session operations
  getSessions(agentId: string): Promise<ChatSessionWithPreview[]>;
  getSession(agentId: string, sessionId: string): Promise<ChatSession | undefined>;
  createSession(session: InsertChatSession): Promise<ChatSession>;
  updateSession(agentId: string, sessionId: string, updates: UpdateChatSession): Promise<ChatSession | undefined>;
  deleteSession(agentId: string, sessionId: string): Promise<boolean>;
  
  // Chat operations
  getMessages(agentId: string, sessionId?: string): Promise<ChatMessage[]>;
  addMessage(message: InsertChatMessage): Promise<ChatMessage>;
  clearMessages(agentId: string, sessionId?: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent>;
  // Changed: messages are now stored per session: Map<agentId, Map<sessionId, ChatMessage[]>>
  private messages: Map<string, Map<string, ChatMessage[]>>;
  private sessions: Map<string, ChatSession[]>;

  constructor() {
    this.agents = new Map();
    this.messages = new Map();
    this.sessions = new Map();
    this.loadFromDisk();
  }

  private loadFromDisk() {
    ensureDir(AGENTS_DIR);
    
    try {
      const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
      
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const agentId = dir.name;
          const chatPath = getChatPath(agentId);
          
          try {
            // Check if this is new multi-file structure or legacy
            const metaPath = getAgentFilePath(agentId, AGENT_FILES.META);
            const legacyConfigPath = getAgentFilePath(agentId, AGENT_FILES.LEGACY_CONFIG);
            
            let agent: Agent | null = null;
            
            if (fs.existsSync(metaPath)) {
              // New multi-file structure
              agent = this.loadAgentFromMultipleFiles(agentId);
            } else if (fs.existsSync(legacyConfigPath)) {
              // Legacy single-file structure - load and migrate
              const content = fs.readFileSync(legacyConfigPath, "utf-8");
              agent = this.parseLegacyYamlConfig(content, agentId);
              
              if (agent) {
                // Load complex data from legacy data.json
                const legacyDataPath = getAgentFilePath(agentId, AGENT_FILES.LEGACY_DATA);
                if (fs.existsSync(legacyDataPath)) {
                  const complexData = readJsonFile<{ domainDocuments?: DomainDocument[]; sampleDatasets?: SampleDataset[] }>(legacyDataPath, {});
                  agent.domainDocuments = complexData.domainDocuments || [];
                  agent.sampleDatasets = complexData.sampleDatasets || [];
                }
                
                // Migrate to new structure
                this.saveAgentToDisk(agent);
                console.log(`[storage] Migrated agent ${agentId} to multi-file structure`);
              }
            }
            
            if (agent) {
              this.agents.set(agentId, agent);
            }
          } catch (e) {
            console.error(`Failed to load agent ${agentId}:`, e);
          }
          
          // Load sessions
          const sessionsPath = getAgentFilePath(agentId, AGENT_FILES.SESSIONS);
          if (fs.existsSync(sessionsPath)) {
            try {
              const content = fs.readFileSync(sessionsPath, "utf-8");
              const sessions = JSON.parse(content) as ChatSession[];
              this.sessions.set(agentId, sessions);
            } catch (e) {
              console.error(`Failed to load sessions for agent ${agentId}:`, e);
            }
          }

          // Initialize per-session message map for this agent
          if (!this.messages.has(agentId)) {
            this.messages.set(agentId, new Map());
          }

          // Check for legacy chat.json and migrate to per-session files
          if (fs.existsSync(chatPath)) {
            try {
              const content = fs.readFileSync(chatPath, "utf-8");
              const legacyMessages = JSON.parse(content) as ChatMessage[];
              
              if (legacyMessages.length > 0) {
                // Migrate legacy messages to per-session storage
                this.migrateLegacyChatToSessions(agentId, legacyMessages);
                
                // Delete the old chat.json file after successful migration
                fs.unlinkSync(chatPath);
                console.log(`[storage] Migrated chat.json to per-session files for agent ${agentId}`);
              }
            } catch (e) {
              console.error(`Failed to migrate chat.json for agent ${agentId}:`, e);
            }
          }

          // Load messages from per-session files
          const sessionsDir = getSessionsDir(agentId);
          if (fs.existsSync(sessionsDir)) {
            const sessionDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
            for (const sessionDir of sessionDirs) {
              if (sessionDir.isDirectory()) {
                const sessionId = sessionDir.name;
                const messagesPath = getSessionMessagesPath(agentId, sessionId);
                if (fs.existsSync(messagesPath)) {
                  try {
                    const content = fs.readFileSync(messagesPath, "utf-8");
                    const messages = JSON.parse(content) as ChatMessage[];
                    const agentMessages = this.messages.get(agentId)!;
                    agentMessages.set(sessionId, messages);
                  } catch (e) {
                    console.error(`Failed to load messages for session ${sessionId}:`, e);
                  }
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load agents from disk:", e);
    }
  }

  private migrateLegacyChatToSessions(agentId: string, messages: ChatMessage[]): void {
    // First, ensure messages have sessionIds (handle old format without sessionId)
    const needsSessionMigration = messages.some(m => !(m as any).sessionId);
    
    let migratedMessages = messages;
    
    if (needsSessionMigration) {
      // Create a default session for messages without sessionId
      const now = new Date().toISOString();
      const defaultSession: ChatSession = {
        id: randomUUID(),
        agentId,
        title: "Previous Conversation",
        createdAt: messages[0]?.timestamp || now,
        updatedAt: messages[messages.length - 1]?.timestamp || now,
      };

      // Add session to sessions list
      const sessions = this.sessions.get(agentId) || [];
      sessions.push(defaultSession);
      this.sessions.set(agentId, sessions);
      this.saveSessionsToDisk(agentId);

      // Add sessionId to all messages that don't have one
      migratedMessages = messages.map(m => ({
        ...m,
        sessionId: (m as any).sessionId || defaultSession.id,
      }));
    }

    // Group messages by sessionId
    const messagesBySession = new Map<string, ChatMessage[]>();
    for (const msg of migratedMessages) {
      const sessionId = msg.sessionId;
      if (!messagesBySession.has(sessionId)) {
        messagesBySession.set(sessionId, []);
      }
      messagesBySession.get(sessionId)!.push(msg);
    }

    // Ensure all sessionIds have corresponding session records
    const sessions = this.sessions.get(agentId) || [];
    const existingSessionIds = new Set(sessions.map(s => s.id));
    
    for (const [sessionId, sessionMessages] of messagesBySession) {
      if (!existingSessionIds.has(sessionId)) {
        // Create a session record for orphaned messages
        const firstMsg = sessionMessages[0];
        const lastMsg = sessionMessages[sessionMessages.length - 1];
        const now = new Date().toISOString();
        
        const newSession: ChatSession = {
          id: sessionId,
          agentId,
          title: "Migrated Conversation",
          createdAt: firstMsg?.timestamp || now,
          updatedAt: lastMsg?.timestamp || now,
        };
        sessions.push(newSession);
        console.log(`[storage] Created missing session record for ${sessionId} during migration`);
      }
    }
    
    this.sessions.set(agentId, sessions);
    this.saveSessionsToDisk(agentId);

    // Initialize agent messages map if needed
    if (!this.messages.has(agentId)) {
      this.messages.set(agentId, new Map());
    }
    const agentMessages = this.messages.get(agentId)!;

    // Save each session's messages to its own file
    for (const [sessionId, sessionMessages] of messagesBySession) {
      agentMessages.set(sessionId, sessionMessages);
      this.saveSessionMessagesToDisk(agentId, sessionId);
    }
  }

  private loadAgentFromMultipleFiles(agentId: string): Agent | null {
    const agentDir = getAgentDir(agentId);
    
    // Read meta.yaml for basic info
    const metaContent = readTextFile(getAgentFilePath(agentId, AGENT_FILES.META));
    const meta = parseSimpleYaml(metaContent);
    
    if (!meta.name || !meta.createdAt) {
      console.error(`[storage] Invalid meta.yaml for agent ${agentId}`);
      return null;
    }
    
    // Read all content files
    const businessUseCase = readTextFile(getAgentFilePath(agentId, AGENT_FILES.BUSINESS_USE_CASE));
    const domainKnowledge = readTextFile(getAgentFilePath(agentId, AGENT_FILES.DOMAIN_KNOWLEDGE));
    const validationRules = readTextFile(getAgentFilePath(agentId, AGENT_FILES.VALIDATION_RULES));
    const guardrails = readTextFile(getAgentFilePath(agentId, AGENT_FILES.GUARDRAILS));
    const customPrompt = readTextFile(getAgentFilePath(agentId, AGENT_FILES.CUSTOM_PROMPT));
    
    // Read JSON files
    const domainDocuments = readJsonFile<DomainDocument[]>(getAgentFilePath(agentId, AGENT_FILES.DOMAIN_DOCUMENTS), []);
    const sampleDatasets = readJsonFile<SampleDataset[]>(getAgentFilePath(agentId, AGENT_FILES.SAMPLE_DATA), []);
    const clarifyingInsights = readJsonFile<ClarifyingInsight[]>(getAgentFilePath(agentId, "clarifying-insights.json"), []);
    
    return {
      id: agentId,
      name: meta.name,
      status: (meta.status || "configured") as AgentStatus,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt || meta.createdAt,
      promptStyle: (meta.promptStyle || "anthropic") as PromptStyle,
      description: meta.description || "",
      businessUseCase,
      domainKnowledge,
      validationRules,
      guardrails,
      customPrompt,
      domainDocuments,
      sampleDatasets,
      clarifyingInsights,
    };
  }

  private parseLegacyYamlConfig(content: string, agentId: string): Agent | null {
    // Simple YAML parser for legacy format
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

    // Set defaults for arrays
    agent.domainDocuments = agent.domainDocuments || [];
    agent.sampleDatasets = agent.sampleDatasets || [];

    return agent as Agent;
  }

  private saveAgentToDisk(agent: Agent) {
    const agentDir = getAgentDir(agent.id);
    ensureDir(agentDir);

    // 1. Save meta.yaml - basic agent info
    const metaYaml = generateSimpleYaml({
      name: agent.name,
      status: agent.status,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      promptStyle: agent.promptStyle || "anthropic",
      description: agent.description || "",
    });
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.META), metaYaml);

    // 2. Save business-use-case.md
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.BUSINESS_USE_CASE), agent.businessUseCase || "");

    // 3. Save domain-knowledge.md
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.DOMAIN_KNOWLEDGE), agent.domainKnowledge || "");

    // 4. Save validation-rules.yaml
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.VALIDATION_RULES), agent.validationRules || "");

    // 5. Save guardrails.yaml
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.GUARDRAILS), agent.guardrails || "");

    // 6. Save custom-prompt.md
    writeTextFile(getAgentFilePath(agent.id, AGENT_FILES.CUSTOM_PROMPT), agent.customPrompt || "");

    // 7. Save domain-documents.json
    writeJsonFile(getAgentFilePath(agent.id, AGENT_FILES.DOMAIN_DOCUMENTS), agent.domainDocuments || []);

    // 8. Save sample-data.json
    writeJsonFile(getAgentFilePath(agent.id, AGENT_FILES.SAMPLE_DATA), agent.sampleDatasets || []);

    // 9. Save clarifying-insights.json
    writeJsonFile(getAgentFilePath(agent.id, "clarifying-insights.json"), agent.clarifyingInsights || []);

    // Clean up legacy files if they exist
    const legacyConfigPath = getAgentFilePath(agent.id, AGENT_FILES.LEGACY_CONFIG);
    const legacyDataPath = getAgentFilePath(agent.id, AGENT_FILES.LEGACY_DATA);
    if (fs.existsSync(legacyConfigPath)) {
      fs.unlinkSync(legacyConfigPath);
      console.log(`[storage] Removed legacy config.yaml for agent ${agent.id}`);
    }
    if (fs.existsSync(legacyDataPath)) {
      fs.unlinkSync(legacyDataPath);
      console.log(`[storage] Removed legacy data.json for agent ${agent.id}`);
    }
  }

  private saveSessionMessagesToDisk(agentId: string, sessionId: string) {
    const agentMessages = this.messages.get(agentId);
    const sessionMessages = agentMessages?.get(sessionId) || [];
    const sessionDir = getSessionDir(agentId, sessionId);
    ensureDir(sessionDir);
    const messagesPath = getSessionMessagesPath(agentId, sessionId);
    fs.writeFileSync(messagesPath, JSON.stringify(sessionMessages, null, 2), "utf-8");
  }

  private deleteSessionFromDisk(agentId: string, sessionId: string) {
    const sessionDir = getSessionDir(agentId, sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  private saveSessionsToDisk(agentId: string) {
    const sessions = this.sessions.get(agentId) || [];
    const sessionsPath = getAgentFilePath(agentId, AGENT_FILES.SESSIONS);
    ensureDir(getAgentDir(agentId));
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2), "utf-8");
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
      domainKnowledge: insertAgent.domainKnowledge || "",
      domainDocuments: insertAgent.domainDocuments || [],
      sampleDatasets: insertAgent.sampleDatasets || [],
      validationRules: insertAgent.validationRules || "",
      guardrails: insertAgent.guardrails || "",
      promptStyle: insertAgent.promptStyle || "anthropic",
      customPrompt: insertAgent.customPrompt || "",
      clarifyingInsights: insertAgent.clarifyingInsights || [],
      status,
      createdAt: now,
      updatedAt: now,
    };

    this.agents.set(id, agent);
    this.saveAgentToDisk(agent);
    
    // Copy component templates for new agent
    try {
      copyComponentTemplates(id, agent.name);
      console.log(`[storage] Created component templates for agent ${id}`);
    } catch (error) {
      console.error(`[storage] Failed to create component templates for agent ${id}:`, error);
    }
    
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
    this.sessions.delete(id);
    this.deleteAgentFromDisk(id);
    return true;
  }

  // Session operations
  async getSessions(agentId: string): Promise<ChatSessionWithPreview[]> {
    const sessions = this.sessions.get(agentId) || [];
    const agentMessages = this.messages.get(agentId) || new Map();
    
    return sessions.map(session => {
      const sessionMessages = agentMessages.get(session.id) || [];
      const firstUserMessage = sessionMessages.find(m => m.role === "user");
      const lastMessage = sessionMessages[sessionMessages.length - 1];
      
      return {
        ...session,
        messageCount: sessionMessages.length,
        firstMessage: firstUserMessage?.content.substring(0, 100),
        lastMessageAt: lastMessage?.timestamp,
      };
    }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getSession(agentId: string, sessionId: string): Promise<ChatSession | undefined> {
    const sessions = this.sessions.get(agentId) || [];
    return sessions.find(s => s.id === sessionId);
  }

  async createSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const session: ChatSession = {
      id,
      agentId: insertSession.agentId,
      title: insertSession.title || "New Session",
      createdAt: now,
      updatedAt: now,
    };

    const sessions = this.sessions.get(insertSession.agentId) || [];
    sessions.push(session);
    this.sessions.set(insertSession.agentId, sessions);
    this.saveSessionsToDisk(insertSession.agentId);
    return session;
  }

  async updateSession(agentId: string, sessionId: string, updates: UpdateChatSession): Promise<ChatSession | undefined> {
    const sessions = this.sessions.get(agentId) || [];
    const index = sessions.findIndex(s => s.id === sessionId);
    
    if (index === -1) return undefined;

    const updatedSession: ChatSession = {
      ...sessions[index],
      title: updates.title,
      updatedAt: new Date().toISOString(),
    };

    sessions[index] = updatedSession;
    this.sessions.set(agentId, sessions);
    this.saveSessionsToDisk(agentId);
    return updatedSession;
  }

  async deleteSession(agentId: string, sessionId: string): Promise<boolean> {
    const sessions = this.sessions.get(agentId) || [];
    const index = sessions.findIndex(s => s.id === sessionId);
    
    if (index === -1) return false;

    // Remove session
    sessions.splice(index, 1);
    this.sessions.set(agentId, sessions);
    this.saveSessionsToDisk(agentId);

    // Remove messages from memory and disk
    const agentMessages = this.messages.get(agentId);
    if (agentMessages) {
      agentMessages.delete(sessionId);
    }
    this.deleteSessionFromDisk(agentId, sessionId);

    return true;
  }

  async getMessages(agentId: string, sessionId?: string): Promise<ChatMessage[]> {
    const agentMessages = this.messages.get(agentId) || new Map();
    
    if (sessionId) {
      return agentMessages.get(sessionId) || [];
    }
    
    // Return all messages across all sessions for this agent, sorted by timestamp
    const allMessages: ChatMessage[] = [];
    for (const sessionMessages of agentMessages.values()) {
      allMessages.push(...sessionMessages);
    }
    return allMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async addMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const message: ChatMessage = {
      id,
      agentId: insertMessage.agentId,
      sessionId: insertMessage.sessionId,
      role: insertMessage.role,
      content: insertMessage.content,
      timestamp: now,
    };

    // Initialize agent messages map if needed
    if (!this.messages.has(insertMessage.agentId)) {
      this.messages.set(insertMessage.agentId, new Map());
    }
    const agentMessages = this.messages.get(insertMessage.agentId)!;

    // Initialize session messages array if needed
    if (!agentMessages.has(insertMessage.sessionId)) {
      agentMessages.set(insertMessage.sessionId, []);
    }
    const sessionMessages = agentMessages.get(insertMessage.sessionId)!;
    
    sessionMessages.push(message);
    this.saveSessionMessagesToDisk(insertMessage.agentId, insertMessage.sessionId);

    // Update session's updatedAt timestamp
    const sessions = this.sessions.get(insertMessage.agentId) || [];
    const sessionIndex = sessions.findIndex(s => s.id === insertMessage.sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex] = {
        ...sessions[sessionIndex],
        updatedAt: now,
      };
      this.sessions.set(insertMessage.agentId, sessions);
      this.saveSessionsToDisk(insertMessage.agentId);
    }

    return message;
  }

  async clearMessages(agentId: string, sessionId?: string): Promise<void> {
    const agentMessages = this.messages.get(agentId);
    
    if (sessionId) {
      // Clear messages for a specific session
      if (agentMessages) {
        agentMessages.set(sessionId, []);
        this.saveSessionMessagesToDisk(agentId, sessionId);
      }
    } else {
      // Clear all messages for this agent (all sessions)
      // First, clear known sessions
      if (agentMessages) {
        const sessions = this.sessions.get(agentId) || [];
        for (const session of sessions) {
          agentMessages.set(session.id, []);
          this.saveSessionMessagesToDisk(agentId, session.id);
        }
        
        // Also clear any orphaned session folders on disk
        const sessionsDir = getSessionsDir(agentId);
        if (fs.existsSync(sessionsDir)) {
          const sessionDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
          const knownSessionIds = new Set(sessions.map(s => s.id));
          
          for (const sessionDir of sessionDirs) {
            if (sessionDir.isDirectory() && !knownSessionIds.has(sessionDir.name)) {
              // This is an orphaned session folder, remove it
              const orphanedDir = path.join(sessionsDir, sessionDir.name);
              fs.rmSync(orphanedDir, { recursive: true, force: true });
              console.log(`[storage] Removed orphaned session folder ${sessionDir.name}`);
            }
          }
        }
      }
    }
  }
}

export const storage = new MemStorage();
