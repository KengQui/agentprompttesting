import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  Session,
  SessionMeta,
  SessionMessage,
  SessionTodo,
  ContextSummary,
  SessionContext,
  SessionConfig,
  SessionStatus,
} from "@shared/schema";

function parseSessionMeta(content: string): Partial<SessionMeta> {
  const result: Record<string, any> = {};
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      const cleanValue = value.replace(/^["']|["']$/g, "").trim();
      if (key === "messageCount" || key === "totalTokens" || key === "contextWindowSize") {
        result[key] = parseInt(cleanValue, 10) || 0;
      } else {
        result[key] = cleanValue;
      }
    }
  }
  return result as Partial<SessionMeta>;
}

function generateSessionMetaYaml(meta: SessionMeta): string {
  return [
    `id: "${meta.id}"`,
    `agentId: "${meta.agentId}"`,
    `name: "${meta.name}"`,
    `status: "${meta.status}"`,
    meta.topic ? `topic: "${meta.topic}"` : null,
    meta.intent ? `intent: "${meta.intent}"` : null,
    `messageCount: ${meta.messageCount}`,
    `totalTokens: ${meta.totalTokens}`,
    `contextWindowSize: ${meta.contextWindowSize}`,
    `createdAt: "${meta.createdAt}"`,
    `updatedAt: "${meta.updatedAt}"`,
    `lastActivityAt: "${meta.lastActivityAt}"`,
  ].filter(Boolean).join("\n");
}

const AGENTS_DIR = path.join(process.cwd(), "agents");

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxMessagesInContext: 20,
  maxTokensInContext: 8000,
  summarizationThreshold: 15,
  autoSummarize: true,
};

export class SessionManager {
  private agentId: string;
  private sessionsDir: string;
  private config: SessionConfig;

  constructor(agentId: string, config: Partial<SessionConfig> = {}) {
    this.agentId = agentId;
    this.sessionsDir = path.join(AGENTS_DIR, agentId, "sessions");
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  private generateSessionName(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `session-${timestamp}`;
  }

  async createSession(name?: string): Promise<Session> {
    const sessionId = uuidv4();
    const sessionName = name || this.generateSessionName();
    const now = new Date().toISOString();

    const meta: SessionMeta = {
      id: sessionId,
      agentId: this.agentId,
      name: sessionName,
      status: "active",
      messageCount: 0,
      totalTokens: 0,
      contextWindowSize: this.config.maxMessagesInContext,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };

    const session: Session = {
      meta,
      messages: [],
      summaries: [],
      todos: [],
    };

    await this.saveSession(session);
    return session;
  }

  async saveSession(session: Session): Promise<void> {
    const sessionDir = this.getSessionDir(session.meta.id);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(sessionDir, "meta.yaml"),
      generateSessionMetaYaml(session.meta),
      "utf-8"
    );

    fs.writeFileSync(
      path.join(sessionDir, "messages.json"),
      JSON.stringify(session.messages, null, 2),
      "utf-8"
    );

    fs.writeFileSync(
      path.join(sessionDir, "summaries.json"),
      JSON.stringify(session.summaries, null, 2),
      "utf-8"
    );

    fs.writeFileSync(
      path.join(sessionDir, "todos.json"),
      JSON.stringify(session.todos, null, 2),
      "utf-8"
    );
  }

  async loadSession(sessionId: string): Promise<Session | null> {
    const sessionDir = this.getSessionDir(sessionId);

    if (!fs.existsSync(sessionDir)) {
      return null;
    }

    try {
      const metaPath = path.join(sessionDir, "meta.yaml");
      const messagesPath = path.join(sessionDir, "messages.json");
      const summariesPath = path.join(sessionDir, "summaries.json");
      const todosPath = path.join(sessionDir, "todos.json");

      const metaContent = fs.readFileSync(metaPath, "utf-8");
      const parsedMeta = parseSessionMeta(metaContent);
      const meta: SessionMeta = {
        id: parsedMeta.id || "",
        agentId: parsedMeta.agentId || "",
        name: parsedMeta.name || "",
        status: (parsedMeta.status as SessionStatus) || "active",
        topic: parsedMeta.topic,
        intent: parsedMeta.intent,
        messageCount: parsedMeta.messageCount || 0,
        totalTokens: parsedMeta.totalTokens || 0,
        contextWindowSize: parsedMeta.contextWindowSize || 20,
        createdAt: parsedMeta.createdAt || "",
        updatedAt: parsedMeta.updatedAt || "",
        lastActivityAt: parsedMeta.lastActivityAt || "",
      };

      const messages: SessionMessage[] = fs.existsSync(messagesPath)
        ? JSON.parse(fs.readFileSync(messagesPath, "utf-8"))
        : [];

      const summaries: ContextSummary[] = fs.existsSync(summariesPath)
        ? JSON.parse(fs.readFileSync(summariesPath, "utf-8"))
        : [];

      const todos: SessionTodo[] = fs.existsSync(todosPath)
        ? JSON.parse(fs.readFileSync(todosPath, "utf-8"))
        : [];

      return { meta, messages, summaries, todos };
    } catch (error) {
      console.error(`Error loading session ${sessionId}:`, error);
      return null;
    }
  }

  async getActiveSession(): Promise<Session | null> {
    const sessions = await this.listSessions();
    const activeSession = sessions.find((s) => s.status === "active");
    
    if (activeSession) {
      return this.loadSession(activeSession.id);
    }
    
    return null;
  }

  async getOrCreateActiveSession(): Promise<Session> {
    const activeSession = await this.getActiveSession();
    if (activeSession) {
      return activeSession;
    }
    return this.createSession();
  }

  async listSessions(): Promise<SessionMeta[]> {
    if (!fs.existsSync(this.sessionsDir)) {
      return [];
    }

    const sessionDirs = fs.readdirSync(this.sessionsDir).filter((dir) => {
      const fullPath = path.join(this.sessionsDir, dir);
      return fs.statSync(fullPath).isDirectory();
    });

    const sessions: SessionMeta[] = [];

    for (const dir of sessionDirs) {
      const metaPath = path.join(this.sessionsDir, dir, "meta.yaml");
      if (fs.existsSync(metaPath)) {
        try {
          const metaContent = fs.readFileSync(metaPath, "utf-8");
          const parsedMeta = parseSessionMeta(metaContent);
          const meta: SessionMeta = {
            id: parsedMeta.id || "",
            agentId: parsedMeta.agentId || "",
            name: parsedMeta.name || "",
            status: (parsedMeta.status as SessionStatus) || "active",
            topic: parsedMeta.topic,
            intent: parsedMeta.intent,
            messageCount: parsedMeta.messageCount || 0,
            totalTokens: parsedMeta.totalTokens || 0,
            contextWindowSize: parsedMeta.contextWindowSize || 20,
            createdAt: parsedMeta.createdAt || "",
            updatedAt: parsedMeta.updatedAt || "",
            lastActivityAt: parsedMeta.lastActivityAt || "",
          };
          sessions.push(meta);
        } catch (error) {
          console.error(`Error loading session meta for ${dir}:`, error);
        }
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() -
        new Date(a.lastActivityAt).getTime()
    );
  }

  async addMessage(
    sessionId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<SessionMessage> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const message: SessionMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date().toISOString(),
      tokenCount: this.estimateTokens(content),
      summarized: false,
    };

    session.messages.push(message);
    session.meta.messageCount = session.messages.length;
    session.meta.totalTokens += message.tokenCount || 0;
    session.meta.lastActivityAt = new Date().toISOString();
    session.meta.updatedAt = new Date().toISOString();

    await this.saveSession(session);

    if (
      this.config.autoSummarize &&
      session.messages.length > this.config.summarizationThreshold
    ) {
      await this.checkAndSummarize(sessionId);
    }

    return message;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async getContextForLLM(sessionId: string): Promise<SessionContext> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const unsummarizedMessages = session.messages.filter((m) => !m.summarized);
    const recentMessages = unsummarizedMessages.slice(
      -this.config.maxMessagesInContext
    );

    let summarizedContext: string | undefined;
    if (session.summaries.length > 0) {
      summarizedContext = session.summaries
        .map((s) => s.content)
        .join("\n\n---\n\n");
    }

    const activeTodos = session.todos.filter(
      (t) => t.status === "pending" || t.status === "in_progress"
    );

    return {
      recentMessages,
      summarizedContext,
      activeTodos,
      sessionMeta: {
        topic: session.meta.topic,
        intent: session.meta.intent,
        messageCount: session.meta.messageCount,
      },
    };
  }

  async checkAndSummarize(sessionId: string): Promise<void> {
    const session = await this.loadSession(sessionId);
    if (!session) return;

    const unsummarizedMessages = session.messages.filter((m) => !m.summarized);
    
    if (unsummarizedMessages.length <= this.config.maxMessagesInContext) {
      return;
    }

    const messagesToSummarize = unsummarizedMessages.slice(
      0,
      unsummarizedMessages.length - this.config.maxMessagesInContext
    );

    if (messagesToSummarize.length < 5) {
      return;
    }

    const summary = await this.createSummary(messagesToSummarize);
    session.summaries.push(summary);

    for (const msg of messagesToSummarize) {
      const idx = session.messages.findIndex((m) => m.id === msg.id);
      if (idx !== -1) {
        session.messages[idx].summarized = true;
      }
    }

    await this.saveSession(session);
  }

  private async createSummary(
    messages: SessionMessage[]
  ): Promise<ContextSummary> {
    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const summaryContent = this.generateLocalSummary(conversationText, messages);

    return {
      id: uuidv4(),
      content: summaryContent,
      messageRange: {
        startId: messages[0].id,
        endId: messages[messages.length - 1].id,
        messageCount: messages.length,
      },
      topics: this.extractTopics(conversationText),
      keyDecisions: [],
      createdAt: new Date().toISOString(),
      tokenCount: this.estimateTokens(summaryContent),
    };
  }

  private generateLocalSummary(
    text: string,
    messages: SessionMessage[]
  ): string {
    const userMessages = messages.filter((m) => m.role === "user");
    const assistantMessages = messages.filter((m) => m.role === "assistant");

    const userTopics = userMessages
      .slice(0, 3)
      .map((m) => m.content.slice(0, 100))
      .join("; ");

    return `[Context Summary - ${messages.length} messages]\n` +
      `User discussed: ${userTopics}...\n` +
      `Assistant provided ${assistantMessages.length} responses covering the conversation topics.`;
  }

  private extractTopics(text: string): string[] {
    const topicKeywords = [
      "support",
      "sales",
      "question",
      "feedback",
      "scheduling",
      "help",
      "issue",
      "problem",
      "feature",
      "request",
    ];

    const lowerText = text.toLowerCase();
    return topicKeywords.filter((keyword) => lowerText.includes(keyword));
  }

  async addTodo(
    sessionId: string,
    content: string,
    priority: "low" | "medium" | "high" = "medium"
  ): Promise<SessionTodo> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const todo: SessionTodo = {
      id: uuidv4(),
      content,
      status: "pending",
      priority,
      createdAt: new Date().toISOString(),
    };

    session.todos.push(todo);
    await this.saveSession(session);

    return todo;
  }

  async updateTodo(
    sessionId: string,
    todoId: string,
    updates: Partial<SessionTodo>
  ): Promise<SessionTodo | null> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const todoIndex = session.todos.findIndex((t) => t.id === todoId);
    if (todoIndex === -1) {
      return null;
    }

    session.todos[todoIndex] = { ...session.todos[todoIndex], ...updates };

    if (updates.status === "completed") {
      session.todos[todoIndex].completedAt = new Date().toISOString();
    }

    await this.saveSession(session);
    return session.todos[todoIndex];
  }

  async getTodos(sessionId: string): Promise<SessionTodo[]> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return [];
    }
    return session.todos;
  }

  async updateSessionMeta(
    sessionId: string,
    updates: Partial<SessionMeta>
  ): Promise<SessionMeta | null> {
    const session = await this.loadSession(sessionId);
    if (!session) {
      return null;
    }

    session.meta = {
      ...session.meta,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    return session.meta;
  }

  async archiveSession(sessionId: string): Promise<void> {
    await this.updateSessionMeta(sessionId, { status: "archived" });
  }

  async completeSession(sessionId: string): Promise<void> {
    await this.updateSessionMeta(sessionId, { status: "completed" });
  }
}

export function createSessionManager(
  agentId: string,
  config?: Partial<SessionConfig>
): SessionManager {
  return new SessionManager(agentId, config);
}
