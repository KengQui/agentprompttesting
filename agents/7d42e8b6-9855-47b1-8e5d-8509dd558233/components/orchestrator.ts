/**
 * Orchestrator - Change address
 * 
 * Coordinates all components for this agent.
 * Uses hybrid approach: keyword-based navigation + LLM for all responses.
 * 
 * Navigation commands (go back, change answer, confirm/reject) use keywords.
 * All other inputs (questions, answers, off-topic) go to the LLM.
 */

import { 
  Orchestrator as BaseOrchestrator
} from '../../../server/components/orchestrator';
import { ChangeaddressTurnManager } from './turn-manager';
import { ChangeaddressFlowController } from './flow-controller';
import type { ClassificationResult, TurnResult, AgentConfig } from '../../../server/components/types';

export class ChangeaddressOrchestrator extends BaseOrchestrator {
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

    this.turnManager = new ChangeaddressTurnManager();
    this.flowController = new ChangeaddressFlowController();
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

  /**
   * Override: Send unclear inputs to LLM instead of showing fallback message.
   * This handles off-topic questions, general inquiries, and edge cases.
   */
  protected async handleUnclear(conversationId: string, userInput: string): Promise<TurnResult> {
    return {
      intent: 'unclear',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }

  /**
   * Override: Always use LLM for clarification requests.
   * This handles questions like "what are the tax implications?" or "can you summarize?"
   */
  protected async handleRequestClarification(
    conversationId: string, 
    classification: ClassificationResult,
    userInput: string
  ): Promise<TurnResult> {
    return {
      intent: 'request_clarification',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }
}

export function createOrchestrator(agentConfig: AgentConfig): ChangeaddressOrchestrator {
  return new ChangeaddressOrchestrator(agentConfig);
}
