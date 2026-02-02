/**
 * Orchestrator - Personal SS
 * 
 * Coordinates all components for this agent.
 * Uses base Orchestrator's dynamic batching for validation-rules fields.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import type { AgentConfig } from '../../../server/components/types';

export class PersonalSSOrchestrator extends BaseOrchestrator {
  constructor(agentConfig: AgentConfig) {
    super({
      agentConfig,
      flowController: {
        steps: [],
        welcomeMessage: `Hello! I'm ${agentConfig.name}. ${agentConfig.businessUseCase}`,
        completionMessage: "Thanks for chatting! Let me know if you need anything else."
      }
    });
  }
}

export function createOrchestrator(agentConfig: AgentConfig): PersonalSSOrchestrator {
  return new PersonalSSOrchestrator(agentConfig);
}
