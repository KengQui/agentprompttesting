/**
 * Base Component Templates
 * 
 * These templates provide a starting point for per-agent components.
 * Copy these to your agent's components folder and customize as needed.
 * 
 * Usage:
 *   1. Copy this folder to agents/{agent-id}/components/
 *   2. Customize the TurnManager keywords for your domain
 *   3. Define your FlowController steps
 *   4. Configure the Orchestrator with your agent's config
 */

export * from './types';
export * from './turn-manager';
export * from './state-manager';
export * from './flow-controller';
export * from './orchestrator';
