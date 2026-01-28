/**
 * Shared types for conversation components
 */

export type IntentType = 
  | 'answer_question'
  | 'go_back'
  | 'change_previous_answer'
  | 'request_clarification'
  | 'confirm'
  | 'reject'
  | 'unclear'
  | 'error';

export interface ClassificationResult {
  intent: IntentType;
  classificationMethod: 'keyword' | 'llm' | 'llm_unavailable';
  confidence?: 'high' | 'medium' | 'low';
  extractedValue?: string;
  proposedChange?: {
    field: string;
    newValue: string;
  };
  targetQuestion?: string;
  clarificationTopic?: string;
  llmReasoning?: string;
  message?: string;
  confirming?: string;
  rejecting?: string;
  nextAction?: string;
  shouldProvideHelp?: boolean;
  shouldProvideExamples?: boolean;
  needsExplanation?: boolean;
}

export interface ConversationContext {
  currentQuestion?: string;
  previousQuestion?: string;
  previousAnswer?: string;
  awaitingConfirmation?: boolean;
  pendingSuggestion?: string;
  conversationHistory?: ChatHistoryItem[];
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  conversationId: string;
  currentStep: string;
  completedSteps: string[];
  answers: Record<string, any>;
  awaitingConfirmation: boolean;
  pendingSuggestion?: string;
  lastQuestion?: string;
  lastAnswer?: string;
  originalIntent?: string;
  flowComplete?: boolean;
}

export interface TurnResult {
  intent: IntentType;
  response: string;
  newState?: Partial<ConversationState>;
  nextAction?: string;
}

export interface AgentConfig {
  name: string;
  businessUseCase: string;
  description: string;
  validationRules?: string;
  guardrails?: string;
}
