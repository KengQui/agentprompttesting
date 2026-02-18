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

function resolvePackageEsmPath(pkg: string): string | null {
  try {
    const nodeModulesDir = path.resolve(process.cwd(), 'node_modules');
    const pkgDir = path.join(nodeModulesDir, ...pkg.split('/'));
    const pkgJsonPath = path.join(pkgDir, 'package.json');

    if (!fs.existsSync(pkgJsonPath)) return null;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const exports = pkgJson?.exports?.['.'];

    let esmPath: string | undefined;
    if (exports) {
      if (typeof exports === 'string') {
        esmPath = exports;
      } else if (typeof exports?.node?.import === 'string') {
        esmPath = exports.node.import;
      } else if (typeof exports?.import === 'string') {
        esmPath = exports.import;
      } else if (typeof exports?.default === 'string') {
        esmPath = exports.default;
      }
    }
    if (!esmPath && typeof pkgJson?.module === 'string') {
      esmPath = pkgJson.module;
    }
    if (!esmPath && typeof pkgJson?.main === 'string') {
      esmPath = pkgJson.main;
    }

    if (esmPath) {
      return 'file://' + path.resolve(pkgDir, esmPath);
    }
    return null;
  } catch {
    return null;
  }
}

async function bundleAgentComponents(tmpDir: string, agentId: string): Promise<string> {
  const entryPoint = path.join(tmpDir, 'index.ts');
  const outFile = path.join(tmpDir, `bundle_${Date.now()}.mjs`);
  const nodeModulesDir = path.resolve(process.cwd(), 'node_modules');

  const externalPackages = [
    '@google/genai',
    'drizzle-orm',
    'openai',
  ];

  const { build } = await import('esbuild');

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    outfile: outFile,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    nodePaths: [nodeModulesDir],
    external: externalPackages,
    logLevel: 'silent',
  });

  let bundleCode = fs.readFileSync(outFile, 'utf-8');
  for (const pkg of externalPackages) {
    const absPath = resolvePackageEsmPath(pkg);
    if (absPath) {
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      bundleCode = bundleCode.replace(
        new RegExp(`from\\s+"${escaped}"`, 'g'),
        `from "${absPath}"`
      );
      bundleCode = bundleCode.replace(
        new RegExp(`from\\s+'${escaped}'`, 'g'),
        `from '${absPath}'`
      );
    }
  }
  fs.writeFileSync(outFile, bundleCode, 'utf-8');

  return outFile;
}

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

        try {
          const bundlePath = await bundleAgentComponents(tmpDir, agentId);
          const moduleUrl = `file://${bundlePath}`;
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
