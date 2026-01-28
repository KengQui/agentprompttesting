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
