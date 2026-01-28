import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";
import type { Agent, InsertAgent, UpdateAgent, ChatMessage, InsertChatMessage, DomainDocument, SampleDataset, AgentStatus, PromptStyle, ClarifyingInsight, ChatSession, InsertChatSession, UpdateChatSession, ChatSessionWithPreview, AgentTrace, TurnTrace, ConfigSnapshot, ConfigHistory, UsageStats, User, InsertUser, AuthSession, PublicUser } from "@shared/schema";

const AGENTS_DIR = "./agents";
const USERS_DIR = "./users";
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
  createAgent(agent: InsertAgent, userId?: string): Promise<Agent>;
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
  
  // Tracing operations
  getAgentTraces(agentId: string, sessionId?: string): Promise<AgentTrace | undefined>;
  addTurnTrace(agentId: string, trace: TurnTrace): Promise<void>;
  clearTraces(agentId: string, sessionId?: string): Promise<void>;
  
  // Config history operations
  getConfigHistory(agentId: string): Promise<ConfigHistory | undefined>;
  addConfigSnapshot(agentId: string, snapshot: Omit<ConfigSnapshot, "id" | "timestamp">): Promise<ConfigSnapshot>;
  revertToSnapshot(agentId: string, snapshotId: string): Promise<Agent | undefined>;

  // User operations
  createUser(user: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  validatePassword(username: string, password: string): Promise<User | undefined>;
  updateUserPassword(userId: string, newPassword: string): Promise<boolean>;
  verifyPhone(username: string, phone: string): Promise<boolean>;

  // Auth session operations
  createAuthSession(userId: string): Promise<AuthSession>;
  getAuthSession(sessionId: string): Promise<AuthSession | undefined>;
  deleteAuthSession(sessionId: string): Promise<void>;
  getUserBySessionId(sessionId: string): Promise<PublicUser | undefined>;

  // Agent operations with user filtering
  getAgentsByUserId(userId: string): Promise<Agent[]>;
}

export class MemStorage implements IStorage {
  private agents: Map<string, Agent>;
  // Changed: messages are now stored per session: Map<agentId, Map<sessionId, ChatMessage[]>>
  private messages: Map<string, Map<string, ChatMessage[]>>;
  private sessions: Map<string, ChatSession[]>;
  private traces: Map<string, AgentTrace>;
  private configHistory: Map<string, ConfigHistory>;
  private users: Map<string, User>;
  private authSessions: Map<string, AuthSession>;

  constructor() {
    this.agents = new Map();
    this.messages = new Map();
    this.sessions = new Map();
    this.traces = new Map();
    this.configHistory = new Map();
    this.users = new Map();
    this.authSessions = new Map();
    this.loadFromDisk();
    this.loadUsersFromDisk();
    this.loadAuthSessionsFromDisk();
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
      userId: meta.userId || "", // Legacy agents may not have userId
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
      userId: agent.userId || "",
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

  async createAgent(insertAgent: InsertAgent, userId?: string): Promise<Agent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    // Agent is "configured" when created through wizard (has name and business use case)
    // Status is "draft" only if explicitly set, otherwise defaults to "configured"
    const hasRequiredFields = insertAgent.name && insertAgent.businessUseCase;
    const status = insertAgent.status === "draft" && hasRequiredFields ? "configured" : (insertAgent.status || "configured");
    
    const agent: Agent = {
      id,
      userId: userId || "", // Will be empty for legacy agents
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

  // Tracing operations
  private getTracesPath(agentId: string): string {
    return getAgentFilePath(agentId, "traces.json");
  }

  private getConfigHistoryPath(agentId: string): string {
    return getAgentFilePath(agentId, "config-history.json");
  }

  private saveTracesToDisk(agentId: string) {
    const traces = this.traces.get(agentId);
    if (traces) {
      const tracesPath = this.getTracesPath(agentId);
      writeJsonFile(tracesPath, traces);
    }
  }

  private saveConfigHistoryToDisk(agentId: string) {
    const history = this.configHistory.get(agentId);
    if (history) {
      const historyPath = this.getConfigHistoryPath(agentId);
      writeJsonFile(historyPath, history);
    }
  }

  private computeUsageStats(traces: TurnTrace[]): UsageStats {
    const stats: UsageStats = {
      hookCalls: {},
      signalReads: {},
      intentDistribution: {},
      classificationMethods: {},
      avgResponseTime: 0,
      totalLlmCalls: 0,
      totalTokensUsed: 0,
      errorCount: 0,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const trace of traces) {
      if (trace.totalDuration) {
        totalDuration += trace.totalDuration;
        durationCount++;
      }
      if (!trace.success) {
        stats.errorCount++;
      }

      for (const entry of trace.entries) {
        if (entry.type === "hook_call") {
          stats.hookCalls[entry.name] = (stats.hookCalls[entry.name] || 0) + 1;
        }
        if (entry.type === "signal_read") {
          stats.signalReads[entry.name] = (stats.signalReads[entry.name] || 0) + 1;
        }
        if (entry.type === "intent_classification" && entry.metadata?.intent) {
          stats.intentDistribution[entry.metadata.intent] = (stats.intentDistribution[entry.metadata.intent] || 0) + 1;
        }
        if (entry.type === "intent_classification" && entry.metadata?.classificationMethod) {
          stats.classificationMethods[entry.metadata.classificationMethod] = (stats.classificationMethods[entry.metadata.classificationMethod] || 0) + 1;
        }
        if (entry.type === "llm_call") {
          stats.totalLlmCalls++;
          if (entry.metadata?.tokenCount) {
            stats.totalTokensUsed += entry.metadata.tokenCount;
          }
        }
      }
    }

    stats.avgResponseTime = durationCount > 0 ? totalDuration / durationCount : 0;
    return stats;
  }

  async getAgentTraces(agentId: string, sessionId?: string): Promise<AgentTrace | undefined> {
    let agentTrace = this.traces.get(agentId);
    
    // Load from disk if not in memory
    if (!agentTrace) {
      const tracesPath = this.getTracesPath(agentId);
      if (fs.existsSync(tracesPath)) {
        agentTrace = readJsonFile<AgentTrace>(tracesPath, undefined as any);
        if (agentTrace) {
          this.traces.set(agentId, agentTrace);
        }
      }
    }

    if (!agentTrace) {
      return undefined;
    }

    // Filter by session if requested
    if (sessionId) {
      const filteredTraces = agentTrace.traces.filter(t => t.sessionId === sessionId);
      return {
        ...agentTrace,
        traces: filteredTraces,
        stats: this.computeUsageStats(filteredTraces),
      };
    }

    return agentTrace;
  }

  async addTurnTrace(agentId: string, trace: TurnTrace): Promise<void> {
    let agentTrace = this.traces.get(agentId);
    const now = new Date().toISOString();

    if (!agentTrace) {
      // Load from disk or create new
      const tracesPath = this.getTracesPath(agentId);
      if (fs.existsSync(tracesPath)) {
        agentTrace = readJsonFile<AgentTrace>(tracesPath, undefined as any);
      }
      if (!agentTrace) {
        agentTrace = {
          agentId,
          traces: [],
          stats: {
            hookCalls: {},
            signalReads: {},
            intentDistribution: {},
            classificationMethods: {},
            avgResponseTime: 0,
            totalLlmCalls: 0,
            totalTokensUsed: 0,
            errorCount: 0,
          },
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    agentTrace.traces.push(trace);
    agentTrace.stats = this.computeUsageStats(agentTrace.traces);
    agentTrace.updatedAt = now;

    // Keep only last 100 traces to prevent unbounded growth
    if (agentTrace.traces.length > 100) {
      agentTrace.traces = agentTrace.traces.slice(-100);
    }

    this.traces.set(agentId, agentTrace);
    this.saveTracesToDisk(agentId);
  }

  async clearTraces(agentId: string, sessionId?: string): Promise<void> {
    const agentTrace = this.traces.get(agentId);
    if (!agentTrace) return;

    if (sessionId) {
      agentTrace.traces = agentTrace.traces.filter(t => t.sessionId !== sessionId);
      agentTrace.stats = this.computeUsageStats(agentTrace.traces);
    } else {
      agentTrace.traces = [];
      agentTrace.stats = {
        hookCalls: {},
        signalReads: {},
        intentDistribution: {},
        classificationMethods: {},
        avgResponseTime: 0,
        totalLlmCalls: 0,
        totalTokensUsed: 0,
        errorCount: 0,
      };
    }

    agentTrace.updatedAt = new Date().toISOString();
    this.traces.set(agentId, agentTrace);
    this.saveTracesToDisk(agentId);
  }

  // Config history operations
  async getConfigHistory(agentId: string): Promise<ConfigHistory | undefined> {
    let history = this.configHistory.get(agentId);
    
    // Load from disk if not in memory
    if (!history) {
      const historyPath = this.getConfigHistoryPath(agentId);
      if (fs.existsSync(historyPath)) {
        history = readJsonFile<ConfigHistory>(historyPath, undefined as any);
        if (history) {
          this.configHistory.set(agentId, history);
        }
      }
    }

    return history;
  }

  async addConfigSnapshot(agentId: string, snapshot: Omit<ConfigSnapshot, "id" | "timestamp">): Promise<ConfigSnapshot> {
    let history = this.configHistory.get(agentId);
    
    if (!history) {
      const historyPath = this.getConfigHistoryPath(agentId);
      if (fs.existsSync(historyPath)) {
        history = readJsonFile<ConfigHistory>(historyPath, undefined as any);
      }
      if (!history) {
        history = {
          agentId,
          snapshots: [],
          currentVersion: 0,
        };
      }
    }

    const newSnapshot: ConfigSnapshot = {
      ...snapshot,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    history.snapshots.push(newSnapshot);
    history.currentVersion = history.snapshots.length;

    // Keep only last 50 snapshots
    if (history.snapshots.length > 50) {
      history.snapshots = history.snapshots.slice(-50);
    }

    this.configHistory.set(agentId, history);
    this.saveConfigHistoryToDisk(agentId);

    return newSnapshot;
  }

  async revertToSnapshot(agentId: string, snapshotId: string): Promise<Agent | undefined> {
    const history = await this.getConfigHistory(agentId);
    if (!history) return undefined;

    const snapshot = history.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return undefined;

    const agent = this.agents.get(agentId);
    if (!agent) return undefined;

    // Create a snapshot of current state before reverting
    await this.addConfigSnapshot(agentId, {
      agentId,
      description: `Auto-save before revert to ${snapshot.description || 'previous version'}`,
      changes: [],
      config: {
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        domainKnowledge: agent.domainKnowledge,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
      },
      isRevertPoint: false,
    });

    // Apply the snapshot config
    const updates: UpdateAgent = {};
    if (snapshot.config.name) updates.name = snapshot.config.name;
    if (snapshot.config.businessUseCase) updates.businessUseCase = snapshot.config.businessUseCase;
    if (snapshot.config.domainKnowledge !== undefined) updates.domainKnowledge = snapshot.config.domainKnowledge;
    if (snapshot.config.validationRules !== undefined) updates.validationRules = snapshot.config.validationRules;
    if (snapshot.config.guardrails !== undefined) updates.guardrails = snapshot.config.guardrails;
    if (snapshot.config.promptStyle) updates.promptStyle = snapshot.config.promptStyle;
    if (snapshot.config.customPrompt !== undefined) updates.customPrompt = snapshot.config.customPrompt;

    return this.updateAgent(agentId, updates);
  }

  // ========== User Storage Methods ==========

  private loadUsersFromDisk() {
    ensureDir(USERS_DIR);
    
    try {
      const usersFile = path.join(USERS_DIR, "users.json");
      if (fs.existsSync(usersFile)) {
        const content = fs.readFileSync(usersFile, "utf-8");
        const users = JSON.parse(content) as User[];
        for (const user of users) {
          this.users.set(user.id, user);
        }
        console.log(`[storage] Loaded ${users.length} users from disk`);
      }
    } catch (e) {
      console.error("Failed to load users from disk:", e);
    }
  }

  private saveUsersToDisk() {
    ensureDir(USERS_DIR);
    const usersFile = path.join(USERS_DIR, "users.json");
    const users = Array.from(this.users.values());
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf-8");
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Check if username already exists
    const existing = await this.getUserByUsername(insertUser.username);
    if (existing) {
      throw new Error("Username already exists");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);

    const user: User = {
      id,
      username: insertUser.username,
      password: hashedPassword,
      phone: insertUser.phone,
      createdAt: now,
    };

    this.users.set(id, user);
    this.saveUsersToDisk();
    console.log(`[storage] Created user ${user.username} (${id})`);

    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username.toLowerCase() === username.toLowerCase()) {
        return user;
      }
    }
    return undefined;
  }

  async validatePassword(username: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user) return undefined;

    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : undefined;
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    this.users.set(userId, user);
    this.saveUsersToDisk();
    console.log(`[storage] Updated password for user ${userId}`);

    return true;
  }

  async verifyPhone(username: string, phone: string): Promise<boolean> {
    const user = await this.getUserByUsername(username);
    if (!user) return false;

    // Normalize phone for comparison (remove non-digits)
    const normalizedUserPhone = user.phone.replace(/\D/g, "");
    const normalizedInputPhone = phone.replace(/\D/g, "");

    return normalizedUserPhone === normalizedInputPhone;
  }

  // ========== Auth Session Methods ==========

  private loadAuthSessionsFromDisk() {
    ensureDir(USERS_DIR);
    
    try {
      const sessionsFile = path.join(USERS_DIR, "auth-sessions.json");
      if (fs.existsSync(sessionsFile)) {
        const content = fs.readFileSync(sessionsFile, "utf-8");
        const sessions = JSON.parse(content) as AuthSession[];
        const now = new Date();
        let expiredCount = 0;
        
        for (const session of sessions) {
          // Only load non-expired sessions
          if (new Date(session.expiresAt) > now) {
            this.authSessions.set(session.id, session);
          } else {
            expiredCount++;
          }
        }
        
        console.log(`[storage] Loaded ${this.authSessions.size} auth sessions from disk (${expiredCount} expired sessions cleaned up)`);
        
        // Save cleaned up sessions if any were expired
        if (expiredCount > 0) {
          this.saveAuthSessionsToDisk();
        }
      }
    } catch (e) {
      console.error("Failed to load auth sessions from disk:", e);
    }
  }

  private saveAuthSessionsToDisk() {
    ensureDir(USERS_DIR);
    const sessionsFile = path.join(USERS_DIR, "auth-sessions.json");
    const sessions = Array.from(this.authSessions.values());
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), "utf-8");
  }

  async createAuthSession(userId: string): Promise<AuthSession> {
    const id = randomUUID();
    // Session expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const session: AuthSession = {
      id,
      userId,
      expiresAt,
    };

    this.authSessions.set(id, session);
    this.saveAuthSessionsToDisk();
    console.log(`[storage] Created auth session for user ${userId}`);

    return session;
  }

  async getAuthSession(sessionId: string): Promise<AuthSession | undefined> {
    const session = this.authSessions.get(sessionId);
    if (!session) return undefined;

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      this.authSessions.delete(sessionId);
      this.saveAuthSessionsToDisk();
      return undefined;
    }

    return session;
  }

  async deleteAuthSession(sessionId: string): Promise<void> {
    this.authSessions.delete(sessionId);
    this.saveAuthSessionsToDisk();
    console.log(`[storage] Deleted auth session ${sessionId}`);
  }

  async getUserBySessionId(sessionId: string): Promise<PublicUser | undefined> {
    const session = await this.getAuthSession(sessionId);
    if (!session) return undefined;

    const user = await this.getUserById(session.userId);
    if (!user) return undefined;

    // Return user without password
    const { password, ...publicUser } = user;
    return publicUser;
  }

  // ========== Agent Operations with User Filtering ==========

  async getAgentsByUserId(userId: string): Promise<Agent[]> {
    return Array.from(this.agents.values())
      .filter(agent => agent.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const storage = new MemStorage();
