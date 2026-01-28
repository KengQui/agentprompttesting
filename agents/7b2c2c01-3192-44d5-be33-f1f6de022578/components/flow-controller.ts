/**
 * Flow Controller - 1Payroll employee test 1
 * 
 * Define your conversation flow steps here.
 * Customize questions, validation, and help text.
 */

import { 
  FlowController as BaseFlowController, 
  FlowControllerConfig,
  FlowStep 
} from '../../../server/components/flow-controller';

const STEPS: FlowStep[] = [];

const CONFIG: FlowControllerConfig = {
  steps: STEPS,
  welcomeMessage: "Hello! I'm here to help with your payroll questions. What can I do for you?",
  completionMessage: "Thanks for chatting! Let me know if you need anything else."
};

export class PayrollEmployeeTest1FlowController extends BaseFlowController {
  constructor() {
    super(CONFIG);
  }
}

export function createFlowController(): PayrollEmployeeTest1FlowController {
  return new PayrollEmployeeTest1FlowController();
}
