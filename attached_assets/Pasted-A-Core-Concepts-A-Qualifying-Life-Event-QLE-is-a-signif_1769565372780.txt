A) Core Concepts

A Qualifying Life Event (QLE) is a significant change that may allow benefit changes outside open enrollment.

Changes must be consistent with the event.

Most employers require submission within a set window (commonly 30 days, sometimes 60).

Effective dates vary by employer and plan rules (often event date or first of next month).

B) Common QLE types

Marriage

Divorce/legal separation

Birth/adoption/placement

Death of spouse/dependent

Loss/gain of other coverage

Move that changes plan availability

Work status change affecting eligibility

Dependent becomes ineligible/eligible

C) Typical documents

Marriage: marriage certificate

Divorce: divorce decree/court order

Birth: hospital record/birth certificate

Adoption/placement: placement/adoption documents

Loss of coverage: termination letter/COBRA notice

Move: proof of new address (if needed)

Death: death certificate (if needed)

D) Policy-driven decision table (generic)
{
  "submission_window_days_typical": 30,
  "events": {
    "Marriage": {
      "allowed_changes_typical": ["Add spouse", "Change plan tier", "Update beneficiaries"],
      "docs_typical": ["Marriage certificate"],
      "effective_date_typical": ["Event date or first of next month (policy-specific)"]
    },
    "Divorce/Legal Separation": {
      "allowed_changes_typical": ["Remove spouse", "Change plan tier", "Update beneficiaries"],
      "docs_typical": ["Divorce decree/court order"],
      "effective_date_typical": ["Event date or end of month (policy-specific)"]
    },
    "Birth": {
      "allowed_changes_typical": ["Add child", "Change plan tier", "Enroll if previously waived (policy-specific)"],
      "docs_typical": ["Hospital record/birth certificate"],
      "effective_date_typical": ["Often date of birth; payroll timing varies"]
    },
    "Adoption/Placement": {
      "allowed_changes_typical": ["Add child", "Change plan tier"],
      "docs_typical": ["Placement/adoption paperwork"],
      "effective_date_typical": ["Often placement date (policy-specific)"]
    },
    "Loss of Other Coverage": {
      "allowed_changes_typical": ["Enroll in plans", "Add dependents who lost coverage"],
      "docs_typical": ["Coverage termination letter/COBRA notice"],
      "effective_date_typical": ["Often day after loss to avoid gap (policy-specific)"]
    },
    "Move Affecting Plan Availability": {
      "allowed_changes_typical": ["Change plan if current plan not available", "Update address"],
      "docs_typical": ["Proof of address (if required)"],
      "effective_date_typical": ["Often first of next month (policy-specific)"]
    }
  }
}