import { db } from './server/db';
import { agentsTable, usersTable, agentComponentsTable, chatSessionsTable, chatMessagesTable, authSessionsTable, agentTracesTable, configSnapshotsTable, promptCoachHistoryTable } from './shared/schema';
import * as fs from 'fs';

function escapeStr(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildInserts(tableName: string, rows: any[], batchSize: number = 50): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  let sql = '';
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const lines = batch.map(row => {
      const vals = cols.map(c => escapeStr(row[c]));
      return `(${vals.join(', ')})`;
    });
    sql += `INSERT INTO ${tableName} (${cols.map(c => `"${c}"`).join(', ')}) VALUES\n${lines.join(',\n')};\n\n`;
  }
  return sql;
}

async function main() {
  const allUsers = await db.select().from(usersTable);
  const allAgents = await db.select().from(agentsTable);
  const allComponents = await db.select().from(agentComponentsTable);
  const allSessions = await db.select().from(chatSessionsTable);
  const allMessages = await db.select().from(chatMessagesTable);
  const allAuth = await db.select().from(authSessionsTable);
  const allTraces = await db.select().from(agentTracesTable);
  const allSnapshots = await db.select().from(configSnapshotsTable);
  const allCoach = await db.select().from(promptCoachHistoryTable);

  let sql = '-- Dev DB export\n';

  sql += 'DELETE FROM prompt_coach_history;\n';
  sql += 'DELETE FROM config_snapshots;\n';
  sql += 'DELETE FROM agent_traces;\n';
  sql += 'DELETE FROM chat_messages;\n';
  sql += 'DELETE FROM chat_sessions;\n';
  sql += 'DELETE FROM agent_components;\n';
  sql += 'DELETE FROM auth_sessions;\n';
  sql += 'DELETE FROM agents;\n';
  sql += 'DELETE FROM users;\n\n';

  sql += buildInserts('users', allUsers);
  sql += buildInserts('agents', allAgents);
  sql += buildInserts('agent_components', allComponents);
  sql += buildInserts('auth_sessions', allAuth);
  sql += buildInserts('chat_sessions', allSessions);
  sql += buildInserts('chat_messages', allMessages, 25);
  sql += buildInserts('agent_traces', allTraces);
  sql += buildInserts('config_snapshots', allSnapshots);
  sql += buildInserts('prompt_coach_history', allCoach);

  fs.writeFileSync('/tmp/dev-data-export.sql', sql);
  console.log(`Exported: ${allUsers.length} users, ${allAgents.length} agents, ${allComponents.length} components, ${allSessions.length} sessions, ${allMessages.length} messages, ${allAuth.length} auth sessions, ${allTraces.length} traces, ${allSnapshots.length} snapshots, ${allCoach.length} coach history`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
