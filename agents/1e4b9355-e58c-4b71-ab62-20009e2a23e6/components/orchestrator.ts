/**
 * Orchestrator - Helper Bot
 * 
 * Coordinates all components for the Helper Bot agent.
 * 
 * This orchestrator is customized for open-ended customer support,
 * allowing flexible conversation flow rather than strict step progression.
 */

import { 
  Orchestrator as BaseOrchestrator, 
  OrchestratorConfig 
} from '../../../server/components/orchestrator';
import { HelperBotTurnManager } from './turn-manager';
import { HelperBotFlowController } from './flow-controller';
import { StateManager } from '../../../server/components/state-manager';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class HelperBotOrchestrator extends BaseOrchestrator {
  constructor(agentConfig: AgentConfig) {
    super({
      agentConfig,
      flowController: {
        steps: [
          {
            id: 'greeting',
            question: "What can I help you with today?",
            field: 'initial_request',
            type: 'text',
            helpText: 'Describe your question or issue.'
          }
        ],
        welcomeMessage: `Hello! I'm ${agentConfig.name}. ${agentConfig.businessUseCase}`,
        completionMessage: "Thanks for chatting! Let me know if you need anything else."
      }
    });

    this.turnManager = new HelperBotTurnManager();
    this.flowController = new HelperBotFlowController();
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

  protected async handleRequestClarification(
    conversationId: string, 
    classification: ClassificationResult
  ): Promise<TurnResult> {
    return {
      intent: 'request_clarification',
      response: classification.clarificationTopic || 'general',
      nextAction: 'generate_ai_response'
    };
  }
}

export function createOrchestrator(agentConfig: AgentConfig): HelperBotOrchestrator {
  return new HelperBotOrchestrator(agentConfig);
}
