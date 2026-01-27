/**
 * Turn Manager - Base Template
 * 
 * RESPONSIBILITY:
 * - Classify user intent (answer question, go back, correct previous answer, etc.)
 * - Route to appropriate handler
 * - Manage conversation flow at the turn level
 * 
 * CLASSIFICATION STRATEGY:
 * - Keyword-based classification for common cases (fast, free, accurate for ~80% of cases)
 * - LLM fallback for complex semantic understanding
 * - Priority Order: go_back > change_previous_answer > request_clarification > confirm/reject > answer_question > unclear
 * 
 * CUSTOMIZATION:
 * - Override keywords for domain-specific language
 * - Add custom intent handlers
 * - Modify LLM prompt for specific use cases
 */

import { GoogleGenAI } from '@google/genai';
import type { 
  IntentType, 
  ClassificationResult, 
  ConversationContext 
} from './types';

export interface TurnManagerConfig {
  useLlmFallback?: boolean;
  goBackKeywords?: string[];
  correctionKeywords?: string[];
  clarificationKeywords?: string[];
  confirmationKeywords?: string[];
  rejectionKeywords?: string[];
}

const DEFAULT_GO_BACK_KEYWORDS = ['back', 'previous', 'return', 'undo', 'earlier'];
const DEFAULT_CORRECTION_KEYWORDS = ['change', 'actually', 'meant', 'should be', 'revise', 'update', 'i mean', 'correct the', 'correct this', 'correct that', 'correction'];
const DEFAULT_CLARIFICATION_KEYWORDS = [
  'what', 'how', 'why', 'explain', 'help', "don't understand",
  'tell me', 'can you', 'could you', 'would you', 'describe', 'definition',
  'difference', 'confused', 'clarify', 'understand'
];
const DEFAULT_CONFIRMATION_KEYWORDS = [
  'yes', 'yeah', 'yep', 'y', 'yup', 'sure', 'ok', 'okay',
  'confirm', 'confirmed', 'correct', 'right', "that's right", 'thats right',
  'looks good', 'sounds good', 'that works', 'perfect', 'great',
  'go ahead', 'proceed', 'accept', 'approved', 'good', 'fine',
  'alright', 'all right', 'absolutely', 'definitely', 'yes please',
  'that looks right', 'that looks correct', 'looks correct'
];
const DEFAULT_REJECTION_KEYWORDS = [
  'no', 'nope', 'n', 'nah', 'not quite', 'not exactly', 'not right',
  'incorrect', 'wrong', 'disagree', 'reject', 'denied', 'not correct',
  "that's wrong", 'thats wrong', "that's not right", 'thats not right'
];

export class TurnManager {
  private useLlmFallback: boolean;
  private goBackKeywords: string[];
  private correctionKeywords: string[];
  private clarificationKeywords: string[];
  private confirmationKeywords: string[];
  private rejectionKeywords: string[];
  private llmClient: GoogleGenAI | null = null;
  private model = 'gemini-2.0-flash';

  constructor(config: TurnManagerConfig = {}) {
    this.useLlmFallback = config.useLlmFallback ?? true;
    this.goBackKeywords = config.goBackKeywords ?? DEFAULT_GO_BACK_KEYWORDS;
    this.correctionKeywords = config.correctionKeywords ?? DEFAULT_CORRECTION_KEYWORDS;
    this.clarificationKeywords = config.clarificationKeywords ?? DEFAULT_CLARIFICATION_KEYWORDS;
    this.confirmationKeywords = config.confirmationKeywords ?? DEFAULT_CONFIRMATION_KEYWORDS;
    this.rejectionKeywords = config.rejectionKeywords ?? DEFAULT_REJECTION_KEYWORDS;

    if (this.useLlmFallback) {
      this.initLlmClient();
    }
  }

  private initLlmClient(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.llmClient = new GoogleGenAI({ apiKey });
    }
  }

  private hasKeywords(input: string, keywords: string[]): boolean {
    const inputLower = input.toLowerCase();
    return keywords.some(keyword => inputLower.includes(keyword.toLowerCase()));
  }

  private detectAmbiguousIntent(userInputLower: string): { isAmbiguous: boolean; detectedIntents: Record<string, boolean> } {
    const detectedIntents: Record<string, boolean> = {};

    if (this.hasKeywords(userInputLower, this.goBackKeywords)) {
      detectedIntents['go_back'] = true;
    }
    if (this.hasKeywords(userInputLower, this.correctionKeywords)) {
      detectedIntents['correction'] = true;
    }
    if (this.hasKeywords(userInputLower, this.clarificationKeywords)) {
      detectedIntents['clarification'] = true;
    }
    if (this.hasKeywords(userInputLower, this.confirmationKeywords)) {
      detectedIntents['confirmation'] = true;
    }
    if (this.hasKeywords(userInputLower, this.rejectionKeywords)) {
      detectedIntents['rejection'] = true;
    }

    const nonClarificationIntents = Object.keys(detectedIntents).filter(k => k !== 'clarification');
    const isAmbiguous = nonClarificationIntents.length >= 2;

    return { isAmbiguous, detectedIntents };
  }

  private keywordClassify(userInput: string, context: ConversationContext): ClassificationResult | null {
    const inputLower = userInput.toLowerCase().trim();

    // Priority 1: Go back navigation
    if (this.hasKeywords(inputLower, this.goBackKeywords) && 
        !this.hasKeywords(inputLower, this.correctionKeywords)) {
      return {
        intent: 'go_back',
        classificationMethod: 'keyword',
        confidence: 'high'
      };
    }

    // Priority 2: Correction/change previous answer
    if (this.hasKeywords(inputLower, this.correctionKeywords)) {
      return {
        intent: 'change_previous_answer',
        classificationMethod: 'keyword',
        confidence: 'high'
      };
    }

    // Priority 3: Confirmation (only if awaiting)
    if (context.awaitingConfirmation && this.hasKeywords(inputLower, this.confirmationKeywords)) {
      return {
        intent: 'confirm',
        classificationMethod: 'keyword',
        confidence: 'high',
        confirming: context.pendingSuggestion
      };
    }

    // Priority 4: Rejection (only if awaiting)
    if (context.awaitingConfirmation && this.hasKeywords(inputLower, this.rejectionKeywords)) {
      return {
        intent: 'reject',
        classificationMethod: 'keyword',
        confidence: 'high',
        rejecting: context.pendingSuggestion
      };
    }

    // Priority 5: Clarification request
    if (this.hasKeywords(inputLower, this.clarificationKeywords) && inputLower.includes('?')) {
      return {
        intent: 'request_clarification',
        classificationMethod: 'keyword',
        confidence: 'medium',
        needsExplanation: true
      };
    }

    // Default: Treat as answer to current question
    if (userInput.trim().length > 0) {
      return {
        intent: 'answer_question',
        classificationMethod: 'keyword',
        confidence: 'medium',
        extractedValue: userInput.trim()
      };
    }

    return null;
  }

  private buildDisambiguationPrompt(
    userInput: string, 
    context: ConversationContext, 
    detectedIntents: Record<string, boolean>
  ): string {
    return `You are an intent classifier for a conversation system.

CONTEXT:
Current question: ${context.currentQuestion || 'unknown'}
Previous question: ${context.previousQuestion || 'unknown'}
Previous answer: ${context.previousAnswer || 'unknown'}
Awaiting confirmation: ${context.awaitingConfirmation || false}
Pending suggestion: ${context.pendingSuggestion || 'none'}

USER INPUT: "${userInput}"

KEYWORD ANALYSIS:
Detected keyword types: ${Object.keys(detectedIntents).join(', ') || 'none'}

TASK: Classify the user's PRIMARY intent into ONE category:

1. answer_question - Responding to current question
2. go_back - Return to previous step
3. change_previous_answer - Correct earlier answer
4. request_clarification - Asking for explanation
5. confirm - Accepting suggestion (only if awaiting_confirmation=true)
6. reject - Rejecting suggestion (only if awaiting_confirmation=true)
7. unclear - Cannot determine intent

RULES:
- If awaiting confirmation and user says yes/confirm/correct → "confirm"
- If awaiting confirmation and user says no/wrong/incorrect → "reject"
- If user says "back" or "previous" → "go_back"
- If user says "actually" or "change" → "change_previous_answer"
- If user asks a question (contains ?) → "request_clarification"
- If providing info for current question → "answer_question"

Respond ONLY with this JSON structure:
{
  "intent": "<one of the intent types>",
  "confidence": "<high, medium, or low>",
  "reasoning": "<brief explanation>",
  "extracted_value": "<value if answering or correcting, null otherwise>",
  "proposed_change": {"field": "<field name>", "new_value": "<value>"} (only for change_previous_answer),
  "target_question": "<field name>" (only for go_back),
  "clarification_topic": "<topic>" (only for request_clarification)
}`;
  }

  private async llmClassify(
    userInput: string, 
    context: ConversationContext, 
    detectedIntents: Record<string, boolean>
  ): Promise<ClassificationResult> {
    if (!this.llmClient) {
      return {
        intent: 'error',
        classificationMethod: 'llm_unavailable',
        message: 'LLM not available for disambiguation'
      };
    }

    try {
      const prompt = this.buildDisambiguationPrompt(userInput, context, detectedIntents);
      
      const response = await this.llmClient.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      });

      const text = response.text;
      if (text) {
        const llmResult = JSON.parse(text);
        const intent = llmResult.intent as IntentType || 'unclear';
        
        const result: ClassificationResult = {
          intent,
          classificationMethod: 'llm',
          confidence: llmResult.confidence || 'low',
          llmReasoning: llmResult.reasoning
        };

        if (llmResult.extracted_value) {
          result.extractedValue = llmResult.extracted_value;
        }
        if (llmResult.proposed_change) {
          result.proposedChange = {
            field: llmResult.proposed_change.field,
            newValue: llmResult.proposed_change.new_value
          };
        }
        if (llmResult.target_question) {
          result.targetQuestion = llmResult.target_question;
        }
        if (llmResult.clarification_topic) {
          result.clarificationTopic = llmResult.clarification_topic;
          result.needsExplanation = true;
        }

        return result;
      }

      return {
        intent: 'error',
        classificationMethod: 'llm',
        message: 'Empty LLM response'
      };
    } catch (error: any) {
      return {
        intent: 'error',
        classificationMethod: 'llm',
        message: `LLM error: ${error.message}`
      };
    }
  }

  async classifyIntent(userInput: string, context: ConversationContext = {}): Promise<ClassificationResult> {
    const inputLower = userInput.toLowerCase().trim();

    // Check for ambiguous intent
    const { isAmbiguous, detectedIntents } = this.detectAmbiguousIntent(inputLower);

    // If ambiguous and LLM is available, use LLM for disambiguation
    if (isAmbiguous && this.useLlmFallback && this.llmClient) {
      return this.llmClassify(userInput, context, detectedIntents);
    }

    // Try keyword-based classification
    const keywordResult = this.keywordClassify(userInput, context);
    if (keywordResult) {
      return keywordResult;
    }

    // Fallback to unclear
    return {
      intent: 'unclear',
      classificationMethod: 'keyword',
      confidence: 'low',
      shouldProvideHelp: true,
      shouldProvideExamples: true
    };
  }
}

export function createTurnManager(config?: TurnManagerConfig): TurnManager {
  return new TurnManager(config);
}
