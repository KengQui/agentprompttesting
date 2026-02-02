/**
 * Flow Controller - Life event 2
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

export class Lifeevent2FlowController extends BaseFlowController {
  constructor() {
    super(CONFIG);
  }
}

export function createFlowController(): Lifeevent2FlowController {
  return new Lifeevent2FlowController();
}
