/**
 * Recovery Manager - Base Template
 * 
 * RESPONSIBILITY:
 * - Detect when escalation to human support is needed
 * - Generate appropriate recovery responses when agent can't answer
 * - Collect context for handoff to human support
 * - Track escalation state
 * - Validate recovery rules against guardrails for conflicts
 * 
 * ESCALATION TRIGGERS:
 * - Out of scope questions
 * - Low confidence responses
 * - User explicitly requests human support
 * - Sensitive topics requiring human judgment
 * - Multiple failed attempts to understand user
 * 
 * CUSTOMIZATION:
 * - Define escalation keywords and triggers
 * - Customize recovery messages
 * - Configure handoff context requirements
 * - Set conflict detection rules for guardrails
 */

import type { 
  EscalationReason, 
  RecoveryResult, 
  EscalationContext,
  GuardrailConflict,
  RecoveryConfig
} from './types';

export interface RecoveryManagerConfig {
  escalationKeywords?: string[];
  outOfScopeKeywords?: string[];
  sensitiveTopicKeywords?: string[];
  maxRetryAttempts?: number;
  defaultRecoveryMessage?: string;
  defaultEscalationMessage?: string;
  guardrails?: string;
}

const DEFAULT_ESCALATION_KEYWORDS = [
  'speak to human', 'talk to someone', 'real person', 'human agent',
  'customer service', 'support team', 'representative', 'manager',
  'escalate', 'supervisor', 'help desk', 'live agent'
];

const DEFAULT_OUT_OF_SCOPE_KEYWORDS = [
  'legal advice', 'tax advice', 'financial advice', 'medical advice',
  'investment recommendation', 'lawsuit', 'sue', 'attorney', 'lawyer'
];

const DEFAULT_SENSITIVE_TOPIC_KEYWORDS = [
  'harassment', 'discrimination', 'complaint', 'grievance', 'fraud',
  'security breach', 'data leak', 'emergency', 'urgent', 'crisis'
];

const DEFAULT_RECOVERY_MESSAGE = 
  "I'm not able to fully answer that question. Let me help you get to the right resource.";

const DEFAULT_ESCALATION_MESSAGE = 
  "I'll connect you with our support team who can better assist you. " +
  "To help them serve you faster, please be ready to provide: your employee ID, " +
  "the specific pay period in question, and a brief description of your concern.";

export class RecoveryManager {
  private escalationKeywords: string[];
  private outOfScopeKeywords: string[];
  private sensitiveTopicKeywords: string[];
  private maxRetryAttempts: number;
  private defaultRecoveryMessage: string;
  private defaultEscalationMessage: string;
  private guardrails: string;
  
  private escalationStates: Map<string, EscalationContext> = new Map();
  private retryCounters: Map<string, number> = new Map();

  constructor(config: RecoveryManagerConfig = {}) {
    this.escalationKeywords = config.escalationKeywords ?? DEFAULT_ESCALATION_KEYWORDS;
    this.outOfScopeKeywords = config.outOfScopeKeywords ?? DEFAULT_OUT_OF_SCOPE_KEYWORDS;
    this.sensitiveTopicKeywords = config.sensitiveTopicKeywords ?? DEFAULT_SENSITIVE_TOPIC_KEYWORDS;
    this.maxRetryAttempts = config.maxRetryAttempts ?? 3;
    this.defaultRecoveryMessage = config.defaultRecoveryMessage ?? DEFAULT_RECOVERY_MESSAGE;
    this.defaultEscalationMessage = config.defaultEscalationMessage ?? DEFAULT_ESCALATION_MESSAGE;
    this.guardrails = config.guardrails ?? '';
  }

  private hasKeywords(input: string, keywords: string[]): boolean {
    const inputLower = input.toLowerCase();
    return keywords.some(keyword => inputLower.includes(keyword.toLowerCase()));
  }

  /**
   * Detect if user input requires escalation
   */
  detectEscalationNeed(
    userInput: string, 
    conversationId: string,
    confidence?: 'high' | 'medium' | 'low'
  ): RecoveryResult {
    const inputLower = userInput.toLowerCase();
    const reasons: EscalationReason[] = [];

    // Check for explicit escalation request
    if (this.hasKeywords(inputLower, this.escalationKeywords)) {
      reasons.push('user_requested');
    }

    // Check for out of scope topics
    if (this.hasKeywords(inputLower, this.outOfScopeKeywords)) {
      reasons.push('out_of_scope');
    }

    // Check for sensitive topics
    if (this.hasKeywords(inputLower, this.sensitiveTopicKeywords)) {
      reasons.push('sensitive_topic');
    }

    // Check for low confidence (if provided)
    if (confidence === 'low') {
      reasons.push('low_confidence');
    }

    // Check retry count
    const retryCount = this.retryCounters.get(conversationId) ?? 0;
    if (retryCount >= this.maxRetryAttempts) {
      reasons.push('max_retries_exceeded');
    }

    const shouldEscalate = reasons.length > 0;
    const primaryReason = reasons[0];

    return {
      shouldEscalate,
      reasons,
      primaryReason,
      recoveryMessage: shouldEscalate 
        ? this.getRecoveryMessage(primaryReason)
        : undefined,
      escalationMessage: shouldEscalate 
        ? this.getEscalationMessage(primaryReason)
        : undefined,
      contextToCollect: shouldEscalate 
        ? this.getRequiredContext(primaryReason)
        : undefined
    };
  }

  /**
   * Get appropriate recovery message based on reason
   */
  private getRecoveryMessage(reason?: EscalationReason): string {
    switch (reason) {
      case 'user_requested':
        return "I understand you'd like to speak with someone directly. Let me connect you with our support team.";
      case 'out_of_scope':
        return "That question falls outside what I can help with. I'll connect you with a specialist who can assist.";
      case 'sensitive_topic':
        return "This is an important matter that requires human attention. Let me escalate this to our support team.";
      case 'low_confidence':
        return "I want to make sure you get accurate information. Let me connect you with someone who can help.";
      case 'max_retries_exceeded':
        return "I'm having trouble understanding your request. Let me connect you with a team member who can better assist.";
      default:
        return this.defaultRecoveryMessage;
    }
  }

  /**
   * Get escalation message with handoff instructions
   */
  private getEscalationMessage(reason?: EscalationReason): string {
    const baseMessage = this.defaultEscalationMessage;
    
    switch (reason) {
      case 'sensitive_topic':
        return baseMessage + " Your concern will be handled with confidentiality and priority.";
      case 'out_of_scope':
        return baseMessage + " They have access to additional resources that can address your specific question.";
      default:
        return baseMessage;
    }
  }

  /**
   * Get list of context fields to collect before handoff
   */
  private getRequiredContext(reason?: EscalationReason): string[] {
    const baseContext = ['employee_id', 'issue_summary'];
    
    switch (reason) {
      case 'out_of_scope':
        return [...baseContext, 'topic_category', 'specific_question'];
      case 'sensitive_topic':
        return [...baseContext, 'urgency_level', 'preferred_contact_method'];
      default:
        return [...baseContext, 'pay_period', 'relevant_line_items'];
    }
  }

  /**
   * Track escalation state for a conversation
   */
  initiateEscalation(
    conversationId: string, 
    reason: EscalationReason,
    userInput: string
  ): EscalationContext {
    const context: EscalationContext = {
      conversationId,
      reason,
      initiatedAt: new Date().toISOString(),
      status: 'pending',
      originalQuery: userInput,
      collectedContext: {}
    };
    
    this.escalationStates.set(conversationId, context);
    return context;
  }

  /**
   * Update escalation context with collected information
   */
  updateEscalationContext(
    conversationId: string, 
    field: string, 
    value: string
  ): EscalationContext | undefined {
    const context = this.escalationStates.get(conversationId);
    if (!context) return undefined;

    const updated = {
      ...context,
      collectedContext: {
        ...context.collectedContext,
        [field]: value
      }
    };
    
    this.escalationStates.set(conversationId, updated);
    return updated;
  }

  /**
   * Mark escalation as complete
   */
  completeEscalation(conversationId: string): EscalationContext | undefined {
    const context = this.escalationStates.get(conversationId);
    if (!context) return undefined;

    const updated = {
      ...context,
      status: 'completed' as const,
      completedAt: new Date().toISOString()
    };
    
    this.escalationStates.set(conversationId, updated);
    return updated;
  }

  /**
   * Get current escalation state
   */
  getEscalationState(conversationId: string): EscalationContext | undefined {
    return this.escalationStates.get(conversationId);
  }

  /**
   * Increment retry counter for a conversation
   */
  incrementRetryCount(conversationId: string): number {
    const current = this.retryCounters.get(conversationId) ?? 0;
    const updated = current + 1;
    this.retryCounters.set(conversationId, updated);
    return updated;
  }

  /**
   * Reset retry counter
   */
  resetRetryCount(conversationId: string): void {
    this.retryCounters.delete(conversationId);
  }

  /**
   * Clear all state for a conversation
   */
  clearConversation(conversationId: string): void {
    this.escalationStates.delete(conversationId);
    this.retryCounters.delete(conversationId);
  }

  /**
   * Validate recovery rules against guardrails to detect conflicts
   */
  validateAgainstGuardrails(guardrails: string): GuardrailConflict[] {
    const conflicts: GuardrailConflict[] = [];
    const guardrailsLower = guardrails.toLowerCase();

    // Check for conflicting escalation rules
    // If guardrails say "always escalate" for something but recovery says "try to handle"
    const alwaysEscalatePatterns = [
      { pattern: /always escalate.*?(\w+(?:\s+\w+)*)/gi, type: 'always_escalate' },
      { pattern: /immediately.*?escalate.*?(\w+(?:\s+\w+)*)/gi, type: 'immediate_escalate' },
      { pattern: /must.*?escalate.*?(\w+(?:\s+\w+)*)/gi, type: 'must_escalate' }
    ];

    for (const { pattern, type } of alwaysEscalatePatterns) {
      const matches = guardrailsLower.matchAll(pattern);
      for (const match of matches) {
        const topic = match[1]?.trim();
        if (topic) {
          // Check if this topic is in our "out of scope" or "sensitive" lists
          const isInOutOfScope = this.outOfScopeKeywords.some(k => 
            topic.includes(k.toLowerCase()) || k.toLowerCase().includes(topic)
          );
          const isInSensitive = this.sensitiveTopicKeywords.some(k => 
            topic.includes(k.toLowerCase()) || k.toLowerCase().includes(topic)
          );

          if (!isInOutOfScope && !isInSensitive) {
            conflicts.push({
              type: 'missing_escalation_trigger',
              severity: 'warning',
              guardrailRule: match[0],
              recoveryRule: 'Topic not configured as escalation trigger',
              suggestion: `Add "${topic}" to escalation triggers or sensitive topic keywords`,
              topic
            });
          }
        }
      }
    }

    // Check for "never" rules that might conflict with recovery attempts
    const neverPatterns = [
      /never.*?attempt.*?to.*?answer.*?(\w+(?:\s+\w+)*)/gi,
      /do not.*?respond.*?to.*?(\w+(?:\s+\w+)*)/gi,
      /block.*?questions.*?about.*?(\w+(?:\s+\w+)*)/gi
    ];

    for (const pattern of neverPatterns) {
      const matches = guardrailsLower.matchAll(pattern);
      for (const match of matches) {
        const topic = match[1]?.trim();
        if (topic) {
          // Check if recovery might try to handle this before escalating
          const isHandledByRecovery = !this.outOfScopeKeywords.some(k => 
            k.toLowerCase().includes(topic)
          );

          if (isHandledByRecovery) {
            conflicts.push({
              type: 'potential_response_conflict',
              severity: 'error',
              guardrailRule: match[0],
              recoveryRule: 'Recovery may attempt to respond before escalating',
              suggestion: `Add "${topic}" to out-of-scope keywords for immediate escalation`,
              topic
            });
          }
        }
      }
    }

    // Check for custom escalation triggers in guardrails that aren't in recovery config
    const escalationTriggerPattern = /escalat(?:e|ion).*?(?:when|if|for).*?(\w+(?:\s+\w+)*)/gi;
    const matches = guardrailsLower.matchAll(escalationTriggerPattern);
    
    for (const match of matches) {
      const trigger = match[1]?.trim();
      if (trigger && trigger.length > 3) {
        const isConfigured = 
          this.escalationKeywords.some(k => k.toLowerCase().includes(trigger)) ||
          this.outOfScopeKeywords.some(k => k.toLowerCase().includes(trigger)) ||
          this.sensitiveTopicKeywords.some(k => k.toLowerCase().includes(trigger));

        if (!isConfigured) {
          conflicts.push({
            type: 'unconfigured_escalation_trigger',
            severity: 'info',
            guardrailRule: match[0],
            recoveryRule: 'Trigger not found in recovery configuration',
            suggestion: `Consider adding "${trigger}" to appropriate keyword list`,
            topic: trigger
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Get configuration for inspection
   */
  getConfig(): RecoveryConfig {
    return {
      escalationKeywords: [...this.escalationKeywords],
      outOfScopeKeywords: [...this.outOfScopeKeywords],
      sensitiveTopicKeywords: [...this.sensitiveTopicKeywords],
      maxRetryAttempts: this.maxRetryAttempts,
      defaultRecoveryMessage: this.defaultRecoveryMessage,
      defaultEscalationMessage: this.defaultEscalationMessage
    };
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(updates: Partial<RecoveryManagerConfig>): void {
    if (updates.escalationKeywords) {
      this.escalationKeywords = updates.escalationKeywords;
    }
    if (updates.outOfScopeKeywords) {
      this.outOfScopeKeywords = updates.outOfScopeKeywords;
    }
    if (updates.sensitiveTopicKeywords) {
      this.sensitiveTopicKeywords = updates.sensitiveTopicKeywords;
    }
    if (updates.maxRetryAttempts !== undefined) {
      this.maxRetryAttempts = updates.maxRetryAttempts;
    }
    if (updates.defaultRecoveryMessage) {
      this.defaultRecoveryMessage = updates.defaultRecoveryMessage;
    }
    if (updates.defaultEscalationMessage) {
      this.defaultEscalationMessage = updates.defaultEscalationMessage;
    }
    if (updates.guardrails) {
      this.guardrails = updates.guardrails;
    }
  }
}

export function createRecoveryManager(config?: RecoveryManagerConfig): RecoveryManager {
  return new RecoveryManager(config);
}
