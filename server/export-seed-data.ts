import { db } from "./db";
import { usersTable, agentsTable, agentComponentsTable, chatSessionsTable, chatMessagesTable, agentTracesTable, configSnapshotsTable, promptCoachHistoryTable } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import bcrypt from "bcryptjs";

const ADMIN_USERNAME = "kengqui.chia@ukg.com";
const DEFAULT_PASSWORD = "welcome123";

async function exportSeedData() {
  console.log("[export-seed] Starting data export for", ADMIN_USERNAME);

  const users = await db.select().from(usersTable).where(eq(usersTable.username, ADMIN_USERNAME));
  if (users.length === 0) {
    console.error("[export-seed] User not found!");
    process.exit(1);
  }
  const user = users[0];
  const userId = user.id;

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const agents = await db.select().from(agentsTable).where(eq(agentsTable.userId, userId));
  const agentIds = agents.map(a => a.id);

  const components = agentIds.length > 0
    ? await db.select().from(agentComponentsTable).where(inArray(agentComponentsTable.agentId, agentIds))
    : [];

  const sessions = agentIds.length > 0
    ? await db.select().from(chatSessionsTable).where(inArray(chatSessionsTable.agentId, agentIds))
    : [];

  const sessionIds = sessions.map(s => s.id);
  const messages = sessionIds.length > 0
    ? await db.select().from(chatMessagesTable).where(inArray(chatMessagesTable.sessionId, sessionIds))
    : [];

  const traces = agentIds.length > 0
    ? await db.select().from(agentTracesTable).where(inArray(agentTracesTable.agentId, agentIds))
    : [];

  const snapshots = agentIds.length > 0
    ? await db.select().from(configSnapshotsTable).where(inArray(configSnapshotsTable.agentId, agentIds))
    : [];

  const coachHistory = agentIds.length > 0
    ? await db.select().from(promptCoachHistoryTable).where(inArray(promptCoachHistoryTable.agentId, agentIds))
    : [];

  const seedData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    ownerUsername: ADMIN_USERNAME,
    defaultPassword: DEFAULT_PASSWORD,
    user: {
      id: user.id,
      username: user.username,
      password: hashedPassword,
      createdAt: user.createdAt,
    },
    counts: {
      agents: agents.length,
      components: components.length,
      sessions: sessions.length,
      messages: messages.length,
      traces: traces.length,
      snapshots: snapshots.length,
      coachHistory: coachHistory.length,
    },
    data: {
      agents,
      components,
      sessions,
      messages,
      traces,
      snapshots,
      coachHistory,
    },
  };

  const outPath = path.join(process.cwd(), "seed-data.json");
  fs.writeFileSync(outPath, JSON.stringify(seedData, null, 2));
  console.log(`[export-seed] Exported to ${outPath}`);
  console.log(`[export-seed] Counts:`, seedData.counts);
  console.log(`[export-seed] Default password for imported account: ${DEFAULT_PASSWORD}`);
  process.exit(0);
}

exportSeedData().catch(err => {
  console.error("[export-seed] Fatal error:", err);
  process.exit(1);
});
