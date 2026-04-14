import { db, pool } from "./db";
import { usersTable, agentsTable, agentComponentsTable, chatSessionsTable, chatMessagesTable, agentTracesTable, configSnapshotsTable, promptCoachHistoryTable } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const SEED_DATA_PATH = path.join(process.cwd(), "seed-data.json");

export async function importSeedDataIfNeeded(): Promise<void> {
  if (!fs.existsSync(SEED_DATA_PATH)) {
    console.log("[seed-import] No seed-data.json found, skipping.");
    return;
  }

  const existingUsers = await db.select().from(usersTable);
  const existingAgents = await db.select().from(agentsTable);
  if (existingUsers.length > 0 || existingAgents.length > 0) {
    console.log(`[seed-import] Database already has data (${existingUsers.length} users, ${existingAgents.length} agents). Skipping seed import.`);
    return;
  }

  console.log("[seed-import] Fresh database detected. Importing seed data...");

  let seedData: any;
  try {
    seedData = JSON.parse(fs.readFileSync(SEED_DATA_PATH, "utf-8"));
  } catch (err: any) {
    console.error(`[seed-import] Failed to read seed data: ${err.message}`);
    return;
  }

  if (!seedData?.version || !seedData?.data || !seedData?.user) {
    console.error("[seed-import] Invalid seed data format.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userExists = await db.select().from(usersTable).where(eq(usersTable.username, seedData.user.username));
    if (userExists.length === 0) {
      await client.query(
        `INSERT INTO users (id, username, password, created_at) VALUES ($1, $2, $3, $4)`,
        [seedData.user.id, seedData.user.username, seedData.user.password, seedData.user.createdAt || new Date().toISOString()]
      );
      console.log(`[seed-import] Created user: ${seedData.user.username}`);
    }

    const { agents, components, sessions, messages, traces, snapshots, coachHistory } = seedData.data;

    if (agents?.length) {
      const agentCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' ORDER BY ordinal_position`
      );
      const validCols = new Set(agentCols.rows.map((r: any) => r.column_name));

      for (const agent of agents) {
        const cols: string[] = [];
        const vals: any[] = [];
        const placeholders: string[] = [];
        let idx = 1;

        for (const [key, val] of Object.entries(agent)) {
          const dbCol = camelToSnake(key);
          if (!validCols.has(dbCol)) continue;
          cols.push(`"${dbCol}"`);
          placeholders.push(`$${idx}`);
          vals.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
          idx++;
        }

        if (cols.length > 0) {
          await client.query(
            `INSERT INTO agents (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (id) DO NOTHING`,
            vals
          );
        }
      }
      console.log(`[seed-import] Imported ${agents.length} agents`);
    }

    if (components?.length) {
      for (const comp of components) {
        await client.query(
          `INSERT INTO agent_components (id, agent_id, file_name, code, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [comp.id, comp.agentId, comp.fileName, comp.code, comp.createdAt || new Date().toISOString()]
        );
      }
      console.log(`[seed-import] Imported ${components.length} components`);
    }

    if (sessions?.length) {
      for (const session of sessions) {
        await client.query(
          `INSERT INTO chat_sessions (id, agent_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [session.id, session.agentId, session.title, session.createdAt, session.updatedAt]
        );
      }
      console.log(`[seed-import] Imported ${sessions.length} sessions`);
    }

    if (messages?.length) {
      for (const msg of messages) {
        await client.query(
          `INSERT INTO chat_messages (id, agent_id, session_id, role, content, timestamp) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [msg.id, msg.agentId, msg.sessionId, msg.role, msg.content, msg.timestamp]
        );
      }
      console.log(`[seed-import] Imported ${messages.length} messages`);
    }

    if (traces?.length) {
      for (const trace of traces) {
        await client.query(
          `INSERT INTO agent_traces (id, agent_id, session_id, trace_type, data, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [trace.id, trace.agentId, trace.sessionId, trace.traceType, typeof trace.data === 'object' ? JSON.stringify(trace.data) : trace.data, trace.createdAt]
        );
      }
      console.log(`[seed-import] Imported ${traces.length} traces`);
    }

    if (snapshots?.length) {
      for (const snap of snapshots) {
        await client.query(
          `INSERT INTO config_snapshots (id, agent_id, snapshot_data, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [snap.id, snap.agentId, typeof snap.snapshotData === 'object' ? JSON.stringify(snap.snapshotData) : snap.snapshotData, snap.createdAt]
        );
      }
      console.log(`[seed-import] Imported ${snapshots.length} snapshots`);
    }

    if (coachHistory?.length) {
      for (const ch of coachHistory) {
        await client.query(
          `INSERT INTO prompt_coach_history (id, agent_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [ch.id, ch.agentId, ch.role, ch.content, ch.createdAt]
        );
      }
      console.log(`[seed-import] Imported ${coachHistory.length} coach history entries`);
    }

    await client.query("COMMIT");
    console.log(`[seed-import] Seed data import complete! Login with username: ${seedData.user.username}, password: ${seedData.defaultPassword}`);
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error(`[seed-import] Import failed, rolled back: ${err.message}`);
  } finally {
    client.release();
  }
}

function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}
