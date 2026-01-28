import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Agent, InsertAgent, UpdateAgent, ChatMessage, InsertChatMessage } from "@shared/schema";

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

function copyComponentTemplates(agentId: string, agentName: string) {
  const componentsDir = getComponentsDir(agentId);
  ensureDir(componentsDir);

  const sanitizedName = agentName.replace(/[^a-zA-Z0-9]/g, '');
  const className = sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);

  const turnManagerContent = `/**
 * Turn Manager - ${agentName}
 * 
 * Customized intent classification for this agent.
 * Modify keywords to match your domain-specific language.
 */

import { TurnManager as BaseTurnManager, TurnManagerConfig } from '../../../server/components/turn-manager';

const CONFIG: TurnManagerConfig = {
  useLlmFallback: true,
  
  goBackKeywords: ['back', 'previous', 'return', 'undo', 'earlier', 'start over'],
  
  correctionKeywords: [
    'change', 'actually', 'meant', 'should be', 'revise', 'update', 
    'i mean', 'correct the', 'correction', 'let me rephrase'
  ],
  
  clarificationKeywords: [
    'what', 'how', 'why', 'explain', 'help', "don't understand",
    'tell me', 'can you', 'could you', 'would you', 'describe',
    'confused', 'clarify', 'understand', 'more info', 'details'
  ],
  
  confirmationKeywords: [
    'yes', 'yeah', 'yep', 'y', 'yup', 'sure', 'ok', 'okay',
    'confirm', 'correct', 'right', "that's right", 'looks good',
    'sounds good', 'that works', 'perfect', 'great', 'thanks'
  ],
  
  rejectionKeywords: [
    'no', 'nope', 'n', 'nah', 'not quite', 'not exactly', 'not right',
    'incorrect', 'wrong', 'disagree', 'not what i meant'
  ]
};

export class ${className}TurnManager extends BaseTurnManager {
  constructor() {
    super(CONFIG);
  }
}

export function createTurnManager(): ${className}TurnManager {
  return new ${className}TurnManager();
}
`;

  const flowControllerContent = `/**
 * Flow Controller - ${agentName}
 * 
 * Define your conversation flow steps here.
 * Customize questions, validation, and help text.
 */

import { 
  FlowController as BaseFlowController, 
  FlowControllerConfig,
  FlowStep 
} from '../../../server/components/flow-controller';

const STEPS: FlowStep[] = [
  {
    id: 'greeting',
    question: "What can I help you with today?",
    field: 'initial_request',
    type: 'text',
    helpText: 'Describe your question or issue.'
  }
];

const CONFIG: FlowControllerConfig = {
  steps: STEPS,
  welcomeMessage: "Hello! I'm here to help. What can I do for you?",
  completionMessage: "Thanks for chatting! Let me know if you need anything else."
};

export class ${className}FlowController extends BaseFlowController {
  constructor() {
    super(CONFIG);
  }
}

export function createFlowController(): ${className}FlowController {
  return new ${className}FlowController();
}
`;

  const orchestratorContent = `/**
 * Orchestrator - ${agentName}
 * 
 * Coordinates all components for this agent.
 * Override handlers to customize behavior.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import { ${className}TurnManager } from './turn-manager';
import { ${className}FlowController } from './flow-controller';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class ${className}Orchestrator extends BaseOrchestrator {
  constructor(agentConfig: AgentConfig) {
    super({
      agentConfig,
      flowController: {
        steps: [
          {
            id: 'greeting',
            question: "What can I help you with today?",
            field: 'initial_request',
            type: 'text'
          }
        ],
        welcomeMessage: \`Hello! I'm \${agentConfig.name}. \${agentConfig.businessUseCase}\`,
        completionMessage: "Thanks for chatting! Let me know if you need anything else."
      }
    });

    this.turnManager = new ${className}TurnManager();
    this.flowController = new ${className}FlowController();
  }

  protected async handleAnswerQuestion(
    conversationId: string, 
    classification: ClassificationResult, 
    userInput: string
  ): Promise<TurnResult> {
    return {
      intent: 'answer_question',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }
}

export function createOrchestrator(agentConfig: AgentConfig): ${className}Orchestrator {
  return new ${className}Orchestrator(agentConfig);
}
`;

  const indexContent = `/**
 * ${agentName} Components
 * 
 * Custom components for this agent.
 */

export { ${className}TurnManager, createTurnManager } from './turn-manager';
export { ${className}FlowController, createFlowController } from './flow-controller';
export { ${className}Orchestrator, createOrchestrator } from './orchestrator';
`;

  fs.writeFileSync(path.join(componentsDir, 'turn-manager.ts'), turnManagerContent, 'utf-8');
  fs.writeFileSync(path.join(componentsDir, 'flow-controller.ts'), flowControllerContent, 'utf-8');
  fs.writeFileSync(path.join(componentsDir, 'orchestrator.ts'), orchestratorContent, 'utf-8');
  fs.writeFileSync(path.join(componentsDir, 'index.ts'), indexContent, 'utf-8');
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
                  const complexData = readJsonFile<{ domainDocuments?: unknown[]; sampleDatasets?: unknown[] }>(legacyDataPath, {});
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
    const domainDocuments = readJsonFile<unknown[]>(getAgentFilePath(agentId, AGENT_FILES.DOMAIN_DOCUMENTS), []);
    const sampleDatasets = readJsonFile<unknown[]>(getAgentFilePath(agentId, AGENT_FILES.SAMPLE_DATA), []);
    
    return {
      id: agentId,
      name: meta.name,
      status: meta.status || "configured",
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt || meta.createdAt,
      promptStyle: meta.promptStyle || "anthropic",
      description: meta.description || "",
      businessUseCase,
      domainKnowledge,
      validationRules,
      guardrails,
      customPrompt,
      domainDocuments,
      sampleDatasets,
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
      domainKnowledge: insertAgent.domainKnowledge || "",
      domainDocuments: insertAgent.domainDocuments || [],
      sampleDatasets: insertAgent.sampleDatasets || [],
      validationRules: insertAgent.validationRules || "",
      guardrails: insertAgent.guardrails || "",
      promptStyle: insertAgent.promptStyle || "anthropic",
      customPrompt: insertAgent.customPrompt || "",
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
