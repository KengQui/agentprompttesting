Call-in management is a Time & Attendance (T&A) function within HCM systems that coordinates workforce scheduling, accrual tracking, and payroll classification when employees cannot work scheduled shifts.

**HCM Module Integration**
The call-in process touches multiple HCM modules:
- Time & Attendance: Accrual balances, earning code classification
- Workforce Management: Shift scheduling, coverage management
- Payroll: Earning code records for pay calculation
- Core HR: Employee identity and employment status

**Core Entities**
- Employee: Worker record with identity, position, department, and accrual balances
- Scheduled Shift: A planned work period with assigned employee, date/time, location, and position
- Earning Code: Company-specific classification for time worked or not worked (examples: PTO, Sick, Unpaid, Bereavement, Jury Duty)
- Accrual Balance: Accumulated hours for paid time off that employees can use
- Manager: Supervisor who initiates call-in processing for their team
- Audit Trail: Compliance record of all T&A transactions

**Accrual System**
Employees accumulate paid time off based on company policy (e.g., accruing hours per pay period). When employees use accrued time, hours are deducted from their balance. Balances cannot go negative without explicit override. Different accrual types are tracked separately with independent balances. Each company configures which accrual types are available based on their policies and benefit structures.

**Shift Lifecycle**
- Assigned Shift: Has an employee_id assigned, shift status shows "assigned"
- Open Shift: No employee assigned, shift status shows "open" and needs coverage
- When an employee calls in, their assigned shift converts to an open shift available for other employees to claim or for managers to fill

**Earning Code Classification**
Every hour not worked must be classified with an earning code for payroll processing. The specific earning codes available depend on company configuration. Common categories include:
- Paid time off using accrued balances (examples: PTO, Vacation, Sick Leave, Personal Time)
- Paid time without accrual requirements (examples: Bereavement, Jury Duty, Emergency Leave)
- Unpaid absences (no pay, no accrual usage)

Some earning codes require checking accrual balances before use, while others do not. The manager must specify which earning code to apply for each call-in. Earning codes determine both pay calculation and accrual deductions.

**Multi-System Coordination**
A single call-in triggers updates across multiple systems:
- Accrual ledger: Records balance deduction if applicable
- Payroll staging: Creates earning code record for the pay period
- Schedule: Updates shift assignment and status
- Audit log: Records who made what change when for compliance

**Manager Context**
Frontline managers handle call-ins in real-time, often during shift start times. They need quick resolution without navigating multiple HCM screens. Manual errors in earning code selection or balance checking create payroll discrepancies and compliance issues. The agent must present options clearly and execute changes safely after confirmation.