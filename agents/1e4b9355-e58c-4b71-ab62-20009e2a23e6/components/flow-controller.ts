/**
 * Flow Controller - Helper Bot
 * 
 * Customized flow for customer support assistance.
 * 
 * This is a general helper bot, so the flow is open-ended
 * rather than a strict step-by-step process.
 */

import { 
  FlowController as BaseFlowController, 
  FlowControllerConfig,
  FlowStep 
} from '../../../server/components/flow-controller';

const HELPER_BOT_STEPS: FlowStep[] = [
  {
    id: 'greeting',
    question: "What can I help you with today?",
    field: 'initial_request',
    type: 'text',
    helpText: 'Describe your question or issue and I\'ll do my best to assist you.'
  },
  {
    id: 'details',
    question: "Can you provide more details about your request?",
    field: 'details',
    type: 'text',
    helpText: 'Any additional context will help me give you a better answer.'
  },
  {
    id: 'followup',
    question: "Is there anything else you'd like to know?",
    field: 'followup',
    type: 'text',
    helpText: 'Feel free to ask follow-up questions or request clarification.'
  }
];

const HELPER_BOT_CONFIG: FlowControllerConfig = {
  steps: HELPER_BOT_STEPS,
  welcomeMessage: "Hello! I'm your Helper Bot. I'm here to assist you with any questions you might have.",
  completionMessage: "Thanks for chatting with me! If you have more questions in the future, I'm always here to help."
};

export class HelperBotFlowController extends BaseFlowController {
  constructor() {
    super(HELPER_BOT_CONFIG);
  }
}

export function createFlowController(): HelperBotFlowController {
  return new HelperBotFlowController();
}
