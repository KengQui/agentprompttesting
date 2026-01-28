/**
 * Orchestrator - MultiFile Test Agent ypCl2E
 * 
 * Coordinates all components for this agent.
 * Override handlers to customize behavior.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import { MultiFileTestAgentypCl2ETurnManager } from './turn-manager';
import { MultiFileTestAgentypCl2EFlowController } from './flow-controller';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class MultiFileTestAgentypCl2EOrchestrator extends BaseOrchestrator {
  constructor(agentConfig: AgentConfig) {
    super({
      agentConfig,
      flowController: {
        steps: [
          {
            id: 'greeting',
            question: "What can I help you with today?",
            field: 'initial_request',
            type: 'text'
          }
        ],
        welcomeMessage: `Hello! I'm ${agentConfig.name}. ${agentConfig.businessUseCase}`,
        completionMessage: "Thanks for chatting! Let me know if you need anything else."
      }
    });

    this.turnManager = new MultiFileTestAgentypCl2ETurnManager();
    this.flowController = new MultiFileTestAgentypCl2EFlowController();
  }

  protected async handleAnswerQuestion(
    conversationId: string, 
    classification: ClassificationResult, 
    userInput: string
  ): Promise<TurnResult> {
    return {
      intent: 'answer_question',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }
}

export function createOrchestrator(agentConfig: AgentConfig): MultiFileTestAgentypCl2EOrchestrator {
  return new MultiFileTestAgentypCl2EOrchestrator(agentConfig);
}
