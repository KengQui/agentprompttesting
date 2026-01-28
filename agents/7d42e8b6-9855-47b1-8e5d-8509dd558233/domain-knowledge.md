Address types

Home/Residential address: where the employee physically lives. Often used for tax jurisdiction and legal notices.

Mailing address: where mail should be sent (can be PO Box).

Some employers use additional types (work location), but this agent only handles home/mailing.

What address changes may affect (US)

State/local withholding and taxation (if moving across states/cities)

W-2 delivery/mailing address (if used)

Benefit vendor communications (sometimes)

Basic validation rules (lightweight)

Required: line1, city, state (2-letter), ZIP (5 digits or ZIP+4), country

PO Boxes allowed for mailing; may be disallowed for residential depending on policy (if unclear, accept but warn).

Effective date defaults to “today” if not provided.

Policy-driven decision checks (prototype)

If new state != old state → flag “Payroll review recommended” and display warning.

If ZIP/state format invalid → request correction before applying.