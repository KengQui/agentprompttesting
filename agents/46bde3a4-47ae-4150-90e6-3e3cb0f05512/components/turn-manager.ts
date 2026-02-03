/**
 * Turn Manager - Draft-Test-QutyXq
 * 
 * Customized intent classification for this agent.
 * Modify keywords to match your domain-specific language.
 * 
 * TEMPLATE NOTE: When adding new features to agent turn management,
 * update this template file so new agents automatically get those features.
 */

import { TurnManager as BaseTurnManager, TurnManagerConfig } from '../../../server/components/turn-manager';

const CONFIG: TurnManagerConfig = {
  useLlmFallback: true,
  
  goBackKeywords: ['back', 'previous', 'return', 'undo', 'earlier', 'start over'],
  
  correctionKeywords: [
    'change', 'actually', 'meant', 'should be', 'revise', 'update', 
    'i mean', 'correct the', 'correction', 'let me rephrase'
  ],
  
  clarificationKeywords: [
    'what', 'how', 'why', 'explain', 'help', "don't understand",
    'tell me', 'can you', 'could you', 'would you', 'describe',
    'confused', 'clarify', 'understand', 'more info', 'details'
  ],
  
  confirmationKeywords: [
    'yes', 'yeah', 'yep', 'y', 'yup', 'sure', 'ok', 'okay',
    'confirm', 'correct', 'right', "that's right", 'looks good',
    'sounds good', 'that works', 'perfect', 'great', 'thanks'
  ],
  
  rejectionKeywords: [
    'no', 'nope', 'n', 'nah', 'not quite', 'not exactly', 'not right',
    'incorrect', 'wrong', 'disagree', 'not what i meant'
  ]
};

export class DraftTestQutyXqTurnManager extends BaseTurnManager {
  constructor() {
    super(CONFIG);
  }
}

export function createTurnManager(): DraftTestQutyXqTurnManager {
  return new DraftTestQutyXqTurnManager();
}
