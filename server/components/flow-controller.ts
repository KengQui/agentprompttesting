/**
 * Flow Controller - Base Template
 * 
 * RESPONSIBILITY:
 * - Define conversation flow steps
 * - Generate questions for each step
 * - Handle step transitions
 * - Provide step-specific context
 * 
 * CUSTOMIZATION:
 * - Define custom flow with steps and questions
 * - Add conditional branching logic
 * - Customize question generation
 */

import type { ConversationState, AgentConfig } from './types';

export interface FlowStep {
  id: string;
  question: string;
  field: string;
  type?: 'text' | 'number' | 'choice' | 'date';
  choices?: string[];
  validation?: (value: any) => boolean;
  helpText?: string;
  skipIf?: (state: ConversationState) => boolean;
}

export interface FlowControllerConfig {
  steps?: FlowStep[];
  welcomeMessage?: string;
  completionMessage?: string;
}

export class FlowController {
  private steps: FlowStep[];
  private welcomeMessage: string;
  private completionMessage: string;

  constructor(config: FlowControllerConfig = {}) {
    this.steps = config.steps ?? [];
    this.welcomeMessage = config.welcomeMessage ?? "Hello! I'm here to help you. Let's get started.";
    this.completionMessage = config.completionMessage ?? "Great! We've collected all the information needed. Thank you!";
  }

  getSteps(): FlowStep[] {
    return [...this.steps];
  }

  getStepIds(): string[] {
    return this.steps.map(s => s.id);
  }

  getStep(stepId: string): FlowStep | undefined {
    return this.steps.find(s => s.id === stepId);
  }

  getStepByField(field: string): FlowStep | undefined {
    return this.steps.find(s => s.field === field);
  }

  getNextStep(currentStepId: string, state: ConversationState): FlowStep | null {
    const currentIndex = this.steps.findIndex(s => s.id === currentStepId);
    if (currentIndex < 0 || currentIndex >= this.steps.length - 1) {
      return null;
    }

    for (let i = currentIndex + 1; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step.skipIf || !step.skipIf(state)) {
        return step;
      }
    }

    return null;
  }

  getPreviousStep(currentStepId: string, state: ConversationState): FlowStep | null {
    const currentIndex = this.steps.findIndex(s => s.id === currentStepId);
    if (currentIndex <= 0) {
      return null;
    }

    for (let i = currentIndex - 1; i >= 0; i--) {
      const step = this.steps[i];
      if (!step.skipIf || !step.skipIf(state)) {
        return step;
      }
    }

    return null;
  }

  generateQuestion(step: FlowStep): string {
    let question = step.question;
    
    if (step.choices && step.choices.length > 0) {
      question += '\n\nOptions: ' + step.choices.join(', ');
    }

    if (step.helpText) {
      question += '\n\n(Hint: ' + step.helpText + ')';
    }

    return question;
  }

  generateClarification(step: FlowStep, topic: string): string {
    if (step.helpText) {
      return step.helpText;
    }
    return `For "${step.field}", please provide: ${step.question}`;
  }

  getWelcomeMessage(): string {
    return this.welcomeMessage;
  }

  getCompletionMessage(): string {
    return this.completionMessage;
  }

  validateAnswer(step: FlowStep, value: any): boolean {
    if (!step.validation) {
      return true;
    }
    return step.validation(value);
  }

  isFlowComplete(state: ConversationState): boolean {
    const requiredSteps = this.steps.filter(s => !s.skipIf || !s.skipIf(state));
    return requiredSteps.every(step => state.completedSteps.includes(step.id));
  }

  getSummary(state: ConversationState): string {
    const lines = this.steps
      .filter(step => state.answers[step.field] !== undefined)
      .map(step => `- ${step.field}: ${state.answers[step.field]}`);
    
    return lines.length > 0 
      ? 'Here\'s what we have so far:\n' + lines.join('\n')
      : 'No information collected yet.';
  }
}

export function createFlowController(config?: FlowControllerConfig): FlowController {
  return new FlowController(config);
}
