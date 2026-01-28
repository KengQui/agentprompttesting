/**
 * Orchestrator - SampleDataTestAgent_Ogg69Q
 * 
 * Coordinates all components for this agent.
 * Override handlers to customize behavior.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import { SampleDataTestAgentOgg69QTurnManager } from './turn-manager';
import { SampleDataTestAgentOgg69QFlowController } from './flow-controller';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class SampleDataTestAgentOgg69QOrchestrator extends BaseOrchestrator {
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

    this.turnManager = new SampleDataTestAgentOgg69QTurnManager();
    this.flowController = new SampleDataTestAgentOgg69QFlowController();
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

export function createOrchestrator(agentConfig: AgentConfig): SampleDataTestAgentOgg69QOrchestrator {
  return new SampleDataTestAgentOgg69QOrchestrator(agentConfig);
}
