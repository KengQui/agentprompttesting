/**
 * Flow Controller - MultiFile Test Agent ypCl2E
 * 
 * Define your conversation flow steps here.
 * Customize questions, validation, and help text.
 */

import { 
  FlowController as BaseFlowController, 
  FlowControllerConfig,
  FlowStep 
} from '../../../server/components/flow-controller';

const STEPS: FlowStep[] = [
  {
    id: 'greeting',
    question: "What can I help you with today?",
    field: 'initial_request',
    type: 'text',
    helpText: 'Describe your question or issue.'
  }
];

const CONFIG: FlowControllerConfig = {
  steps: STEPS,
  welcomeMessage: "Hello! I'm here to help. What can I do for you?",
  completionMessage: "Thanks for chatting! Let me know if you need anything else."
};

export class MultiFileTestAgentypCl2EFlowController extends BaseFlowController {
  constructor() {
    super(CONFIG);
  }
}

export function createFlowController(): MultiFileTestAgentypCl2EFlowController {
  return new MultiFileTestAgentypCl2EFlowController();
}
