/**
 * Agent Loader
 * 
 * Dynamically loads per-agent components if they exist.
 * Falls back to base components if no custom components are defined.
 * 
 * Note: This uses tsx runtime for dynamic TS imports. For production builds,
 * agent components should be pre-compiled or bundled.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Orchestrator, createOrchestrator } from './components/orchestrator';
import type { AgentConfig } from './components/types';

const agentsDir = path.join(process.cwd(), 'agents');

interface AgentComponents {
  orchestrator: Orchestrator;
  hasCustomComponents: boolean;
}

const loadedOrchestrators = new Map<string, AgentComponents>();

export async function loadAgentComponents(agentId: string, agentConfig: AgentConfig): Promise<AgentComponents> {
  if (loadedOrchestrators.has(agentId)) {
    return loadedOrchestrators.get(agentId)!;
  }

  const agentComponentsPath = path.join(agentsDir, agentId, 'components');
  const orchestratorPath = path.join(agentComponentsPath, 'orchestrator.ts');

  let orchestrator: Orchestrator;
  let hasCustomComponents = false;

  if (fs.existsSync(orchestratorPath)) {
    try {
      // Use file:// URL for dynamic imports (works with tsx runtime)
      const indexPath = path.join(agentComponentsPath, 'index.ts');
      const moduleUrl = `file://${indexPath}`;
      
      const agentModule = await import(moduleUrl);
      if (agentModule.createOrchestrator) {
        orchestrator = agentModule.createOrchestrator(agentConfig);
        hasCustomComponents = true;
        console.log(`[agent-loader] Loaded custom orchestrator for agent ${agentId}`);
      } else {
        orchestrator = createOrchestrator({ agentConfig });
        console.log(`[agent-loader] Using base orchestrator for agent ${agentId} (no createOrchestrator found)`);
      }
    } catch (error) {
      console.error(`[agent-loader] Error loading custom components for agent ${agentId}:`, error);
      orchestrator = createOrchestrator({ agentConfig });
    }
  } else {
    orchestrator = createOrchestrator({ agentConfig });
    console.log(`[agent-loader] Using base orchestrator for agent ${agentId} (no components folder)`);
  }

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

export function hasCustomComponents(agentId: string): boolean {
  const agentComponentsPath = path.join(agentsDir, agentId, 'components', 'orchestrator.ts');
  return fs.existsSync(agentComponentsPath);
}
