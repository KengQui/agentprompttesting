export const businessUseCaseTemplate = `Help [user role] [accomplish what] through [interaction model]. When [trigger situation], the agent [orchestrates which actions]—all with [key differentiator like transparency/speed/accuracy].

---

Instructions: Replace the bracketed placeholders above with your specific details. Use the example below as a guide, then delete this instructions section.

Example:
Help frontline managers handle employee call-ins through a single natural-language command. When an employee calls in sick or absent, orchestrate all required actions: verify employee identity, classify the absence type, check accrual balances, update schedules, and convert the shift to an open shift—all with full transparency and confirmation before making any changes.`;

export const validationRulesTemplate = `# Input Validation Rules

## Required Fields
- Customer name must be provided
- Email must be valid format
- Order ID must match pattern: ORD-XXXXX

## Response Validation
- Never provide refund amounts over $500 without escalation
- Verify customer identity before sharing order details
- Check order status before providing tracking info`;

export const guardrailsTemplate = `# Agent Guardrails

## Content Restrictions
- Never discuss competitor products negatively
- Do not make promises about delivery times without checking
- Avoid discussing internal company policies in detail

## Safety Boundaries
- Redirect violent or harmful content requests
- Do not provide medical, legal, or financial advice
- Escalate to human agent for complex complaints`;

export const sampleDataTemplate = `[
  {
    "customer_id": "CUST-001",
    "name": "John Smith",
    "email": "john.smith@email.com",
    "order_id": "ORD-12345",
    "product": "Premium Widget",
    "status": "delivered",
    "amount": 149.99
  },
  {
    "customer_id": "CUST-002",
    "name": "Jane Doe",
    "email": "jane.doe@email.com",
    "order_id": "ORD-12346",
    "product": "Standard Widget",
    "status": "shipped",
    "amount": 79.99
  },
  {
    "customer_id": "CUST-003",
    "name": "Bob Johnson",
    "email": "bob.j@email.com",
    "order_id": "ORD-12347",
    "product": "Economy Widget",
    "status": "processing",
    "amount": 29.99
  }
]`;
