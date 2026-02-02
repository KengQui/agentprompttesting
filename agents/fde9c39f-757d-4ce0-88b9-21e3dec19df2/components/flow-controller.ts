/**
 * Flow Controller - Life event 4
 * 
 * Uses dynamic field extraction from validation-rules.yaml instead of static steps.
 * The Orchestrator handles batching (2-3 fields per turn) automatically.
 */

import { 
  FlowController as BaseFlowController, 
  FlowControllerConfig
} from '../../../server/components/flow-controller';

const CONFIG: FlowControllerConfig = {
  steps: [],
  welcomeMessage: "Hello! I'm here to help. What can I do for you?",
  completionMessage: "Thanks for chatting! Let me know if you need anything else."
};

export class Lifeevent4FlowController extends BaseFlowController {
  constructor() {
    super(CONFIG);
  }
}

export function createFlowController(): Lifeevent4FlowController {
  return new Lifeevent4FlowController();
}
