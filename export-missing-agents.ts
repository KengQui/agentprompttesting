import { db } from './server/db';
import { agentsTable, agentComponentsTable } from './shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function exportAgentAsFiles(agentId: string) {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { console.error('Agent not found:', agentId); return; }
  
  const dir = path.join('./agents', agentId);
  fs.mkdirSync(dir, { recursive: true });

  const metaYaml = [
    `name: ${agent.name}`,
    `description: ${agent.description || ''}`,
    `status: ${agent.status || 'configured'}`,
    `promptStyle: ${agent.promptStyle || 'gemini'}`,
    `mockMode: ${agent.mockMode || 'full'}`,
    `userId: ${agent.userId || ''}`,
    `createdAt: ${agent.createdAt || new Date().toISOString()}`,
    `updatedAt: ${agent.updatedAt || new Date().toISOString()}`,
    agent.promptGeneratedAt ? `promptGeneratedAt: ${agent.promptGeneratedAt}` : '',
    agent.lastConfigUpdate ? `lastConfigUpdate: ${agent.lastConfigUpdate}` : '',
    agent.promptLastRevisedBy ? `promptLastRevisedBy: ${agent.promptLastRevisedBy}` : '',
    agent.promptLastRevisedAt ? `promptLastRevisedAt: ${agent.promptLastRevisedAt}` : '',
    agent.configFieldsHash ? `configFieldsHash: ${agent.configFieldsHash}` : '',
  ].filter(Boolean).join('\n');
  
  fs.writeFileSync(path.join(dir, 'meta.yaml'), metaYaml);
  
  if (agent.businessUseCase) fs.writeFileSync(path.join(dir, 'business-use-case.md'), agent.businessUseCase);
  if (agent.domainKnowledge) fs.writeFileSync(path.join(dir, 'domain-knowledge.md'), agent.domainKnowledge);
  if (agent.validationRules) fs.writeFileSync(path.join(dir, 'validation-rules.yaml'), agent.validationRules);
  if (agent.guardrails) fs.writeFileSync(path.join(dir, 'guardrails.yaml'), agent.guardrails);
  if (agent.customPrompt) fs.writeFileSync(path.join(dir, 'custom-prompt.md'), agent.customPrompt);
  
  if (agent.domainDocuments && (agent.domainDocuments as any[]).length > 0)
    fs.writeFileSync(path.join(dir, 'domain-documents.json'), JSON.stringify(agent.domainDocuments, null, 2));
  if (agent.sampleDatasets && (agent.sampleDatasets as any[]).length > 0)
    fs.writeFileSync(path.join(dir, 'sample-data.json'), JSON.stringify(agent.sampleDatasets, null, 2));
  if (agent.clarifyingInsights && (agent.clarifyingInsights as any[]).length > 0)
    fs.writeFileSync(path.join(dir, 'clarifying-insights.json'), JSON.stringify(agent.clarifyingInsights, null, 2));
  if (agent.availableActions && (agent.availableActions as any[]).length > 0)
    fs.writeFileSync(path.join(dir, 'available-actions.json'), JSON.stringify(agent.availableActions, null, 2));
  if (agent.mockUserState && (agent.mockUserState as any[]).length > 0)
    fs.writeFileSync(path.join(dir, 'mock-user-state.json'), JSON.stringify(agent.mockUserState, null, 2));
  if (agent.welcomeConfig)
    fs.writeFileSync(path.join(dir, 'welcome-config.json'), JSON.stringify(agent.welcomeConfig, null, 2));
  
  const components = await db.select().from(agentComponentsTable).where(eq(agentComponentsTable.agentId, agentId));
  if (components.length > 0) {
    const compDir = path.join(dir, 'components');
    fs.mkdirSync(compDir, { recursive: true });
    for (const comp of components) {
      fs.writeFileSync(path.join(compDir, comp.fileName), comp.code);
    }
  }
  
  console.log('Exported:', agentId, agent.name, '- components:', components.length);
}

async function main() {
  const allAgents = await db.select({ id: agentsTable.id, name: agentsTable.name }).from(agentsTable);
  const existingDirs = new Set(fs.readdirSync('./agents').filter(d => {
    return fs.statSync(path.join('./agents', d)).isDirectory();
  }));
  
  for (const agent of allAgents) {
    if (!existingDirs.has(agent.id)) {
      console.log(`Missing directory for agent: ${agent.id} (${agent.name}), exporting...`);
      await exportAgentAsFiles(agent.id);
    } else {
      const metaPath = path.join('./agents', agent.id, 'meta.yaml');
      if (!fs.existsSync(metaPath)) {
        console.log(`Missing meta.yaml for agent: ${agent.id} (${agent.name}), re-exporting...`);
        await exportAgentAsFiles(agent.id);
      }
    }
  }
  
  console.log(`All ${allAgents.length} agents verified on disk.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
