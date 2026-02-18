import { db } from './server/db';
import { agentsTable, usersTable, agentComponentsTable, chatSessionsTable, chatMessagesTable, authSessionsTable, agentTracesTable, configSnapshotsTable, promptCoachHistoryTable } from './shared/schema';

async function main() {
  const prodUrl = process.argv[2];
  if (!prodUrl) {
    console.error('Usage: npx tsx sync-to-prod.ts <PRODUCTION_URL>');
    console.error('Example: npx tsx sync-to-prod.ts https://your-app.replit.app');
    process.exit(1);
  }

  console.log('Reading dev data...');
  const allUsers = await db.select().from(usersTable);
  const allAgents = await db.select().from(agentsTable);
  const allComponents = await db.select().from(agentComponentsTable);
  const allSessions = await db.select().from(chatSessionsTable);
  const allMessages = await db.select().from(chatMessagesTable);
  const allAuth = await db.select().from(authSessionsTable);
  const allTraces = await db.select().from(agentTracesTable);
  const allSnapshots = await db.select().from(configSnapshotsTable);
  const allCoach = await db.select().from(promptCoachHistoryTable);

  console.log(`Dev data: ${allUsers.length} users, ${allAgents.length} agents, ${allComponents.length} components, ${allSessions.length} sessions, ${allMessages.length} messages`);

  const payload = {
    users: allUsers,
    agents: allAgents,
    components: allComponents,
    authSessions: allAuth,
    chatSessions: allSessions,
    chatMessages: allMessages,
    traces: allTraces,
    snapshots: allSnapshots,
    coachHistory: allCoach,
  };

  const syncUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/sync-data`;
  console.log(`Syncing to: ${syncUrl}`);

  const response = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Key': 'temp-sync-2026',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (response.ok) {
    console.log('Sync successful!', result);
  } else {
    console.error('Sync failed:', result);
  }

  process.exit(0);
}

main().catch(e => { console.error('Sync failed:', e); process.exit(1); });
