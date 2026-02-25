import * as fs from "fs";
import * as path from "path";
import { db, pool } from "./db";
import { agentsTable, agentComponentsTable, usersTable, chatSessionsTable, chatMessagesTable } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const SNAPSHOT_PATH = path.join(process.cwd(), "agent-config-snapshot.json");

const ADMIN_USERNAME = "kengqui.chia@ukg.com";

const SYNC_FIELDS = [
  'name', 'description', 'status', 'promptStyle', 'mockMode',
  'configurationStep', 'businessUseCase', 'domainKnowledge',
  'validationRules', 'guardrails', 'customPrompt', 'savedPrompts',
  'domainDocuments', 'sampleDatasets', 'clarifyingInsights',
  'availableActions', 'mockUserState', 'welcomeConfig',
  'promptGeneratedAt', 'lastConfigUpdate', 'promptLastRevisedBy',
  'promptLastRevisedAt', 'configFieldsHash',
];

let snapshotTimeout: ReturnType<typeof setTimeout> | null = null;

async function resolveAdminUserId(): Promise<string | null> {
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.username, ADMIN_USERNAME));
    if (users.length > 0) return users[0].id;
    console.error(`[snapshot-sync] Admin user "${ADMIN_USERNAME}" not found in database`);
    return null;
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to resolve admin user: ${err.message}`);
    return null;
  }
}

export async function writeAgentSnapshot(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  try {
    const adminUserId = await resolveAdminUserId();
    if (!adminUserId) {
      console.error(`[snapshot-sync] Cannot write snapshot: admin user not found`);
      return;
    }

    const agents = await db.select().from(agentsTable).where(eq(agentsTable.userId, adminUserId));
    const agentIds = new Set(agents.map(a => a.id));
    const allComponents = await db.select().from(agentComponentsTable);
    const components = allComponents.filter(c => agentIds.has(c.agentId));

    let existingPinnedSessions: any[] = [];
    if (fs.existsSync(SNAPSHOT_PATH)) {
      try {
        const existing = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
        existingPinnedSessions = existing.pinnedSessions || [];
      } catch {}
    }

    const snapshot = {
      generatedAt: new Date().toISOString(),
      ownerUsername: ADMIN_USERNAME,
      ownerDevUserId: adminUserId,
      agents: agents.map(agent => {
        const config: Record<string, any> = {
          id: agent.id,
          userId: agent.userId,
        };
        for (const field of SYNC_FIELDS) {
          config[field] = (agent as any)[field] ?? null;
        }
        config.createdAt = agent.createdAt;
        config.updatedAt = agent.updatedAt;
        return config;
      }),
      components: components.map(comp => ({
        id: comp.id,
        agentId: comp.agentId,
        fileName: comp.fileName,
        code: comp.code,
        createdAt: comp.createdAt,
      })),
      pinnedSessions: existingPinnedSessions,
    };

    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`[snapshot-sync] Wrote snapshot for "${ADMIN_USERNAME}": ${agents.length} agents, ${components.length} components, ${existingPinnedSessions.length} pinned sessions`);
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to write snapshot: ${err.message}`);
  }
}

export async function pinSessionsToSnapshot(sessionIds: string[]): Promise<number> {
  if (process.env.NODE_ENV === "production") return 0;

  const sessions = sessionIds.length > 0
    ? await db.select().from(chatSessionsTable).where(inArray(chatSessionsTable.id, sessionIds))
    : [];

  const messages = sessionIds.length > 0
    ? await db.select().from(chatMessagesTable).where(inArray(chatMessagesTable.sessionId, sessionIds))
    : [];

  const messagesBySession = new Map<string, typeof messages>();
  for (const msg of messages) {
    if (!messagesBySession.has(msg.sessionId)) messagesBySession.set(msg.sessionId, []);
    messagesBySession.get(msg.sessionId)!.push(msg);
  }

  const pinnedSessions = sessions.map(s => ({
    id: s.id,
    agentId: s.agentId,
    title: s.title,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messages: (messagesBySession.get(s.id) || []).map(m => ({
      id: m.id,
      agentId: m.agentId,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })),
  }));

  let snapshot: any = {};
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
    } catch {}
  }

  snapshot.pinnedSessions = pinnedSessions;
  snapshot.pinnedSessionsUpdatedAt = new Date().toISOString();

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`[snapshot-sync] Pinned ${pinnedSessions.length} sessions to snapshot`);
  return pinnedSessions.length;
}

export function scheduleSnapshotWrite(): void {
  if (process.env.NODE_ENV === "production") return;
  if (snapshotTimeout) clearTimeout(snapshotTimeout);
  snapshotTimeout = setTimeout(() => {
    writeAgentSnapshot().catch(() => {});
    snapshotTimeout = null;
  }, 2000);
}

export async function applySnapshotOnStartup(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log("[snapshot-sync] DEV mode: skipping snapshot apply.");
    return;
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.log("[snapshot-sync] No snapshot file found, skipping.");
    return;
  }

  let snapshot: any;
  try {
    const content = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    snapshot = JSON.parse(content);
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to read snapshot: ${err.message}`);
    return;
  }

  if (!snapshot?.agents || !Array.isArray(snapshot.agents)) {
    console.log("[snapshot-sync] Snapshot has no agents array, skipping.");
    return;
  }

  const ownerUsername = snapshot.ownerUsername || ADMIN_USERNAME;
  const devUserId = snapshot.ownerDevUserId;

  const client = await pool.connect();

  let prodUserId: string | null = null;
  try {
    const userResult = await client.query('SELECT id FROM users WHERE username = $1', [ownerUsername]);
    if (userResult.rows.length > 0) {
      prodUserId = userResult.rows[0].id;
    } else {
      console.error(`[snapshot-sync] Owner "${ownerUsername}" not found in production database. Aborting sync.`);
      client.release();
      return;
    }
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to look up owner in production: ${err.message}`);
    client.release();
    return;
  }

  const needsUserIdRemap = devUserId && prodUserId && devUserId !== prodUserId;
  if (needsUserIdRemap) {
    console.log(`[snapshot-sync] User ID differs between environments (dev: ${devUserId}, prod: ${prodUserId}). Will remap agent ownership.`);
  }

  const ownerAgents = snapshot.agents.filter((a: any) => a.userId === devUserId);
  const ownerAgentIds = new Set(ownerAgents.map((a: any) => a.id));
  const ownerComponents = (snapshot.components || []).filter((c: any) => ownerAgentIds.has(c.agentId));

  console.log(`[snapshot-sync] Applying snapshot from ${snapshot.generatedAt} for "${ownerUsername}": ${ownerAgents.length} agents, ${ownerComponents.length} components (skipping ${snapshot.agents.length - ownerAgents.length} agents from other users)`);

  let validColumns: Set<string>;
  try {
    const colResult = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'agents'`
    );
    validColumns = new Set(colResult.rows.map((r: any) => r.column_name));
    console.log(`[snapshot-sync] Detected ${validColumns.size} columns in agents table`);
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to detect columns: ${err.message}`);
    client.release();
    return;
  }

  try {
    for (const agentData of ownerAgents) {
      try {
        if (needsUserIdRemap) {
          agentData.userId = prodUserId;
        }

        const existsResult = await client.query('SELECT id FROM agents WHERE id = $1', [agentData.id]);

        if (existsResult.rows.length > 0) {
          const setClauses: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

          if (needsUserIdRemap && validColumns.has('user_id')) {
            setClauses.push(`"user_id" = $${paramIdx}`);
            values.push(prodUserId);
            paramIdx++;
          }

          for (const field of SYNC_FIELDS) {
            if (!(field in agentData)) continue;
            const dbField = camelToSnake(field);
            if (!validColumns.has(dbField)) continue;
            const val = agentData[field];
            setClauses.push(`"${dbField}" = $${paramIdx}`);
            values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
            paramIdx++;
          }

          if (setClauses.length > 0) {
            if (validColumns.has('updated_at')) {
              setClauses.push(`"updated_at" = $${paramIdx}`);
              values.push(agentData.updatedAt || new Date().toISOString());
              paramIdx++;
            }

            values.push(agentData.id);
            await client.query(
              `UPDATE agents SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
              values
            );
            console.log(`[snapshot-sync] Updated agent: ${agentData.name}`);
          }
        } else {
          const columns: string[] = [];
          const placeholders: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

          const allFields = ['id', 'userId', ...SYNC_FIELDS, 'createdAt', 'updatedAt'];
          for (const field of allFields) {
            if (!(field in agentData)) continue;
            const dbField = camelToSnake(field);
            if (!validColumns.has(dbField)) continue;
            columns.push(`"${dbField}"`);
            placeholders.push(`$${paramIdx}`);
            const val = agentData[field];
            values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
            paramIdx++;
          }

          if (columns.length > 0) {
            await client.query(
              `INSERT INTO agents (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
              values
            );
            console.log(`[snapshot-sync] Inserted new agent: ${agentData.name}`);
          }
        }
      } catch (agentErr: any) {
        console.error(`[snapshot-sync] Error syncing agent ${agentData.name}: ${agentErr.message}`);
      }
    }

    if (ownerComponents.length > 0) {
      for (const comp of ownerComponents) {
        if (!comp.agentId || !comp.fileName) continue;

        try {
          const existsResult = await client.query(
            'SELECT id FROM agent_components WHERE agent_id = $1 AND file_name = $2',
            [comp.agentId, comp.fileName]
          );

          if (existsResult.rows.length > 0) {
            await client.query(
              'UPDATE agent_components SET code = $1 WHERE agent_id = $2 AND file_name = $3',
              [comp.code, comp.agentId, comp.fileName]
            );
          } else {
            await client.query(
              'INSERT INTO agent_components (id, agent_id, file_name, code, created_at) VALUES ($1, $2, $3, $4, $5)',
              [comp.id, comp.agentId, comp.fileName, comp.code, comp.createdAt || new Date().toISOString()]
            );
          }
        } catch (compErr: any) {
          console.error(`[snapshot-sync] Error syncing component ${comp.fileName}: ${compErr.message}`);
        }
      }
      console.log(`[snapshot-sync] Synced ${ownerComponents.length} components`);
    }

    const pinnedSessions: any[] = snapshot.pinnedSessions || [];
    if (pinnedSessions.length > 0) {
      console.log(`[snapshot-sync] Restoring ${pinnedSessions.length} pinned sessions to production...`);
      for (const sessionData of pinnedSessions) {
        try {
          const sessionExists = await client.query(
            'SELECT id FROM chat_sessions WHERE id = $1',
            [sessionData.id]
          );

          if (sessionExists.rows.length > 0) {
            await client.query(
              'UPDATE chat_sessions SET title = $1, agent_id = $2, updated_at = $3 WHERE id = $4',
              [sessionData.title, sessionData.agentId, sessionData.updatedAt, sessionData.id]
            );
          } else {
            await client.query(
              'INSERT INTO chat_sessions (id, agent_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
              [sessionData.id, sessionData.agentId, sessionData.title, sessionData.createdAt, sessionData.updatedAt]
            );
          }

          const messages: any[] = sessionData.messages || [];
          for (const msg of messages) {
            const msgExists = await client.query(
              'SELECT id FROM chat_messages WHERE id = $1',
              [msg.id]
            );
            if (msgExists.rows.length === 0) {
              await client.query(
                'INSERT INTO chat_messages (id, agent_id, session_id, role, content, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
                [msg.id, msg.agentId, msg.sessionId, msg.role, msg.content, msg.timestamp]
              );
            }
          }
          console.log(`[snapshot-sync] Restored pinned session: ${sessionData.title} (${messages.length} messages)`);
        } catch (sessionErr: any) {
          console.error(`[snapshot-sync] Error restoring session ${sessionData.id}: ${sessionErr.message}`);
        }
      }
      console.log(`[snapshot-sync] Finished restoring pinned sessions.`);
    }

    console.log("[snapshot-sync] Snapshot applied successfully.");
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to apply snapshot: ${err.message}`);
    if (err.stack) {
      console.error(`[snapshot-sync] Stack: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
    }
  } finally {
    client.release();
  }
}

function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}
