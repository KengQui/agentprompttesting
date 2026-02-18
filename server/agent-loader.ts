import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { agentComponentsTable } from '@shared/schema';
import { Orchestrator, createOrchestrator } from './components/orchestrator';
import type { AgentConfig } from './components/types';

interface AgentComponents {
  orchestrator: Orchestrator;
  hasCustomComponents: boolean;
}

const loadedOrchestrators = new Map<string, AgentComponents>();

export async function loadAgentComponents(agentId: string, agentConfig: AgentConfig): Promise<AgentComponents> {
  if (loadedOrchestrators.has(agentId)) {
    return loadedOrchestrators.get(agentId)!;
  }

  let orchestrator: Orchestrator;
  let hasCustomComponents = false;

  try {
    const componentRows = await db.select().from(agentComponentsTable)
      .where(eq(agentComponentsTable.agentId, agentId));

    if (componentRows.length > 0) {
      const orchestratorRow = componentRows.find(r => r.fileName === 'orchestrator.ts');
      const indexRow = componentRows.find(r => r.fileName === 'index.ts');

      if (indexRow) {
        const tmpDir = path.join(os.tmpdir(), 'agent-components', agentId);
        fs.mkdirSync(tmpDir, { recursive: true });

        const serverDir = path.resolve(process.cwd(), 'server');
        for (const row of componentRows) {
          let code = row.code;
          code = code.replace(
            /from\s+['"]\.\.\/\.\.\/\.\.\/server\/components\/(.*?)['"]/g,
            `from '${serverDir}/components/$1'`
          );
          code = code.replace(
            /require\s*\(\s*['"]\.\.\/\.\.\/\.\.\/server\/components\/(.*?)['"]\s*\)/g,
            `require('${serverDir}/components/$1')`
          );
          fs.writeFileSync(path.join(tmpDir, row.fileName), code, 'utf-8');
        }

        const indexPath = path.join(tmpDir, 'index.ts');
        const moduleUrl = `file://${indexPath}`;

        try {
          const agentModule = await import(moduleUrl);
          if (agentModule.createOrchestrator) {
            orchestrator = agentModule.createOrchestrator(agentConfig);
            hasCustomComponents = true;
            console.log(`[agent-loader] Loaded custom orchestrator for agent ${agentId} from DB`);
          } else {
            orchestrator = createOrchestrator({ agentConfig });
            console.log(`[agent-loader] Using base orchestrator for agent ${agentId} (no createOrchestrator in DB components)`);
          }
        } catch (importError) {
          console.error(`[agent-loader] Error importing components for agent ${agentId}:`, importError);
          orchestrator = createOrchestrator({ agentConfig });
        }
      } else {
        orchestrator = createOrchestrator({ agentConfig });
        console.log(`[agent-loader] Using base orchestrator for agent ${agentId} (no index.ts in DB)`);
      }
    } else {
      orchestrator = createOrchestrator({ agentConfig });
      console.log(`[agent-loader] Using base orchestrator for agent ${agentId} (no components in DB)`);
    }
  } catch (error) {
    console.error(`[agent-loader] Error loading components for agent ${agentId}:`, error);
    orchestrator = createOrchestrator({ agentConfig });
  }

  await orchestrator.initFlowMode();

  const components = { orchestrator, hasCustomComponents };
  loadedOrchestrators.set(agentId, components);
  return components;
}

export function clearAgentCache(agentId?: string): void {
  if (agentId) {
    loadedOrchestrators.delete(agentId);
  } else {
    loadedOrchestrators.clear();
  }
}

export async function hasCustomComponents(agentId: string): Promise<boolean> {
  const rows = await db.select().from(agentComponentsTable)
    .where(and(
      eq(agentComponentsTable.agentId, agentId),
      eq(agentComponentsTable.fileName, 'orchestrator.ts')
    ))
    .limit(1);
  return rows.length > 0;
}
