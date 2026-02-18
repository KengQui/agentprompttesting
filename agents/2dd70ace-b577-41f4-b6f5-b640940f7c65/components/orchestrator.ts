/**
 * Orchestrator - Copy of Custom Column Expression Builder
 * 
 * Coordinates all components for this agent.
 * Override handlers to customize behavior.
 * 
 * TEMPLATE NOTE: When adding new features to agent orchestration,
 * update this template file so new agents automatically get those features.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import { CopyofCustomColumnExpressionBuilderTurnManager } from './turn-manager';
import { CopyofCustomColumnExpressionBuilderFlowController } from './flow-controller';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class CopyofCustomColumnExpressionBuilderOrchestrator extends BaseOrchestrator {
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

    this.turnManager = new CopyofCustomColumnExpressionBuilderTurnManager();
    this.flowController = new CopyofCustomColumnExpressionBuilderFlowController();
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

export function createOrchestrator(agentConfig: AgentConfig): CopyofCustomColumnExpressionBuilderOrchestrator {
  return new CopyofCustomColumnExpressionBuilderOrchestrator(agentConfig);
}
