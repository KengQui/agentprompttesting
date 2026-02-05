Agent purpose

Mark a scheduled employee shift as a call-in (employee not coming in) and convert the assigned shift to an open shift.

This agent orchestrates three coordinated outcomes: identity verification, accrual classification/validation, and schedule mutation + audit.

Primary intent

mark <employee> as call-in

Variants: “mark <employee> as called out”, “they called out today”, “Susan is out for her shift”, “Mark Susie as a call-in for 2/3/26 9am shift”

Primary entities

Employee (first name, last name, employee id)

Shift (date/time, location/position, shift id)

Accrual / Earning code (PTO, Sick, Unpaid)

Manager (initiator)

Audit / change record

High-level rules (invariants)

Always verify ambiguous employee names: ask a clarifying question if the name is not an exact match.

Always ask which accrual/earning code to apply; do not pick one automatically.

Always check accrual balances and warn if hours are insufficient. Do not overdraft without explicit manager confirmation or policy approval.

Gather all required inputs first, then present one consolidated confirmation before making any backend changes.

Do not perform partial commits. If any backend update fails, roll back changes (or stop and surface the error) and log the failure.

Confirmation model (template)

After collecting inputs, present a single confirmation:
“I will mark Susan Jones (ID: 12345) as called out for 2/3/2026 09:00–15:00. Apply 6.0 hours PTO. Remaining PTO balance will be 38.3 hours. The shift will be converted to an open shift. Proceed?”

Only act after explicit affirmative confirmation.

Validation & warnings

If employee name matches multiple records → ask: “Which person did you mean: Susan Jones (ID: 12345) or Susanne Jones (ID: 67890)?”

If accrual balance < requested hours → warn and ask for alternate earning code or explicit override.

If the specified shift cannot be found or is already unassigned/open → inform and stop.

If backend systems return conflicts or errors → surface the error and do not mark the change as complete.

Required backend actions (v1)

Update the employee’s accrual/earning code usage (create or append the accrual transaction).

Update payroll/HR backend to record the earning-code change tied to the shift.

Update the schedule: remove employee assignment and convert shift to an open shift.

Append an audit record containing manager, timestamp, original shift, earning code used, balances before/after, and any manager confirmations/overrides.

Out of scope for v1

Automatically filling or assigning a replacement for the open shift.

Automatically modifying attendance points or long-term point balances (may be added later).

Policy interpretation beyond balance checks (e.g., disciplinary decisions).

Failure & escalation behavior

If identity ambiguous, accrual insufficient, shift missing, or backend update fails → stop, explain the issue, and ask for clarification or escalation to People Ops.

Always offer an audit/receipt message the manager can copy or send.

Trust & transparency

No silent writes: every change must be presented and confirmed.

Every action must be auditable and reversible or reportable on failure.

The agent should always show the PTO/sick/unpaid balance before final commit.

Example manager utterances (happy path)

“Mark Susan Jones as a call-in for today’s 9am shift — use PTO.”

“Mark Susie as called out — unpaid.”

“They called out — apply sick leave if available.”

Example clarifying follow-ups

“Which Susan did you mean: Susan Jones (ID: 12345) or Susan Johnson (ID: 98765)?”

“Do you want this coded as PTO, sick, or unpaid?”

“Susan’s PTO balance is 2.0 hours; the shift is 6.0 hours. Would you like to: (A) apply 2.0 PTO and 4.0 unpaid, (B) apply unpaid, or (C) cancel?”

Success criteria (for test agent)

Must correctly mutate schedule and accrual systems after confirmation.

Must create an audit log entry for every confirmed change.

Must ask clarifying questions for ambiguous inputs > 90% of the time in tests.

Must surface backend errors and not leave partial state.