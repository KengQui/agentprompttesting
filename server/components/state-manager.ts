/**
 * State Manager - Base Template
 * 
 * RESPONSIBILITY:
 * - Track conversation state
 * - Store and retrieve answers
 * - Manage step progression
 * - Handle state persistence
 * 
 * CUSTOMIZATION:
 * - Define custom flow steps
 * - Add validation rules per step
 * - Customize state persistence
 */

import type { ConversationState, ChatHistoryItem } from './types';

export interface StateManagerConfig {
  flowSteps?: string[];
  initialState?: Partial<ConversationState>;
}

export class StateManager {
  private states: Map<string, ConversationState> = new Map();
  private flowSteps: string[];

  constructor(config: StateManagerConfig = {}) {
    this.flowSteps = config.flowSteps ?? [];
  }

  createConversation(conversationId: string, initialState?: Partial<ConversationState>): ConversationState {
    const state: ConversationState = {
      conversationId,
      currentStep: this.flowSteps[0] || 'start',
      completedSteps: [],
      answers: {},
      awaitingConfirmation: false,
      ...initialState
    };
    this.states.set(conversationId, state);
    return state;
  }

  getState(conversationId: string): ConversationState | undefined {
    return this.states.get(conversationId);
  }

  getOrCreateState(conversationId: string): ConversationState {
    const existing = this.states.get(conversationId);
    if (existing) return existing;
    return this.createConversation(conversationId);
  }

  updateState(conversationId: string, updates: Partial<ConversationState>): ConversationState | undefined {
    const state = this.states.get(conversationId);
    if (!state) return undefined;

    const updated = { ...state, ...updates };
    this.states.set(conversationId, updated);
    return updated;
  }

  setAnswer(conversationId: string, field: string, value: any): ConversationState | undefined {
    const state = this.states.get(conversationId);
    if (!state) return undefined;

    const updated = {
      ...state,
      answers: { ...state.answers, [field]: value },
      lastAnswer: value
    };
    this.states.set(conversationId, updated);
    return updated;
  }

  getAnswer(conversationId: string, field: string): any {
    const state = this.states.get(conversationId);
    return state?.answers[field];
  }

  getAllAnswers(conversationId: string): Record<string, any> {
    const state = this.states.get(conversationId);
    return state?.answers ?? {};
  }

  completeStep(conversationId: string, step: string): ConversationState | undefined {
    const state = this.states.get(conversationId);
    if (!state) return undefined;

    const completedSteps = state.completedSteps.includes(step) 
      ? state.completedSteps 
      : [...state.completedSteps, step];
    
    const currentIndex = this.flowSteps.indexOf(step);
    const nextStep = currentIndex >= 0 && currentIndex < this.flowSteps.length - 1
      ? this.flowSteps[currentIndex + 1]
      : 'complete';

    const updated = {
      ...state,
      completedSteps,
      currentStep: nextStep
    };
    this.states.set(conversationId, updated);
    return updated;
  }

  goBackToStep(conversationId: string, targetStep: string): ConversationState | undefined {
    const state = this.states.get(conversationId);
    if (!state) return undefined;

    const targetIndex = this.flowSteps.indexOf(targetStep);
    if (targetIndex < 0) return undefined;

    const completedSteps = state.completedSteps.filter(step => {
      const stepIndex = this.flowSteps.indexOf(step);
      return stepIndex < targetIndex;
    });

    const updated = {
      ...state,
      completedSteps,
      currentStep: targetStep
    };
    this.states.set(conversationId, updated);
    return updated;
  }

  setAwaitingConfirmation(conversationId: string, suggestion: string): ConversationState | undefined {
    return this.updateState(conversationId, {
      awaitingConfirmation: true,
      pendingSuggestion: suggestion
    });
  }

  clearAwaitingConfirmation(conversationId: string): ConversationState | undefined {
    return this.updateState(conversationId, {
      awaitingConfirmation: false,
      pendingSuggestion: undefined
    });
  }

  deleteConversation(conversationId: string): boolean {
    return this.states.delete(conversationId);
  }

  getFlowSteps(): string[] {
    return [...this.flowSteps];
  }

  getCurrentStepIndex(conversationId: string): number {
    const state = this.states.get(conversationId);
    if (!state) return -1;
    return this.flowSteps.indexOf(state.currentStep);
  }

  getPreviousStep(conversationId: string): string | undefined {
    const currentIndex = this.getCurrentStepIndex(conversationId);
    if (currentIndex <= 0) return undefined;
    return this.flowSteps[currentIndex - 1];
  }
}

export function createStateManager(config?: StateManagerConfig): StateManager {
  return new StateManager(config);
}
