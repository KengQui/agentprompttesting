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
  currentBatch?: string[];
  currentBatchIndex?: number;
  awaitingFinalConfirmation?: boolean;
  requiredFields?: RequiredField[];
}

export interface RequiredField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'choice' | 'number';
  required?: boolean;
  choices?: string[];
  group?: string;
}

export interface TurnResult {
  intent: IntentType;
  response: string;
  newState?: Partial<ConversationState>;
  nextAction?: string;
  confidence?: string;
}

export interface AgentConfig {
  name: string;
  businessUseCase: string;
  description: string;
  validationRules?: string;
  guardrails?: string;
}

// Recovery Manager Types

export type EscalationReason = 
  | 'user_requested'
  | 'out_of_scope'
  | 'sensitive_topic'
  | 'low_confidence'
  | 'max_retries_exceeded'
  | 'error';

export interface RecoveryResult {
  shouldEscalate: boolean;
  reasons: EscalationReason[];
  primaryReason?: EscalationReason;
  recoveryMessage?: string;
  escalationMessage?: string;
  contextToCollect?: string[];
}

export interface EscalationContext {
  conversationId: string;
  reason: EscalationReason;
  initiatedAt: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  originalQuery: string;
  collectedContext: Record<string, string>;
}

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface GuardrailConflict {
  type: 'missing_escalation_trigger' | 'potential_response_conflict' | 'unconfigured_escalation_trigger';
  severity: ConflictSeverity;
  guardrailRule: string;
  recoveryRule: string;
  suggestion: string;
  topic?: string;
}

export interface RecoveryConfig {
  escalationKeywords?: string[];
  outOfScopeKeywords?: string[];
  sensitiveTopicKeywords?: string[];
  maxRetryAttempts?: number;
  defaultRecoveryMessage?: string;
  defaultEscalationMessage?: string;
}
