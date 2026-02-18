import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  usersTable,
  agentsTable,
  agentComponentsTable,
  chatSessionsTable,
  chatMessagesTable,
  agentTracesTable,
  authSessionsTable,
  promptCoachHistoryTable,
} from "@shared/schema";
import type {
  Agent, DomainDocument, SampleDataset,
  AgentStatus, PromptStyle, MockMode,
  ClarifyingInsight, AgentAction, MockUserState,
  ChatSession, ChatMessage, User, AuthSession,
} from "@shared/schema";

const AGENTS_DIR = "./agents";
const USERS_DIR = "./users";

function readTextFile(filePath: string): string {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8").trim();
  }
  return "";
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch (e) {
      console.error(`[migrate] Failed to parse JSON file ${filePath}:`, e);
      return defaultValue;
    }
  }
  return defaultValue;
}

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

export async function migrateFilesToDb(): Promise<void> {
  console.log("[migrate] Checking if DB migration is needed...");

  const agentCount = await db.select({ count: sql<number>`count(*)` }).from(agentsTable);
  const userCount = await db.select({ count: sql<number>`count(*)` }).from(usersTable);

  if (Number(agentCount[0]?.count) > 0 || Number(userCount[0]?.count) > 0) {
    console.log("[migrate] DB already has data, skipping file migration.");
    return;
  }

  console.log("[migrate] DB is empty, starting migration from files...");

  await migrateUsers();
  await migrateAuthSessions();
  await migrateAgents();

  console.log("[migrate] File-to-DB migration complete!");
}

async function migrateUsers(): Promise<void> {
  const usersFile = path.join(USERS_DIR, "users.json");
  if (!fs.existsSync(usersFile)) {
    console.log("[migrate] No users.json found, skipping user migration.");
    return;
  }

  try {
    const content = fs.readFileSync(usersFile, "utf-8");
    const users = JSON.parse(content) as User[];

    for (const user of users) {
      await db.insert(usersTable).values({
        id: user.id,
        username: user.username,
        password: user.password,
        createdAt: user.createdAt,
      });
    }
    console.log(`[migrate] Migrated ${users.length} users.`);
  } catch (e) {
    console.error("[migrate] Error migrating users:", e);
  }
}

async function migrateAuthSessions(): Promise<void> {
  const sessionsFile = path.join(USERS_DIR, "auth-sessions.json");
  if (!fs.existsSync(sessionsFile)) {
    console.log("[migrate] No auth-sessions.json found, skipping.");
    return;
  }

  try {
    const content = fs.readFileSync(sessionsFile, "utf-8");
    const sessions = JSON.parse(content) as AuthSession[];
    const now = new Date();
    let migrated = 0;

    for (const session of sessions) {
      if (new Date(session.expiresAt) > now) {
        await db.insert(authSessionsTable).values({
          id: session.id,
          userId: session.userId,
          expiresAt: session.expiresAt,
        });
        migrated++;
      }
    }
    console.log(`[migrate] Migrated ${migrated} auth sessions (${sessions.length - migrated} expired, skipped).`);
  } catch (e) {
    console.error("[migrate] Error migrating auth sessions:", e);
  }
}

async function migrateAgents(): Promise<void> {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.log("[migrate] No agents directory found, skipping agent migration.");
    return;
  }

  const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
  let agentsMigrated = 0;

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;

    const agentId = dir.name;
    const agentDir = path.join(AGENTS_DIR, agentId);

    try {
      const metaPath = path.join(agentDir, "meta.yaml");
      if (!fs.existsSync(metaPath)) {
        console.log(`[migrate] Skipping ${agentId}: no meta.yaml`);
        continue;
      }

      const metaContent = readTextFile(metaPath);
      const meta = parseSimpleYaml(metaContent);

      if (!meta.name || !meta.createdAt) {
        console.log(`[migrate] Skipping ${agentId}: invalid meta.yaml`);
        continue;
      }

      const businessUseCase = readTextFile(path.join(agentDir, "business-use-case.md"));
      const domainKnowledge = readTextFile(path.join(agentDir, "domain-knowledge.md"));
      const validationRules = readTextFile(path.join(agentDir, "validation-rules.yaml"));
      const guardrails = readTextFile(path.join(agentDir, "guardrails.yaml"));
      const customPrompt = readTextFile(path.join(agentDir, "custom-prompt.md"));
      const domainDocuments = readJsonFile<DomainDocument[]>(path.join(agentDir, "domain-documents.json"), []);
      const sampleDatasets = readJsonFile<SampleDataset[]>(path.join(agentDir, "sample-data.json"), []);
      const clarifyingInsights = readJsonFile<ClarifyingInsight[]>(path.join(agentDir, "clarifying-insights.json"), []);
      const availableActions = readJsonFile<AgentAction[]>(path.join(agentDir, "available-actions.json"), []);
      const mockUserState = readJsonFile<MockUserState[]>(path.join(agentDir, "mock-user-state.json"), []);
      const welcomeConfig = readJsonFile<any>(path.join(agentDir, "welcome-config.json"), null);

      await db.insert(agentsTable).values({
        id: agentId,
        userId: meta.userId || "",
        name: meta.name,
        description: meta.description || "",
        status: meta.status || "configured",
        promptStyle: meta.promptStyle || "gemini",
        mockMode: meta.mockMode || "full",
        configurationStep: 1,
        businessUseCase,
        domainKnowledge,
        validationRules,
        guardrails,
        customPrompt,
        domainDocuments,
        sampleDatasets,
        clarifyingInsights,
        availableActions,
        mockUserState,
        welcomeConfig: welcomeConfig || null,
        promptGeneratedAt: meta.promptGeneratedAt || null,
        lastConfigUpdate: meta.lastConfigUpdate || null,
        promptLastRevisedBy: meta.promptLastRevisedBy || null,
        promptLastRevisedAt: meta.promptLastRevisedAt || null,
        configFieldsHash: meta.configFieldsHash || null,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt || meta.createdAt,
      });

      const componentsDir = path.join(agentDir, "components");
      if (fs.existsSync(componentsDir)) {
        const compFiles = fs.readdirSync(componentsDir);
        for (const compFile of compFiles) {
          if (compFile.endsWith('.ts')) {
            const code = fs.readFileSync(path.join(componentsDir, compFile), 'utf-8');
            await db.insert(agentComponentsTable).values({
              id: randomUUID(),
              agentId,
              fileName: compFile,
              code,
              createdAt: meta.createdAt,
            });
          }
        }
      }

      const sessionsPath = path.join(agentDir, "sessions.json");
      const sessions = readJsonFile<ChatSession[]>(sessionsPath, []);
      for (const session of sessions) {
        await db.insert(chatSessionsTable).values({
          id: session.id,
          agentId: session.agentId || agentId,
          title: session.title || "New Session",
          createdAt: session.createdAt,
          updatedAt: session.updatedAt || session.createdAt,
        });

        const messagesPath = path.join(agentDir, "sessions", session.id, "messages.json");
        const messages = readJsonFile<ChatMessage[]>(messagesPath, []);
        for (const msg of messages) {
          await db.insert(chatMessagesTable).values({
            id: msg.id,
            agentId: msg.agentId || agentId,
            sessionId: msg.sessionId || session.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          });
        }
      }

      const tracesPath = path.join(agentDir, "traces.json");
      if (fs.existsSync(tracesPath)) {
        const tracesData = readJsonFile<any>(tracesPath, null);
        if (tracesData && tracesData.traces) {
          await db.insert(agentTracesTable).values({
            id: randomUUID(),
            agentId,
            traces: tracesData.traces || [],
            stats: tracesData.stats || {},
            createdAt: tracesData.createdAt || meta.createdAt,
            updatedAt: tracesData.updatedAt || meta.createdAt,
          });
        }
      }

      const coachPath = path.join(agentDir, "prompt-coach-history.json");
      if (fs.existsSync(coachPath)) {
        const coachData = readJsonFile<any>(coachPath, null);
        if (coachData) {
          const messages = coachData.messages || (Array.isArray(coachData) ? coachData : []);
          if (messages.length > 0) {
            await db.insert(promptCoachHistoryTable).values({
              id: randomUUID(),
              agentId,
              messages,
              savedAt: coachData.savedAt || new Date().toISOString(),
            });
          }
        }
      }

      agentsMigrated++;
      console.log(`[migrate] Migrated agent ${agentId} (${meta.name})`);
    } catch (e) {
      console.error(`[migrate] Error migrating agent ${agentId}:`, e);
    }
  }

  console.log(`[migrate] Migrated ${agentsMigrated} agents.`);
}
