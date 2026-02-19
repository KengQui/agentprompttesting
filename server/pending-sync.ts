import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  agentsTable,
  agentComponentsTable,
  chatSessionsTable,
  chatMessagesTable,
  agentTracesTable,
  configSnapshotsTable,
  promptCoachHistoryTable,
} from "@shared/schema";

export interface SyncOperation {
  id: string;
  type: "update" | "delete";
  agentId: string;
  agentName?: string;
  updates?: Record<string, any>;
  addedAt: string;
}

const pendingOps: SyncOperation[] = [
  // === PENDING SYNC OPERATIONS ===
  // Add operations here, then publish to apply them to production.
  // After confirming they ran, remove them from this list.

  // 1. Rename agent in production
  { id: "rename-pm-eng", type: "update", agentId: "2dd70ace-b577-41f4-b6f5-b640940f7c65", agentName: "PM/ENG Custom Column Expression Builder", updates: { name: "PM/ENG Custom Column Expression Builder" }, addedAt: "2026-02-19T00:00:00Z" },

  // 2. Delete test/obsolete agents from production
  { id: "del-1", type: "delete", agentId: "96dcbd4b-18b3-432c-b5ea-d80fa9c58d3a", agentName: "Action Test Agent Oab5V1", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-2", type: "delete", agentId: "70c1b6c9-8a15-4001-ad21-d272448db64e", agentName: "Call-In Shift Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-3", type: "delete", agentId: "c17076bb-46b1-4107-b1ba-d849ced1be30", agentName: "Call-In Test Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-4", type: "delete", agentId: "7d42e8b6-9855-47b1-8e5d-8509dd558233", agentName: "Change address", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-5", type: "delete", agentId: "fdeb64a5-5356-4510-9c76-0dc6a1a94399", agentName: "Copy of Test Agent for Clone", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-6", type: "delete", agentId: "5be41caa-a183-493f-96a4-0dc59ffa9347", agentName: "Draft-Agent-TnqJh7", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-7", type: "delete", agentId: "b29697d1-ffe3-4289-a410-8a0ee579c8d5", agentName: "FlowTestAgent_MbZOxj", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-8", type: "delete", agentId: "058c77db-3d7f-42de-8a36-ceb923be26de", agentName: "HCM Expression Builder Test", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-9", type: "delete", agentId: "0df7fd11-3936-47f1-a129-8bb501c79d02", agentName: "HCM Report Custom Column Builder", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-10", type: "delete", agentId: "f628aad9-cb26-4f7d-b50b-3335e2024a78", agentName: "HR Assistant Tester", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-11", type: "delete", agentId: "bdc15d16-1482-4d7f-80bc-56ffcba076f2", agentName: "InferTest_0KRXVX", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-12", type: "delete", agentId: "8a370835-04ed-42c0-94d3-d3951e90a44e", agentName: "Life Event Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-13", type: "delete", agentId: "7162eebc-d5ae-49c9-b46d-2c320c9da1e2", agentName: "Life event (duplicate)", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-14", type: "delete", agentId: "0b63438c-1dbc-4cb5-a375-400ecb73ebb8", agentName: "MultiFile Test Agent ypCl2E", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-15", type: "delete", agentId: "7b2c2c01-3192-44d5-be33-f1f6de022578", agentName: "Pay check", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-16", type: "delete", agentId: "a2bf40b4-2d96-4ffb-ad64-87e66d7e1932", agentName: "Pay check - Payroll Assistant", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-17", type: "delete", agentId: "9e7e0b5c-1a27-4559-bb34-630baa1324ee", agentName: "Payroll Assistant", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-18", type: "delete", agentId: "cc4add53-14b3-4383-9d03-71ae7d82f0de", agentName: "Personal SS", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-19", type: "delete", agentId: "b4de4b7b-b638-4637-9a6c-7e6995ec91e6", agentName: "Personal SS (duplicate)", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-20", type: "delete", agentId: "c5bbbf25-b7d8-4d24-bf53-3392ea60848b", agentName: "Settings Test Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-21", type: "delete", agentId: "4a8ee491-a954-4756-a43e-60c42c2dc8fb", agentName: "Test", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-22", type: "delete", agentId: "6e20db71-c2fb-40a3-bb96-9dfe6cb4151e", agentName: "Test Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-23", type: "delete", agentId: "154a7204-5c82-4822-8f1f-4cba01b21ea7", agentName: "Test Agent for Clone", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-24", type: "delete", agentId: "4267f8a7-a336-41e6-b3d6-afd9d56be4cd", agentName: "Test Flow Agent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-25", type: "delete", agentId: "f1abe572-4ee0-44ad-a2ca-4f4ee50fa8dd", agentName: "TestFlowAgent", addedAt: "2026-02-19T00:00:00Z" },
  { id: "del-26", type: "delete", agentId: "adba5eab-6e3b-4d04-80cb-cf25bf8cf3b7", agentName: "Vacation Manager Test", addedAt: "2026-02-19T00:00:00Z" },
];

export function getPendingOps(): SyncOperation[] {
  return [...pendingOps];
}

export function addPendingOp(op: SyncOperation): void {
  pendingOps.push(op);
}

export function clearPendingOps(): void {
  pendingOps.length = 0;
}

async function directDeleteAgent(agentId: string): Promise<boolean> {
  const agentRows = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, agentId));
  if (agentRows.length === 0) return false;

  const tables = [
    { table: chatMessagesTable, col: chatMessagesTable.agentId, name: "chat_messages" },
    { table: chatSessionsTable, col: chatSessionsTable.agentId, name: "chat_sessions" },
    { table: agentComponentsTable, col: agentComponentsTable.agentId, name: "agent_components" },
    { table: agentTracesTable, col: agentTracesTable.agentId, name: "agent_traces" },
    { table: configSnapshotsTable, col: configSnapshotsTable.agentId, name: "config_snapshots" },
    { table: promptCoachHistoryTable, col: promptCoachHistoryTable.agentId, name: "prompt_coach_history" },
  ];

  for (const { table, col, name } of tables) {
    try {
      await db.delete(table).where(eq(col, agentId));
    } catch (tableErr: any) {
      console.warn(`[pending-sync] Warning: failed to delete from ${name} for ${agentId}: ${tableErr?.message || tableErr}`);
    }
  }

  await db.delete(agentsTable).where(eq(agentsTable.id, agentId));
  return true;
}

export async function applyPendingSyncOnStartup(): Promise<void> {
  if (pendingOps.length === 0) {
    console.log("[pending-sync] No pending sync operations.");
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const deleteOps = pendingOps.filter(op => op.type === "delete");
  const updateOps = pendingOps.filter(op => op.type === "update");

  if (!isProduction && deleteOps.length > 0) {
    console.log(`[pending-sync] DEV MODE: Skipping ${deleteOps.length} delete operation(s). Deletes only run in production.`);
  }

  const opsToRun = isProduction ? pendingOps : updateOps;

  if (opsToRun.length === 0) {
    console.log("[pending-sync] No applicable operations for this environment.");
    return;
  }

  console.log(`[pending-sync] Found ${opsToRun.length} operation(s) to apply (env: ${isProduction ? "production" : "development"})...`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const op of opsToRun) {
    try {
      if (op.type === "update" && op.updates) {
        const agentRows = await db.select({ id: agentsTable.id }).from(agentsTable).where(eq(agentsTable.id, op.agentId));
        if (agentRows.length === 0) {
          console.log(`[pending-sync] SKIP update: agent ${op.agentId} not found in this DB`);
          skipCount++;
          continue;
        }
        await db.update(agentsTable).set(op.updates).where(eq(agentsTable.id, op.agentId));
        console.log(`[pending-sync] UPDATED agent "${op.agentName || op.agentId}"`);
        successCount++;
      } else if (op.type === "delete") {
        const deleted = await directDeleteAgent(op.agentId);
        if (!deleted) {
          console.log(`[pending-sync] SKIP delete: agent ${op.agentId} not found (already deleted?)`);
          skipCount++;
          continue;
        }
        console.log(`[pending-sync] DELETED agent "${op.agentName || op.agentId}" (${op.agentId})`);
        successCount++;
      }
    } catch (error: any) {
      errorCount++;
      const errMsg = error?.message || error?.detail || String(error);
      console.error(`[pending-sync] ERROR on ${op.type} for ${op.agentId} ("${op.agentName}"): ${errMsg}`);
      if (error?.stack) {
        console.error(`[pending-sync] Stack: ${error.stack.split('\n').slice(0, 3).join(' | ')}`);
      }
    }
  }

  console.log(`[pending-sync] Done: ${successCount} succeeded, ${skipCount} skipped, ${errorCount} errors.`);
}
