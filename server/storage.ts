import { randomUUID, createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "./db";
import {
  usersTable,
  agentsTable,
  agentComponentsTable,
  chatSessionsTable,
  chatMessagesTable,
  agentTracesTable,
  configSnapshotsTable,
  authSessionsTable,
  promptCoachHistoryTable,
} from "@shared/schema";
import type {
  Agent, InsertAgent, UpdateAgent,
  ChatMessage, InsertChatMessage,
  DomainDocument, SampleDataset,
  AgentStatus, PromptStyle,
  ClarifyingInsight,
  ChatSession, InsertChatSession, UpdateChatSession, ChatSessionWithPreview,
  AgentTrace, TurnTrace, UsageStats,
  ConfigSnapshot, ConfigHistory,
  User, InsertUser, AuthSession, PublicUser,
  AgentAction, MockUserState, MockMode,
} from "@shared/schema";

const TEMPLATES_DIR = path.join(process.cwd(), 'server', 'templates', 'agent-components');

export function computeConfigFieldsHash(agent: Pick<Agent, 'businessUseCase' | 'domainKnowledge' | 'validationRules' | 'guardrails'>): string {
  const content = [
    agent.businessUseCase || "",
    agent.domainKnowledge || "",
    agent.validationRules || "",
    agent.guardrails || "",
  ].join("|||");
  return createHash("md5").update(content).digest("hex");
}

function readTemplate(templateName: string): string {
  const templatePath = path.join(TEMPLATES_DIR, templateName);
  return fs.readFileSync(templatePath, 'utf-8');
}

function applyTemplatePlaceholders(template: string, agentName: string, className: string): string {
  return template
    .replace(/\{\{AGENT_NAME\}\}/g, agentName)
    .replace(/\{\{CLASS_NAME\}\}/g, className);
}

function generateComponentCode(agentName: string): Array<{ fileName: string; code: string }> {
  const sanitizedName = agentName.replace(/[^a-zA-Z0-9]/g, '');
  const className = sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1);

  const templateFiles = [
    { template: 'turn-manager.template.ts', output: 'turn-manager.ts' },
    { template: 'flow-controller.template.ts', output: 'flow-controller.ts' },
    { template: 'orchestrator.template.ts', output: 'orchestrator.ts' },
    { template: 'index.template.ts', output: 'index.ts' },
  ];

  const results: Array<{ fileName: string; code: string }> = [];
  for (const { template, output } of templateFiles) {
    const templateContent = readTemplate(template);
    const code = applyTemplatePlaceholders(templateContent, agentName, className);
    results.push({ fileName: output, code });
  }
  return results;
}

function rowToAgent(row: any): Agent {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description || "",
    status: row.status as AgentStatus,
    promptStyle: (row.promptStyle || "gemini") as PromptStyle,
    mockMode: (row.mockMode || "full") as MockMode,
    configurationStep: row.configurationStep || 1,
    businessUseCase: row.businessUseCase || "",
    domainKnowledge: row.domainKnowledge || "",
    validationRules: row.validationRules || "",
    guardrails: row.guardrails || "",
    customPrompt: row.customPrompt || "",
    domainDocuments: (row.domainDocuments || []) as DomainDocument[],
    sampleDatasets: (row.sampleDatasets || []) as SampleDataset[],
    clarifyingInsights: (row.clarifyingInsights || []) as ClarifyingInsight[],
    availableActions: (row.availableActions || []) as AgentAction[],
    mockUserState: (row.mockUserState || []) as MockUserState[],
    welcomeConfig: row.welcomeConfig as any,
    promptGeneratedAt: row.promptGeneratedAt || undefined,
    lastConfigUpdate: row.lastConfigUpdate || undefined,
    promptLastRevisedBy: row.promptLastRevisedBy as any,
    promptLastRevisedAt: row.promptLastRevisedAt || undefined,
    configFieldsHash: row.configFieldsHash || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function computeUsageStats(traces: TurnTrace[]): UsageStats {
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

export interface IStorage {
  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent, userId?: string): Promise<Agent>;
  updateAgent(id: string, updates: UpdateAgent): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;
  cloneAgent(id: string, userId: string): Promise<Agent | undefined>;

  getSessions(agentId: string): Promise<ChatSessionWithPreview[]>;
  getSession(agentId: string, sessionId: string): Promise<ChatSession | undefined>;
  createSession(session: InsertChatSession): Promise<ChatSession>;
  updateSession(agentId: string, sessionId: string, updates: UpdateChatSession): Promise<ChatSession | undefined>;
  deleteSession(agentId: string, sessionId: string): Promise<boolean>;

  getMessages(agentId: string, sessionId?: string): Promise<ChatMessage[]>;
  addMessage(message: InsertChatMessage): Promise<ChatMessage>;
  clearMessages(agentId: string, sessionId?: string): Promise<void>;

  getAgentTraces(agentId: string, sessionId?: string): Promise<AgentTrace | undefined>;
  addTurnTrace(agentId: string, trace: TurnTrace): Promise<void>;
  clearTraces(agentId: string, sessionId?: string): Promise<void>;

  getConfigHistory(agentId: string): Promise<ConfigHistory | undefined>;
  addConfigSnapshot(agentId: string, snapshot: Omit<ConfigSnapshot, "id" | "timestamp">): Promise<ConfigSnapshot>;
  revertToSnapshot(agentId: string, snapshotId: string): Promise<Agent | undefined>;

  createUser(user: InsertUser): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  validatePassword(username: string, password: string): Promise<User | undefined>;
  updateUserPassword(userId: string, newPassword: string): Promise<boolean>;
  verifyUsernameExists(username: string): Promise<boolean>;

  createAuthSession(userId: string): Promise<AuthSession>;
  getAuthSession(sessionId: string): Promise<AuthSession | undefined>;
  deleteAuthSession(sessionId: string): Promise<void>;
  getUserBySessionId(sessionId: string): Promise<PublicUser | undefined>;

  getAgentsByUserId(userId: string): Promise<Agent[]>;

  getPromptCoachHistory(agentId: string): Promise<any[]>;
  savePromptCoachHistory(agentId: string, messages: any[]): Promise<void>;
  clearPromptCoachHistory(agentId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {

  async getAgents(): Promise<Agent[]> {
    const rows = await db.select().from(agentsTable).orderBy(desc(agentsTable.createdAt));
    return rows.map(rowToAgent);
  }

  async getAgent(id: string): Promise<Agent | undefined> {
    const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1);
    if (rows.length === 0) return undefined;
    return rowToAgent(rows[0]);
  }

  async createAgent(insertAgent: InsertAgent, userId?: string): Promise<Agent> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const status = insertAgent.status || "configured";

    const agent: Agent = {
      id,
      userId: userId || "",
      name: insertAgent.name,
      businessUseCase: insertAgent.businessUseCase || "",
      description: insertAgent.description || "",
      domainKnowledge: insertAgent.domainKnowledge || "",
      domainDocuments: insertAgent.domainDocuments || [],
      sampleDatasets: insertAgent.sampleDatasets || [],
      validationRules: insertAgent.validationRules || "",
      guardrails: insertAgent.guardrails || "",
      promptStyle: insertAgent.promptStyle || "gemini",
      customPrompt: insertAgent.customPrompt || "",
      clarifyingInsights: insertAgent.clarifyingInsights || [],
      availableActions: insertAgent.availableActions || [],
      mockUserState: insertAgent.mockUserState || [],
      mockMode: insertAgent.mockMode || "full",
      welcomeConfig: insertAgent.welcomeConfig,
      status,
      configurationStep: insertAgent.configurationStep || 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentsTable).values({
      id: agent.id,
      userId: agent.userId,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      promptStyle: agent.promptStyle,
      mockMode: agent.mockMode,
      configurationStep: agent.configurationStep,
      businessUseCase: agent.businessUseCase,
      domainKnowledge: agent.domainKnowledge,
      validationRules: agent.validationRules,
      guardrails: agent.guardrails,
      customPrompt: agent.customPrompt,
      domainDocuments: agent.domainDocuments,
      sampleDatasets: agent.sampleDatasets,
      clarifyingInsights: agent.clarifyingInsights,
      availableActions: agent.availableActions,
      mockUserState: agent.mockUserState,
      welcomeConfig: agent.welcomeConfig || null,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });

    try {
      const components = generateComponentCode(agent.name);
      for (const comp of components) {
        await db.insert(agentComponentsTable).values({
          id: randomUUID(),
          agentId: id,
          fileName: comp.fileName,
          code: comp.code,
          createdAt: now,
        });
      }
      console.log(`[storage] Created component templates for agent ${id} in DB`);
    } catch (error) {
      console.error(`[storage] Failed to create component templates for agent ${id}:`, error);
    }

    return agent;
  }

  async updateAgent(id: string, updates: UpdateAgent): Promise<Agent | undefined> {
    const agent = await this.getAgent(id);
    if (!agent) return undefined;

    const configFields = ['businessUseCase', 'domainKnowledge', 'domainDocuments', 'validationRules', 'guardrails', 'sampleDatasets', 'availableActions', 'mockUserState'];
    const hasConfigChange = configFields.some(field =>
      field in updates && JSON.stringify((updates as any)[field]) !== JSON.stringify((agent as any)[field])
    );

    const isPromptUpdate = 'customPrompt' in updates && updates.customPrompt !== agent.customPrompt;

    const updatedAgent: Agent = {
      ...agent,
      ...updates,
      updatedAt: new Date().toISOString(),
      ...(hasConfigChange ? { lastConfigUpdate: new Date().toISOString() } : {}),
      ...(isPromptUpdate ? { promptGeneratedAt: new Date().toISOString() } : {}),
    };

    if (isPromptUpdate && !updates.promptLastRevisedBy) {
      updatedAgent.promptLastRevisedBy = "user";
      updatedAgent.promptLastRevisedAt = new Date().toISOString();
      updatedAgent.configFieldsHash = computeConfigFieldsHash(updatedAgent);
    }

    await db.update(agentsTable).set({
      name: updatedAgent.name,
      userId: updatedAgent.userId,
      description: updatedAgent.description,
      status: updatedAgent.status,
      promptStyle: updatedAgent.promptStyle,
      mockMode: updatedAgent.mockMode,
      configurationStep: updatedAgent.configurationStep,
      businessUseCase: updatedAgent.businessUseCase,
      domainKnowledge: updatedAgent.domainKnowledge,
      validationRules: updatedAgent.validationRules,
      guardrails: updatedAgent.guardrails,
      customPrompt: updatedAgent.customPrompt,
      domainDocuments: updatedAgent.domainDocuments,
      sampleDatasets: updatedAgent.sampleDatasets,
      clarifyingInsights: updatedAgent.clarifyingInsights,
      availableActions: updatedAgent.availableActions,
      mockUserState: updatedAgent.mockUserState,
      welcomeConfig: updatedAgent.welcomeConfig || null,
      promptGeneratedAt: updatedAgent.promptGeneratedAt || null,
      lastConfigUpdate: updatedAgent.lastConfigUpdate || null,
      promptLastRevisedBy: updatedAgent.promptLastRevisedBy || null,
      promptLastRevisedAt: updatedAgent.promptLastRevisedAt || null,
      configFieldsHash: updatedAgent.configFieldsHash || null,
      updatedAt: updatedAgent.updatedAt,
    }).where(eq(agentsTable.id, id));

    return updatedAgent;
  }

  async deleteAgent(id: string): Promise<boolean> {
    const agent = await this.getAgent(id);
    if (!agent) return false;

    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.agentId, id));
    await db.delete(chatSessionsTable).where(eq(chatSessionsTable.agentId, id));
    await db.delete(agentComponentsTable).where(eq(agentComponentsTable.agentId, id));
    await db.delete(agentTracesTable).where(eq(agentTracesTable.agentId, id));
    await db.delete(configSnapshotsTable).where(eq(configSnapshotsTable.agentId, id));
    await db.delete(promptCoachHistoryTable).where(eq(promptCoachHistoryTable.agentId, id));
    await db.delete(agentsTable).where(eq(agentsTable.id, id));

    return true;
  }

  async cloneAgent(id: string, userId: string): Promise<Agent | undefined> {
    const source = await this.getAgent(id);
    if (!source) return undefined;

    const clonedAgent: InsertAgent = {
      name: `Copy of ${source.name}`,
      businessUseCase: source.businessUseCase,
      description: source.description,
      domainKnowledge: source.domainKnowledge,
      domainDocuments: JSON.parse(JSON.stringify(source.domainDocuments)),
      sampleDatasets: JSON.parse(JSON.stringify(source.sampleDatasets)),
      validationRules: source.validationRules,
      guardrails: source.guardrails,
      promptStyle: source.promptStyle,
      customPrompt: source.customPrompt,
      clarifyingInsights: JSON.parse(JSON.stringify(source.clarifyingInsights)),
      availableActions: JSON.parse(JSON.stringify(source.availableActions)),
      mockUserState: JSON.parse(JSON.stringify(source.mockUserState)),
      mockMode: source.mockMode,
      welcomeConfig: source.welcomeConfig ? JSON.parse(JSON.stringify(source.welcomeConfig)) : undefined,
      status: source.status === "draft" ? "draft" : "configured",
      configurationStep: source.configurationStep,
    };

    return this.createAgent(clonedAgent, userId);
  }

  async getSessions(agentId: string): Promise<ChatSessionWithPreview[]> {
    const sessions = await db.select().from(chatSessionsTable)
      .where(eq(chatSessionsTable.agentId, agentId))
      .orderBy(desc(chatSessionsTable.updatedAt));

    const result: ChatSessionWithPreview[] = [];
    for (const session of sessions) {
      const messages = await db.select().from(chatMessagesTable)
        .where(and(
          eq(chatMessagesTable.agentId, agentId),
          eq(chatMessagesTable.sessionId, session.id)
        ));

      const firstUserMessage = messages.find(m => m.role === "user");
      const lastMessage = messages[messages.length - 1];

      result.push({
        id: session.id,
        agentId: session.agentId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: messages.length,
        firstMessage: firstUserMessage?.content.substring(0, 100),
        lastMessageAt: lastMessage?.timestamp,
      });
    }
    return result;
  }

  async getSession(agentId: string, sessionId: string): Promise<ChatSession | undefined> {
    const rows = await db.select().from(chatSessionsTable)
      .where(and(
        eq(chatSessionsTable.agentId, agentId),
        eq(chatSessionsTable.id, sessionId)
      ))
      .limit(1);

    if (rows.length === 0) return undefined;
    return {
      id: rows[0].id,
      agentId: rows[0].agentId,
      title: rows[0].title,
      createdAt: rows[0].createdAt,
      updatedAt: rows[0].updatedAt,
    };
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

    await db.insert(chatSessionsTable).values({
      id: session.id,
      agentId: session.agentId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    return session;
  }

  async updateSession(agentId: string, sessionId: string, updates: UpdateChatSession): Promise<ChatSession | undefined> {
    const session = await this.getSession(agentId, sessionId);
    if (!session) return undefined;

    const updatedSession: ChatSession = {
      ...session,
      title: updates.title,
      updatedAt: new Date().toISOString(),
    };

    await db.update(chatSessionsTable).set({
      title: updatedSession.title,
      updatedAt: updatedSession.updatedAt,
    }).where(eq(chatSessionsTable.id, sessionId));

    return updatedSession;
  }

  async deleteSession(agentId: string, sessionId: string): Promise<boolean> {
    const session = await this.getSession(agentId, sessionId);
    if (!session) return false;

    await db.delete(chatMessagesTable).where(
      and(
        eq(chatMessagesTable.agentId, agentId),
        eq(chatMessagesTable.sessionId, sessionId)
      )
    );
    await db.delete(chatSessionsTable).where(eq(chatSessionsTable.id, sessionId));

    return true;
  }

  async getMessages(agentId: string, sessionId?: string): Promise<ChatMessage[]> {
    if (sessionId) {
      const rows = await db.select().from(chatMessagesTable)
        .where(and(
          eq(chatMessagesTable.agentId, agentId),
          eq(chatMessagesTable.sessionId, sessionId)
        ));
      return rows.map(r => ({
        id: r.id,
        agentId: r.agentId,
        sessionId: r.sessionId,
        role: r.role as "user" | "assistant",
        content: r.content,
        timestamp: r.timestamp,
      }));
    }

    const rows = await db.select().from(chatMessagesTable)
      .where(eq(chatMessagesTable.agentId, agentId));
    return rows.map(r => ({
      id: r.id,
      agentId: r.agentId,
      sessionId: r.sessionId,
      role: r.role as "user" | "assistant",
      content: r.content,
      timestamp: r.timestamp,
    })).sort((a, b) =>
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

    await db.insert(chatMessagesTable).values({
      id: message.id,
      agentId: message.agentId,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    });

    await db.update(chatSessionsTable).set({
      updatedAt: now,
    }).where(eq(chatSessionsTable.id, insertMessage.sessionId));

    return message;
  }

  async clearMessages(agentId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      await db.delete(chatMessagesTable).where(
        and(
          eq(chatMessagesTable.agentId, agentId),
          eq(chatMessagesTable.sessionId, sessionId)
        )
      );
    } else {
      await db.delete(chatMessagesTable).where(eq(chatMessagesTable.agentId, agentId));
    }
  }

  async getAgentTraces(agentId: string, sessionId?: string): Promise<AgentTrace | undefined> {
    const rows = await db.select().from(agentTracesTable)
      .where(eq(agentTracesTable.agentId, agentId))
      .limit(1);

    if (rows.length === 0) return undefined;

    const row = rows[0];
    const allTraces = (row.traces || []) as TurnTrace[];

    if (sessionId) {
      const filteredTraces = allTraces.filter(t => t.sessionId === sessionId);
      return {
        agentId: row.agentId,
        sessionId,
        traces: filteredTraces,
        stats: computeUsageStats(filteredTraces),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }

    return {
      agentId: row.agentId,
      traces: allTraces,
      stats: (row.stats || {}) as UsageStats,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async addTurnTrace(agentId: string, trace: TurnTrace): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.select().from(agentTracesTable)
      .where(eq(agentTracesTable.agentId, agentId))
      .limit(1);

    if (existing.length === 0) {
      const traces = [trace];
      await db.insert(agentTracesTable).values({
        id: randomUUID(),
        agentId,
        traces,
        stats: computeUsageStats(traces),
        createdAt: now,
        updatedAt: now,
      });
    } else {
      let traces = (existing[0].traces || []) as TurnTrace[];
      traces.push(trace);
      if (traces.length > 100) {
        traces = traces.slice(-100);
      }
      await db.update(agentTracesTable).set({
        traces,
        stats: computeUsageStats(traces),
        updatedAt: now,
      }).where(eq(agentTracesTable.id, existing[0].id));
    }
  }

  async clearTraces(agentId: string, sessionId?: string): Promise<void> {
    if (sessionId) {
      const existing = await db.select().from(agentTracesTable)
        .where(eq(agentTracesTable.agentId, agentId))
        .limit(1);

      if (existing.length > 0) {
        const traces = ((existing[0].traces || []) as TurnTrace[]).filter(t => t.sessionId !== sessionId);
        await db.update(agentTracesTable).set({
          traces,
          stats: computeUsageStats(traces),
          updatedAt: new Date().toISOString(),
        }).where(eq(agentTracesTable.id, existing[0].id));
      }
    } else {
      await db.delete(agentTracesTable).where(eq(agentTracesTable.agentId, agentId));
    }
  }

  async getConfigHistory(agentId: string): Promise<ConfigHistory | undefined> {
    const snapshots = await db.select().from(configSnapshotsTable)
      .where(eq(configSnapshotsTable.agentId, agentId))
      .orderBy(configSnapshotsTable.timestamp);

    if (snapshots.length === 0) return undefined;

    return {
      agentId,
      snapshots: snapshots.map(s => ({
        id: s.id,
        agentId: s.agentId,
        timestamp: s.timestamp,
        description: s.description || undefined,
        changes: (s.changes || []) as any[],
        config: (s.config || {}) as any,
        isRevertPoint: s.isRevertPoint,
      })),
      currentVersion: snapshots.length,
    };
  }

  async addConfigSnapshot(agentId: string, snapshot: Omit<ConfigSnapshot, "id" | "timestamp">): Promise<ConfigSnapshot> {
    const newSnapshot: ConfigSnapshot = {
      ...snapshot,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    await db.insert(configSnapshotsTable).values({
      id: newSnapshot.id,
      agentId: newSnapshot.agentId,
      description: newSnapshot.description || null,
      changes: newSnapshot.changes,
      config: newSnapshot.config,
      isRevertPoint: newSnapshot.isRevertPoint,
      timestamp: newSnapshot.timestamp,
    });

    const count = await db.select({ count: sql<number>`count(*)` })
      .from(configSnapshotsTable)
      .where(eq(configSnapshotsTable.agentId, agentId));

    if (count[0] && Number(count[0].count) > 50) {
      const oldest = await db.select().from(configSnapshotsTable)
        .where(eq(configSnapshotsTable.agentId, agentId))
        .orderBy(configSnapshotsTable.timestamp)
        .limit(1);
      if (oldest.length > 0) {
        await db.delete(configSnapshotsTable).where(eq(configSnapshotsTable.id, oldest[0].id));
      }
    }

    return newSnapshot;
  }

  async revertToSnapshot(agentId: string, snapshotId: string): Promise<Agent | undefined> {
    const history = await this.getConfigHistory(agentId);
    if (!history) return undefined;

    const snapshot = history.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return undefined;

    const agent = await this.getAgent(agentId);
    if (!agent) return undefined;

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

  async createUser(insertUser: InsertUser): Promise<User> {
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
      createdAt: now,
    };

    await db.insert(usersTable).values({
      id: user.id,
      username: user.username,
      password: user.password,
      createdAt: user.createdAt,
    });

    console.log(`[storage] Created user ${user.username} (${id})`);
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (rows.length === 0) return undefined;
    return {
      id: rows[0].id,
      username: rows[0].username,
      password: rows[0].password,
      createdAt: rows[0].createdAt,
    };
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await db.select().from(usersTable).where(
      sql`LOWER(${usersTable.username}) = LOWER(${username})`
    ).limit(1);
    if (rows.length === 0) return undefined;
    return {
      id: rows[0].id,
      username: rows[0].username,
      password: rows[0].password,
      createdAt: rows[0].createdAt,
    };
  }

  async validatePassword(username: string, password: string): Promise<User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user) return undefined;
    const isValid = await bcrypt.compare(password, user.password);
    return isValid ? user : undefined;
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ password: hashedPassword }).where(eq(usersTable.id, userId));
    console.log(`[storage] Updated password for user ${userId}`);
    return true;
  }

  async verifyUsernameExists(username: string): Promise<boolean> {
    const user = await this.getUserByUsername(username);
    return !!user;
  }

  async createAuthSession(userId: string): Promise<AuthSession> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const session: AuthSession = { id, userId, expiresAt };

    await db.insert(authSessionsTable).values({
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    });

    console.log(`[storage] Created auth session for user ${userId}`);
    return session;
  }

  async getAuthSession(sessionId: string): Promise<AuthSession | undefined> {
    const rows = await db.select().from(authSessionsTable)
      .where(eq(authSessionsTable.id, sessionId))
      .limit(1);

    if (rows.length === 0) return undefined;

    const session: AuthSession = {
      id: rows[0].id,
      userId: rows[0].userId,
      expiresAt: rows[0].expiresAt,
    };

    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(authSessionsTable).where(eq(authSessionsTable.id, sessionId));
      return undefined;
    }

    return session;
  }

  async deleteAuthSession(sessionId: string): Promise<void> {
    await db.delete(authSessionsTable).where(eq(authSessionsTable.id, sessionId));
    console.log(`[storage] Deleted auth session ${sessionId}`);
  }

  async getUserBySessionId(sessionId: string): Promise<PublicUser | undefined> {
    const session = await this.getAuthSession(sessionId);
    if (!session) return undefined;

    const user = await this.getUserById(session.userId);
    if (!user) return undefined;

    const { password, ...publicUser } = user;
    return publicUser;
  }

  async getAgentsByUserId(userId: string): Promise<Agent[]> {
    const rows = await db.select().from(agentsTable)
      .where(eq(agentsTable.userId, userId))
      .orderBy(desc(agentsTable.createdAt));
    return rows.map(rowToAgent);
  }

  async getPromptCoachHistory(agentId: string): Promise<any[]> {
    const rows = await db.select().from(promptCoachHistoryTable)
      .where(eq(promptCoachHistoryTable.agentId, agentId))
      .limit(1);

    if (rows.length === 0) return [];

    const messages = (rows[0].messages || []) as any[];
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - twoWeeksMs;

    const filtered = messages.filter((m: any) => {
      if (!m.timestamp) return true;
      return new Date(m.timestamp).getTime() > cutoff;
    });

    if (filtered.length === 0 && messages.length > 0) {
      await db.delete(promptCoachHistoryTable).where(eq(promptCoachHistoryTable.agentId, agentId));
      return [];
    }

    if (filtered.length < messages.length) {
      await db.update(promptCoachHistoryTable).set({
        messages: filtered,
        savedAt: new Date().toISOString(),
      }).where(eq(promptCoachHistoryTable.agentId, agentId));
    }

    return filtered;
  }

  async savePromptCoachHistory(agentId: string, messages: any[]): Promise<void> {
    const now = new Date().toISOString();
    const existing = await db.select().from(promptCoachHistoryTable)
      .where(eq(promptCoachHistoryTable.agentId, agentId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(promptCoachHistoryTable).values({
        id: randomUUID(),
        agentId,
        messages,
        savedAt: now,
      });
    } else {
      await db.update(promptCoachHistoryTable).set({
        messages,
        savedAt: now,
      }).where(eq(promptCoachHistoryTable.agentId, agentId));
    }
  }

  async clearPromptCoachHistory(agentId: string): Promise<void> {
    await db.delete(promptCoachHistoryTable).where(eq(promptCoachHistoryTable.agentId, agentId));
  }
}

export const storage = new DatabaseStorage();
