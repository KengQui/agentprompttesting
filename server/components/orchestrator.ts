/**
 * Orchestrator - Base Template
 * 
 * RESPONSIBILITY:
 * - Coordinate all components (TurnManager, StateManager, FlowController)
 * - Process user turns end-to-end
 * - Generate appropriate responses
 * - Handle errors gracefully
 * - BATCH questions (2-3 per turn) for natural conversation flow
 * - Generate confirmation summary when all required info collected
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
  AgentConfig,
  ChatHistoryItem,
  RequiredField,
  ConversationState
} from './types';

export interface OrchestratorConfig {
  turnManager?: TurnManagerConfig;
  stateManager?: StateManagerConfig;
  flowController?: FlowControllerConfig;
  agentConfig?: AgentConfig;
  batchSize?: number;
}

interface FieldBatch {
  fields: RequiredField[];
  batchIndex: number;
  totalBatches: number;
}

export class Orchestrator {
  protected turnManager: TurnManager;
  protected stateManager: StateManager;
  protected flowController: FlowController;
  protected agentConfig: AgentConfig;
  protected batchSize: number;
  protected dynamicFields: RequiredField[];

  constructor(config: OrchestratorConfig = {}) {
    this.turnManager = new TurnManager(config.turnManager);
    this.batchSize = config.batchSize ?? 3;
    this.dynamicFields = [];

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

    if (this.agentConfig.validationRules) {
      this.dynamicFields = this.parseValidationRules(this.agentConfig.validationRules);
    }
  }

  protected parseValidationRules(validationRules: string): RequiredField[] {
    const fields: RequiredField[] = [];
    
    console.log('[Orchestrator] parseValidationRules called, input length:', validationRules?.length || 0);
    
    const requiredInfoMatch = validationRules.match(/### 1\. Required Information[\s\S]*?(?=###|$)/i);
    console.log('[Orchestrator] Section match found:', !!requiredInfoMatch);
    
    if (!requiredInfoMatch) {
      console.log('[Orchestrator] Using fallback regex (no section header)');
      const bulletMatches = validationRules.matchAll(/\*\*([^*]+)\*\*:?\s*([^*\n]+)?/g);
      for (const match of bulletMatches) {
        const name = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        const label = match[1].trim();
        fields.push({
          name,
          label,
          type: this.inferFieldType(name, label),
          required: true
        });
      }
      console.log('[Orchestrator] Fallback extracted fields:', fields.length);
      return fields;
    }

    const section = requiredInfoMatch[0];
    console.log('[Orchestrator] Parsing section, length:', section.length);
    const bulletMatches = section.matchAll(/\*\s*\*\*([^*]+)\*\*:?\s*([^*\n]+)?/g);
    
    for (const match of bulletMatches) {
      const name = match[1].trim().toLowerCase().replace(/\s+/g, '_');
      const label = match[1].trim();
      const description = match[2]?.trim() || '';
      
      fields.push({
        name,
        label,
        type: this.inferFieldType(name, description),
        required: true
      });
    }

    console.log('[Orchestrator] Extracted fields:', fields.length, fields.map(f => f.name));
    return fields;
  }

  protected inferFieldType(name: string, context: string): 'text' | 'date' | 'choice' | 'number' {
    const nameLower = name.toLowerCase();
    const contextLower = context.toLowerCase();
    
    if (nameLower.includes('date') || contextLower.includes('date')) {
      return 'date';
    }
    if (nameLower.includes('type') || nameLower.includes('event') || contextLower.includes('type of')) {
      return 'choice';
    }
    if (nameLower.includes('number') || nameLower.includes('amount') || nameLower.includes('count')) {
      return 'number';
    }
    return 'text';
  }

  protected hasFlowSteps(): boolean {
    const steps = this.flowController.getSteps();
    return steps.length > 1 || (steps.length === 1 && steps[0].id !== 'greeting');
  }

  protected getRequiredFields(): RequiredField[] {
    if (this.hasFlowSteps()) {
      return this.flowController.getSteps().map(step => ({
        name: step.field,
        label: step.question,
        type: step.type as 'text' | 'date' | 'choice' | 'number',
        choices: step.choices,
        required: true
      }));
    }
    return this.dynamicFields;
  }

  protected getMissingFields(state: ConversationState): RequiredField[] {
    const required = this.getRequiredFields();
    return required.filter(field => 
      state.answers[field.name] === undefined || 
      state.answers[field.name] === null ||
      state.answers[field.name] === ''
    );
  }

  protected getNextBatch(state: ConversationState): FieldBatch | null {
    const missing = this.getMissingFields(state);
    if (missing.length === 0) {
      return null;
    }

    const batchFields = missing.slice(0, this.batchSize);
    const currentBatchNum = Math.floor(
      (this.getRequiredFields().length - missing.length) / this.batchSize
    );
    const totalBatches = Math.ceil(this.getRequiredFields().length / this.batchSize);

    return {
      fields: batchFields,
      batchIndex: currentBatchNum,
      totalBatches
    };
  }

  protected generateBatchQuestions(batch: FieldBatch): string {
    if (batch.fields.length === 1) {
      const field = batch.fields[0];
      let question = field.label;
      if (field.choices && field.choices.length > 0) {
        question += ` (Options: ${field.choices.join(', ')})`;
      }
      return `I just need one more detail: ${question}?`;
    }

    const questions = batch.fields.map((field, index) => {
      let question = `${index + 1}. ${field.label}`;
      if (field.choices && field.choices.length > 0) {
        question += ` (Options: ${field.choices.join(', ')})`;
      }
      return question;
    });

    const intro = "I need a few details:";
    
    return `${intro}\n\n${questions.join('\n')}\n\nPlease provide your answers in order (you can number them like "1. answer, 2. answer" or separate with commas).`;
  }

  protected generateConfirmationSummary(state: ConversationState): string {
    const fields = this.getRequiredFields();
    const lines = fields
      .filter(field => state.answers[field.name] !== undefined)
      .map(field => `- **${field.label}**: ${state.answers[field.name]}`);

    return `Here's a summary of what you've provided:\n\n${lines.join('\n')}\n\nIs this correct? (yes/no)`;
  }

  protected extractAnswersFromInput(userInput: string, expectedFields: RequiredField[]): Record<string, string> {
    const answers: Record<string, string> = {};
    const input = userInput.trim();
    
    if (expectedFields.length === 1) {
      answers[expectedFields[0].name] = input;
      return answers;
    }

    // Strategy 1: Look for numbered responses like "1. E12345 2. Marriage 3. Jan 15"
    // First try to split on numbered patterns
    const numberedSplit = input.split(/(?=\d+\.\s)/);
    const numberedParts = numberedSplit
      .map(p => p.trim())
      .filter(p => /^\d+\.\s/.test(p))
      .map(p => {
        const match = p.match(/^(\d+)\.\s*(.+)$/s);
        return match ? { index: parseInt(match[1]) - 1, value: match[2].trim() } : null;
      })
      .filter((p): p is { index: number; value: string } => p !== null);
    
    if (numberedParts.length > 0) {
      console.log('[Orchestrator] Extracting numbered responses:', numberedParts.length);
      numberedParts.forEach(part => {
        if (part.index >= 0 && part.index < expectedFields.length) {
          answers[expectedFields[part.index].name] = part.value;
        }
      });
      if (Object.keys(answers).length > 0) {
        return answers;
      }
    }

    // Strategy 2: Look for key-value pairs like "Employee ID: E12345" or "name: John"
    for (const field of expectedFields) {
      const labelVariants = [
        field.label,
        field.label.replace(/\s+/g, ''),
        field.name,
        field.name.replace(/_/g, ' '),
        // Add first word(s) of multi-word labels for partial matching
        field.label.split(' ')[0],
        field.label.split(' ').slice(0, 2).join(' ')
      ];
      
      // Remove duplicates and filter short variants
      const uniqueVariants = [...new Set(labelVariants)].filter(v => v.length > 2);
      
      for (const variant of uniqueVariants) {
        // Escape special regex characters
        const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const kvPattern = new RegExp(`${escapedVariant}\\s*[:=]\\s*([^,;\\n]+)`, 'i');
        const match = input.match(kvPattern);
        if (match) {
          answers[field.name] = match[1].trim();
          break;
        }
      }
    }
    
    if (Object.keys(answers).length > 0) {
      console.log('[Orchestrator] Extracted key-value pairs:', Object.keys(answers).length);
      return answers;
    }

    // Strategy 3: Split on common delimiters and map positionally
    const parts = input
      .split(/[,;]|\n|(?:\.\s+)/)
      .map(p => p.trim())
      .filter(p => p && p.length > 0);
    
    console.log('[Orchestrator] Positional parsing, parts:', parts.length, 'expected:', expectedFields.length);
    
    if (parts.length >= expectedFields.length) {
      expectedFields.forEach((field, index) => {
        if (parts[index]) {
          answers[field.name] = parts[index].replace(/^\d+\.\s*/, '').trim();
        }
      });
    } else {
      // If we have fewer parts than fields, map what we have
      expectedFields.forEach((field, index) => {
        if (parts[index]) {
          answers[field.name] = parts[index].replace(/^\d+\.\s*/, '').trim();
        }
      });
    }

    return answers;
  }

  protected buildContext(conversationId: string): ConversationContext {
    const state = this.stateManager.getOrCreateState(conversationId);
    const currentStep = this.flowController.getStep(state.currentStep);
    const previousStep = this.flowController.getPreviousStep(state.currentStep, state);

    const conversationHistory: ChatHistoryItem[] = [];

    if (previousStep && state.lastAnswer) {
      conversationHistory.push({
        role: 'assistant',
        content: previousStep.question || ''
      });
      conversationHistory.push({
        role: 'user',
        content: state.lastAnswer
      });
    }

    if (currentStep) {
      conversationHistory.push({
        role: 'assistant',
        content: currentStep.question || ''
      });
    }

    return {
      currentQuestion: currentStep?.question,
      previousQuestion: previousStep?.question,
      previousAnswer: state.lastAnswer,
      awaitingConfirmation: state.awaitingConfirmation || state.awaitingFinalConfirmation,
      pendingSuggestion: state.pendingSuggestion,
      conversationHistory
    };
  }

  protected async handleDynamicFlow(
    conversationId: string,
    userInput: string
  ): Promise<TurnResult> {
    const state = this.stateManager.getOrCreateState(conversationId);
    console.log('[Orchestrator] handleDynamicFlow called:', {
      currentBatch: state.currentBatch,
      awaitingFinalConfirmation: state.awaitingFinalConfirmation,
      answersCount: Object.keys(state.answers).length
    });

    if (state.awaitingFinalConfirmation) {
      const isConfirm = /^(yes|y|correct|confirm|that'?s? right|looks good)/i.test(userInput.trim());
      const isReject = /^(no|n|incorrect|wrong|change|fix)/i.test(userInput.trim());

      if (isConfirm) {
        this.stateManager.markFlowComplete(conversationId);
        return {
          intent: 'confirm',
          response: "Great! I've recorded all the information. Let me process your request.",
          nextAction: 'generate_ai_response'
        };
      } else if (isReject) {
        this.stateManager.updateState(conversationId, { 
          awaitingFinalConfirmation: false,
          answers: {}
        });
        const updatedState = this.stateManager.getState(conversationId)!;
        const firstBatch = this.getNextBatch(updatedState);
        if (firstBatch) {
          this.stateManager.updateState(conversationId, {
            currentBatch: firstBatch.fields.map(f => f.name)
          });
          return {
            intent: 'reject',
            response: `No problem! Let's go through the information again.\n\n${this.generateBatchQuestions(firstBatch)}`
          };
        }
      }
      
      return {
        intent: 'unclear',
        response: `I need you to confirm the information is correct. ${this.generateConfirmationSummary(state)}`
      };
    }

    const currentBatch = state.currentBatch || [];
    const batchFields = this.getRequiredFields().filter(f => currentBatch.includes(f.name));
    
    if (batchFields.length > 0) {
      const extractedAnswers = this.extractAnswersFromInput(userInput, batchFields);
      
      for (const [field, value] of Object.entries(extractedAnswers)) {
        if (value) {
          this.stateManager.setAnswer(conversationId, field, value);
        }
      }
    }

    const updatedState = this.stateManager.getState(conversationId)!;
    const nextBatch = this.getNextBatch(updatedState);
    
    if (!nextBatch) {
      this.stateManager.updateState(conversationId, { awaitingFinalConfirmation: true });
      return {
        intent: 'answer_question',
        response: this.generateConfirmationSummary(updatedState)
      };
    }

    this.stateManager.updateState(conversationId, {
      currentBatch: nextBatch.fields.map(f => f.name)
    });

    const hasAnsweredAny = Object.keys(updatedState.answers).length > 0;
    const prefix = hasAnsweredAny ? "Thanks! " : "";
    const batchResponse = `${prefix}${this.generateBatchQuestions(nextBatch)}`;
    console.log('[Orchestrator] Returning batch response:', batchResponse.substring(0, 100));
    return {
      intent: 'answer_question',
      response: batchResponse
    };
  }

  protected async handleAnswerQuestion(
    conversationId: string, 
    classification: ClassificationResult, 
    userInput: string
  ): Promise<TurnResult> {
    if (!this.hasFlowSteps() && this.dynamicFields.length > 0) {
      return this.handleDynamicFlow(conversationId, userInput);
    }

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

    if (!this.hasFlowSteps() && this.dynamicFields.length > 0) {
      const currentBatchIndex = state.currentBatchIndex ?? 0;
      if (currentBatchIndex > 1) {
        this.stateManager.updateState(conversationId, { 
          currentBatchIndex: currentBatchIndex - 1,
          awaitingFinalConfirmation: false
        });
        const batch = this.getNextBatch(state);
        if (batch) {
          return {
            intent: 'go_back',
            response: `Going back to the previous questions.\n\n${this.generateBatchQuestions(batch)}`
          };
        }
      }
      return {
        intent: 'go_back',
        response: "You're at the beginning. What would you like to change?"
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
      
      if (!this.hasFlowSteps()) {
        const dynamicField = this.dynamicFields.find(f => 
          f.name === field || f.label.toLowerCase().includes(field.toLowerCase())
        );
        if (dynamicField) {
          this.stateManager.setAnswer(conversationId, dynamicField.name, newValue);
          return {
            intent: 'change_previous_answer',
            response: `Updated ${dynamicField.label} to "${newValue}".\n\n${this.generateConfirmationSummary(this.stateManager.getState(conversationId)!)}`
          };
        }
      }

      const step = this.flowController.getStepByField(field);
      if (step) {
        this.stateManager.setAnswer(conversationId, field, newValue);
        return {
          intent: 'change_previous_answer',
          response: `Updated ${field} to "${newValue}". Is there anything else you'd like to change?`
        };
      }
    }

    if (!this.hasFlowSteps()) {
      const fields = this.dynamicFields
        .filter(f => state.answers[f.name] !== undefined)
        .map(f => `- ${f.label}: ${state.answers[f.name]}`);
      return {
        intent: 'change_previous_answer',
        response: `Which answer would you like to change?\n\n${fields.join('\n')}`
      };
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
    const state = this.stateManager.getState(conversationId);
    
    if (state?.awaitingFinalConfirmation) {
      this.stateManager.markFlowComplete(conversationId);
      this.stateManager.updateState(conversationId, { awaitingFinalConfirmation: false });
      return {
        intent: 'confirm',
        response: "Great! I've recorded all the information. Let me process your request.",
        nextAction: 'generate_ai_response'
      };
    }

    this.stateManager.clearAwaitingConfirmation(conversationId);

    return {
      intent: 'confirm',
      response: "Great, confirmed! Let's continue.",
      nextAction: 'continue'
    };
  }

  protected async handleReject(conversationId: string, classification: ClassificationResult): Promise<TurnResult> {
    const state = this.stateManager.getState(conversationId);
    
    if (state?.awaitingFinalConfirmation) {
      this.stateManager.updateState(conversationId, { 
        awaitingFinalConfirmation: false,
        currentBatchIndex: 0
      });
      
      const fields = this.dynamicFields
        .filter(f => state.answers[f.name] !== undefined)
        .map(f => `- ${f.label}: ${state.answers[f.name]}`);
      
      return {
        intent: 'reject',
        response: `No problem! Which information would you like to change?\n\n${fields.join('\n')}`
      };
    }

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

    // If flow is complete OR no flow steps and no dynamic fields, let AI handle it
    if (this.stateManager.isFlowComplete(conversationId) || 
        (!this.hasFlowSteps() && this.dynamicFields.length === 0)) {
      return {
        intent: 'unclear',
        response: userInput,
        nextAction: 'generate_ai_response'
      };
    }

    if (!this.hasFlowSteps() && this.dynamicFields.length > 0) {
      const batch = this.getNextBatch(state);
      if (batch) {
        return {
          intent: 'unclear',
          response: `I'm not sure I understood that. Let me ask again:\n\n${this.generateBatchQuestions(batch)}`
        };
      }
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

      console.log('[Orchestrator] processTurn called:', {
        conversationId: conversationId.substring(0, 8),
        userInput: userInput.substring(0, 50),
        hasFlowSteps: this.hasFlowSteps(),
        dynamicFieldsCount: this.dynamicFields.length,
        dynamicFieldNames: this.dynamicFields.map(f => f.name)
      });

      if (!state.originalIntent && userInput.trim()) {
        this.stateManager.setOriginalIntent(conversationId, userInput.trim());
      }

      if (!this.hasFlowSteps() && this.dynamicFields.length > 0) {
        console.log('[Orchestrator] Dynamic flow path - checking conditions');
        if (state.awaitingFinalConfirmation) {
          console.log('[Orchestrator] Awaiting final confirmation - calling handleDynamicFlow');
          return this.handleDynamicFlow(conversationId, userInput);
        }
        
        const missing = this.getMissingFields(state);
        console.log('[Orchestrator] Missing fields:', missing.length, missing.map(f => f.name));
        if (missing.length > 0) {
          console.log('[Orchestrator] Has missing fields - calling handleDynamicFlow');
          return this.handleDynamicFlow(conversationId, userInput);
        }
      } else if (!this.hasFlowSteps() && this.dynamicFields.length === 0) {
        // No flow steps and no dynamic fields - pass directly to AI
        console.log('[Orchestrator] No flow steps and no dynamic fields - passing to AI directly');
        return {
          intent: 'answer_question',
          response: userInput,
          nextAction: 'generate_ai_response'
        };
      } else {
        console.log('[Orchestrator] NOT using dynamic flow path:', {
          hasFlowSteps: this.hasFlowSteps(),
          dynamicFieldsCount: this.dynamicFields.length
        });
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
    
    if (!this.hasFlowSteps() && this.dynamicFields.length > 0) {
      const batch = this.getNextBatch(state);
      if (batch) {
        this.stateManager.updateState(conversationId, {
          currentBatch: batch.fields.map(f => f.name),
          currentBatchIndex: 1
        });
        return `Hello! I'm here to help you. To get started, ${this.generateBatchQuestions(batch)}`;
      }
    }

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

  getCollectedAnswers(conversationId: string): Record<string, any> {
    const state = this.stateManager.getState(conversationId);
    return state?.answers ?? {};
  }

  isInfoGatheringComplete(conversationId: string): boolean {
    const state = this.stateManager.getState(conversationId);
    if (!state) return false;
    
    const missing = this.getMissingFields(state);
    return missing.length === 0 && state.flowComplete === true;
  }
}

export function createOrchestrator(config?: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
