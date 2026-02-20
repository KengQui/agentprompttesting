import * as fs from "fs";
import * as path from "path";
import { db, pool } from "./db";
import { agentsTable, agentComponentsTable } from "@shared/schema";

const SNAPSHOT_PATH = path.join(process.cwd(), "agent-config-snapshot.json");

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

export async function writeAgentSnapshot(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  try {
    const agents = await db.select().from(agentsTable);
    const components = await db.select().from(agentComponentsTable);

    const snapshot = {
      generatedAt: new Date().toISOString(),
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
    };

    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
    console.log(`[snapshot-sync] Wrote snapshot: ${agents.length} agents, ${components.length} components`);
  } catch (err: any) {
    console.error(`[snapshot-sync] Failed to write snapshot: ${err.message}`);
  }
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

  console.log(`[snapshot-sync] Applying snapshot from ${snapshot.generatedAt}: ${snapshot.agents.length} agents, ${snapshot.components?.length || 0} components`);

  const client = await pool.connect();

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
    for (const agentData of snapshot.agents) {
      try {
        const existsResult = await client.query('SELECT id FROM agents WHERE id = $1', [agentData.id]);

        if (existsResult.rows.length > 0) {
          const setClauses: string[] = [];
          const values: any[] = [];
          let paramIdx = 1;

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

    if (snapshot.components && Array.isArray(snapshot.components)) {
      for (const comp of snapshot.components) {
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
      console.log(`[snapshot-sync] Synced ${snapshot.components.length} components`);
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
