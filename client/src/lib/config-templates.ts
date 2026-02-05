export const businessUseCaseTemplate = `Help [user role] [accomplish what] through [interaction model]. When [trigger situation], the agent [orchestrates which actions]—all with [key differentiator like transparency/speed/accuracy].

---

Instructions: Replace the bracketed placeholders above with your specific details. Use the example below as a guide, then delete this instructions section.

Example:
Help frontline managers handle employee call-ins through a single natural-language command. When an employee calls in sick or absent, orchestrate all required actions: verify employee identity, classify the absence type, check accrual balances, update schedules, and convert the shift to an open shift—all with full transparency and confirmation before making any changes.`;

export const domainKnowledgeTemplate = `**Key Terms**
- [Term 1]: [Clear definition]
- [Term 2]: [Clear definition]

**How Things Connect**
[Explain relationships - e.g., "Employees are assigned to shifts"]

**Business Process**
[Explain the normal workflow and where this agent helps]

**System Context**
[Which HCM modules are involved - e.g., Time & Attendance, Payroll, Scheduling]

**User Context**
[Who uses this, when, and in what situations]

---

Instructions: Replace the bracketed placeholders above with your specific details. Use the example below as a guide, then delete this instructions section.

Example:

**Key Terms**
- Employee: A worker in your organization with an ID, name, position, and location
- Shift: A scheduled work period with a start time, end time, and assigned employee
- Accrual Balance: The amount of paid time off (like PTO or sick leave) an employee has available

**How Things Connect**
Employees are assigned to shifts. Each employee has accrual balances that track their available time off. When an employee can't work, their shift needs to be converted to an "open shift" so someone else can cover it.

**Business Process**
When an employee calls in, managers need to: verify who called in, decide how to classify the absence (PTO, sick, unpaid), check if they have enough accrued time, update the schedule, and make the shift available for coverage.

**System Context**
This process touches three HCM modules: Time & Attendance (for accrual tracking), Workforce Management (for scheduling), and Payroll (for pay calculation).

**User Context**
Frontline managers handle call-ins in real-time during shift start times and need quick resolution.`;

export const validationRulesTemplate = `**[Validation Category Name]**
[When to check]: [What to verify]
[What to do if validation fails]: [Specific action]

Example: "[Show exact message the user would see]"

---

Instructions: Replace the bracketed placeholders above with your specific details. Use the examples below as a guide, then delete this instructions section.

Example:

**Employee Identity Verification**
If the name provided doesn't exactly match one employee record, ask for clarification listing possible matches with their employee IDs.

Example: "Which person did you mean: Susan Jones (E12345) or Susanne Jones (E67890)?"

**Balance Check**
Before using accrued time off, check if the employee has enough hours. If not, warn them and present options.

Example: "Susan's PTO balance is 2.0 hours; the shift is 6.0 hours. Would you like to: (A) apply 2.0 hours PTO and 4.0 hours unpaid, (B) apply 6.0 hours unpaid, or (C) cancel?"`;

export const guardrailsTemplate = `**Always:**
- [Action verb] [specific requirement] [optional: when/why]
- [Action verb] [specific requirement] [optional: when/why]

**Never:**
- [Prohibited action] [optional: reason]
- [Prohibited action] [optional: what to do instead]
- [Out of scope feature] (out of scope for [version/reason])

---

Instructions: Replace the bracketed placeholders above with your specific details. Use the example below as a guide, then delete this instructions section.

Example:

**Always:**
- Verify employee identity when there is any name ambiguity
- Ask which type of absence to apply (PTO, sick, unpaid)—never choose automatically
- Check balance before using accrued time off
- Show a confirmation summary before making any changes
- Create an audit log entry for every change

**Never:**
- Assume which employee is meant when names are ambiguous
- Overdraft accrual balances without explicit manager approval
- Make changes without showing a confirmation first
- Update one system but fail to update related systems (all-or-nothing)
- Automatically assign someone else to cover the shift (out of scope)
- Modify disciplinary records or attendance points (out of scope)`;

export const sampleDataTemplate = `{
  "[data_type_plural]": [
    {
      "id_field": "unique_id",
      "field1": "value",
      "field2": 123
    }
  ]
}

---

Instructions: Replace the structure above with your specific data types. Use the example below as a guide, then delete this instructions section.

Data Design Tips:
- Cover validation scenarios: Include data that triggers your validation rules
- Show connections: Use consistent IDs across related data types
- Include edge cases: Zero balances, duplicate names, already-open shifts
- Keep it minimal: 2-4 examples per data type is usually enough
- Use realistic formats: Dates as YYYY-MM-DD, Times as HH:MM

Example:

{
  "employees": [
    {
      "employee_id": "E12345",
      "first_name": "Susan",
      "last_name": "Jones",
      "location": "Store 101",
      "job_title": "Cashier"
    },
    {
      "employee_id": "E67890",
      "first_name": "Susanne",
      "last_name": "Jones",
      "location": "Store 101",
      "job_title": "Cashier"
    }
  ],
  "accrual_balances": [
    {
      "employee_id": "E12345",
      "accrual_type": "PTO",
      "balance_hours": 44.3
    },
    {
      "employee_id": "E67890",
      "accrual_type": "PTO",
      "balance_hours": 3.5
    }
  ],
  "shifts": [
    {
      "shift_id": "SFT1001",
      "date": "2026-02-03",
      "start_time": "09:00",
      "end_time": "15:00",
      "duration_hours": 6.0,
      "assigned_employee_id": "E12345",
      "status": "assigned"
    }
  ]
}`;
