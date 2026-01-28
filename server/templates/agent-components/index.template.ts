/**
 * {{AGENT_NAME}} Components
 * 
 * Custom components for this agent.
 * 
 * TEMPLATE NOTE: When adding new component exports,
 * update this template file so new agents automatically get those exports.
 */

export { {{CLASS_NAME}}TurnManager, createTurnManager } from './turn-manager';
export { {{CLASS_NAME}}FlowController, createFlowController } from './flow-controller';
export { {{CLASS_NAME}}Orchestrator, createOrchestrator } from './orchestrator';
