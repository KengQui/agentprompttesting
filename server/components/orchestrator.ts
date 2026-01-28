/**
 * Orchestrator - Base Template
 * 
 * RESPONSIBILITY:
 * - Coordinate all components (TurnManager, StateManager, FlowController)
 * - Process user turns end-to-end
 * - Generate appropriate responses
 * - Handle errors gracefully
 * 
 * CUSTOMIZATION:
 * - Override intent handlers for custom behavior
 * - Add domain-specific response generation
 * - Implement custom error recovery
 */

import { TurnManager, TurnManagerConfig } from './turn-manager';
import { StateManager, StateManagerConfig } from './state-manager';
import { FlowController, FlowControllerConfig, FlowStep } from './flow-controller';
import type { 
  ClassificationResult, 
  ConversationContext, 
  TurnResult,
  AgentConfig 
} from './types';

export interface OrchestratorConfig {
  turnManager?: TurnManagerConfig;
  stateManager?: StateManagerConfig;
  flowController?: FlowControllerConfig;
  agentConfig?: AgentConfig;
}

export class Orchestrator {
  protected turnManager: TurnManager;
  protected stateManager: StateManager;
  protected flowController: FlowController;
  protected agentConfig: AgentConfig;

  constructor(config: OrchestratorConfig = {}) {
    this.turnManager = new TurnManager(config.turnManager);
    
    const flowSteps = config.flowController?.steps?.map(s => s.id) ?? [];
    this.stateManager = new StateManager({
      ...config.stateManager,
      flowSteps
    });
    
    this.flowController = new FlowController(config.flowController);
    
    this.agentConfig = config.agentConfig ?? {
      name: 'Assistant',
      businessUseCase: 'General assistance',
      description: 'A helpful assistant'
    };
  }

  protected buildContext(conversationId: string): ConversationContext {
    const state = this.stateManager.getOrCreateState(conversationId);
    const currentStep = this.flowController.getStep(state.currentStep);
    const previousStep = this.flowController.getPreviousStep(state.currentStep, state);

    return {
      currentQuestion: currentStep?.question,
      previousQuestion: previousStep?.question,
      previousAnswer: state.lastAnswer,
      awaitingConfirmation: state.awaitingConfirmation,
      pendingSuggestion: state.pendingSuggestion
    };
  }

  protected async handleAnswerQuestion(
    conversationId: string, 
    classification: ClassificationResult, 
    userInput: string
  ): Promise<TurnResult> {
    const state = this.stateManager.getOrCreateState(conversationId);
    const currentStep = this.flowController.getStep(state.currentStep);

    if (!currentStep) {
      if (this.stateManager.isFlowComplete(conversationId)) {
        return this.handleFulfillment(conversationId, userInput);
      }
      return {
        intent: 'answer_question',
        response: this.flowController.getCompletionMessage()
      };
    }

    const value = classification.extractedValue || userInput.trim();
    
    if (!this.flowController.validateAnswer(currentStep, value)) {
      return {
        intent: 'answer_question',
        response: `That doesn't seem right. ${currentStep.helpText || 'Please try again.'}`
      };
    }

    this.stateManager.setAnswer(conversationId, currentStep.field, value);
    this.stateManager.completeStep(conversationId, currentStep.id);

    const updatedState = this.stateManager.getState(conversationId)!;
    const nextStep = this.flowController.getNextStep(currentStep.id, updatedState);

    if (nextStep) {
      this.stateManager.updateState(conversationId, { lastQuestion: nextStep.question });
      return {
        intent: 'answer_question',
        response: `Got it! ${this.flowController.generateQuestion(nextStep)}`,
        nextAction: 'continue'
      };
    }

    this.stateManager.markFlowComplete(conversationId);
    
    const originalIntent = this.stateManager.getOriginalIntent(conversationId);
    
    if (this.flowController.hasFulfillment()) {
      const fulfillmentResponse = this.flowController.generateFulfillmentResponse(updatedState, originalIntent);
      return {
        intent: 'answer_question',
        response: fulfillmentResponse
      };
    }
    
    return {
      intent: 'answer_question',
      response: originalIntent || userInput,
      nextAction: 'generate_ai_response'
    };
  }

  protected async handleFulfillment(conversationId: string, userInput: string): Promise<TurnResult> {
    const state = this.stateManager.getState(conversationId);
    if (!state) {
      return {
        intent: 'answer_question',
        response: "I'm sorry, I couldn't find your conversation. Please start again."
      };
    }

    if (this.flowController.hasFulfillment()) {
      const fulfillmentResponse = this.flowController.generateFulfillmentResponse(state, state.originalIntent);
      return {
        intent: 'answer_question',
        response: fulfillmentResponse
      };
    }
    
    return {
      intent: 'answer_question',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }

  protected async handleGoBack(conversationId: string, classification: ClassificationResult): Promise<TurnResult> {
    const state = this.stateManager.getState(conversationId);
    if (!state) {
      return {
        intent: 'go_back',
        response: "There's nothing to go back to yet."
      };
    }

    const previousStep = this.flowController.getPreviousStep(state.currentStep, state);
    if (!previousStep) {
      return {
        intent: 'go_back',
        response: "You're already at the beginning. There's no previous step to go back to."
      };
    }

    this.stateManager.goBackToStep(conversationId, previousStep.id);
    const previousAnswer = state.answers[previousStep.field];
    
    let response = `Going back to the previous question.\n\n${this.flowController.generateQuestion(previousStep)}`;
    if (previousAnswer) {
      response += `\n\n(Your previous answer was: ${previousAnswer})`;
    }

    return {
      intent: 'go_back',
      response
    };
  }

  protected async handleChangePreviousAnswer(
    conversationId: string, 
    classification: ClassificationResult,
    userInput: string
  ): Promise<TurnResult> {
    const state = this.stateManager.getState(conversationId);
    if (!state) {
      return {
        intent: 'change_previous_answer',
        response: "There are no previous answers to change."
      };
    }

    if (classification.proposedChange) {
      const { field, newValue } = classification.proposedChange;
      const step = this.flowController.getStepByField(field);
      
      if (step) {
        this.stateManager.setAnswer(conversationId, field, newValue);
        return {
          intent: 'change_previous_answer',
          response: `Updated ${field} to "${newValue}". Is there anything else you'd like to change?`
        };
      }
    }

    const summary = this.flowController.getSummary(state);
    return {
      intent: 'change_previous_answer',
      response: `Which answer would you like to change?\n\n${summary}`
    };
  }

  protected async handleRequestClarification(
    conversationId: string, 
    classification: ClassificationResult,
    userInput: string
  ): Promise<TurnResult> {
    const state = this.stateManager.getOrCreateState(conversationId);
    const currentStep = this.flowController.getStep(state.currentStep);

    if (currentStep) {
      const clarification = this.flowController.generateClarification(
        currentStep, 
        classification.clarificationTopic || ''
      );
      return {
        intent: 'request_clarification',
        response: clarification
      };
    }

    if (this.stateManager.isFlowComplete(conversationId)) {
      return {
        intent: 'request_clarification',
        response: userInput,
        nextAction: 'generate_ai_response'
      };
    }

    return {
      intent: 'request_clarification',
      response: userInput,
      nextAction: 'generate_ai_response'
    };
  }

  protected async handleConfirm(conversationId: string, classification: ClassificationResult): Promise<TurnResult> {
    this.stateManager.clearAwaitingConfirmation(conversationId);
    
    return {
      intent: 'confirm',
      response: "Great, confirmed! Let's continue.",
      nextAction: 'continue'
    };
  }

  protected async handleReject(conversationId: string, classification: ClassificationResult): Promise<TurnResult> {
    this.stateManager.clearAwaitingConfirmation(conversationId);
    
    return {
      intent: 'reject',
      response: "No problem. What would you like to do instead?",
      nextAction: 'await_input'
    };
  }

  protected async handleUnclear(conversationId: string, userInput: string): Promise<TurnResult> {
    const state = this.stateManager.getOrCreateState(conversationId);
    const currentStep = this.flowController.getStep(state.currentStep);

    if (this.stateManager.isFlowComplete(conversationId)) {
      return {
        intent: 'unclear',
        response: userInput,
        nextAction: 'generate_ai_response'
      };
    }

    let response = "I'm not sure I understood that. ";
    
    if (currentStep) {
      response += `Let me repeat the question: ${this.flowController.generateQuestion(currentStep)}`;
    } else {
      response += "Could you please rephrase what you'd like to do?";
    }

    response += '\n\nYou can say things like:\n- "go back" to return to the previous question\n- "change [field]" to update a previous answer\n- "help" if you need clarification';

    return {
      intent: 'unclear',
      response
    };
  }

  async processTurn(conversationId: string, userInput: string): Promise<TurnResult> {
    try {
      const state = this.stateManager.getOrCreateState(conversationId);
      
      if (!state.originalIntent && userInput.trim()) {
        this.stateManager.setOriginalIntent(conversationId, userInput.trim());
      }
      
      const context = this.buildContext(conversationId);
      const classification = await this.turnManager.classifyIntent(userInput, context);

      switch (classification.intent) {
        case 'answer_question':
          return this.handleAnswerQuestion(conversationId, classification, userInput);
        
        case 'go_back':
          return this.handleGoBack(conversationId, classification);
        
        case 'change_previous_answer':
          return this.handleChangePreviousAnswer(conversationId, classification, userInput);
        
        case 'request_clarification':
          return this.handleRequestClarification(conversationId, classification, userInput);
        
        case 'confirm':
          return this.handleConfirm(conversationId, classification);
        
        case 'reject':
          return this.handleReject(conversationId, classification);
        
        case 'unclear':
        case 'error':
        default:
          return this.handleUnclear(conversationId, userInput);
      }
    } catch (error: any) {
      console.error('Orchestrator error:', error);
      return {
        intent: 'error',
        response: "I encountered an error processing your message. Please try again."
      };
    }
  }

  getWelcomeMessage(conversationId: string): string {
    const state = this.stateManager.getOrCreateState(conversationId);
    const firstStep = this.flowController.getSteps()[0];

    let message = this.flowController.getWelcomeMessage();
    
    if (firstStep) {
      message += '\n\n' + this.flowController.generateQuestion(firstStep);
    }

    return message;
  }

  getState(conversationId: string) {
    return this.stateManager.getState(conversationId);
  }

  resetConversation(conversationId: string): void {
    this.stateManager.deleteConversation(conversationId);
  }
}

export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
