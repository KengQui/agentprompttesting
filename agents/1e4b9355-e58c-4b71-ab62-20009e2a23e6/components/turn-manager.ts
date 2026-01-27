/**
 * Turn Manager - Helper Bot
 * 
 * Customized for customer support assistance.
 * 
 * CUSTOM KEYWORDS:
 * - Support-specific clarification terms
 * - Product-related keywords
 */

import { TurnManager as BaseTurnManager, TurnManagerConfig } from '../../../server/components/turn-manager';

const HELPER_BOT_CONFIG: TurnManagerConfig = {
  useLlmFallback: true,
  
  goBackKeywords: ['back', 'previous', 'return', 'undo', 'earlier', 'start over'],
  
  correctionKeywords: [
    'change', 'actually', 'meant', 'should be', 'revise', 'update', 
    'i mean', 'correct the', 'correction', 'let me rephrase'
  ],
  
  clarificationKeywords: [
    'what', 'how', 'why', 'explain', 'help', "don't understand",
    'tell me', 'can you', 'could you', 'would you', 'describe',
    'confused', 'clarify', 'understand', 'more info', 'details',
    'what do you mean', 'how does', 'what is'
  ],
  
  confirmationKeywords: [
    'yes', 'yeah', 'yep', 'y', 'yup', 'sure', 'ok', 'okay',
    'confirm', 'correct', 'right', "that's right", 'looks good',
    'sounds good', 'that works', 'perfect', 'great', 'thanks',
    'go ahead', 'proceed', 'accept', 'approved', 'good'
  ],
  
  rejectionKeywords: [
    'no', 'nope', 'n', 'nah', 'not quite', 'not exactly', 'not right',
    'incorrect', 'wrong', 'disagree', 'not what i meant',
    "that's wrong", "that's not right", 'try again'
  ]
};

export class HelperBotTurnManager extends BaseTurnManager {
  constructor() {
    super(HELPER_BOT_CONFIG);
  }
}

export function createTurnManager(): HelperBotTurnManager {
  return new HelperBotTurnManager();
}
