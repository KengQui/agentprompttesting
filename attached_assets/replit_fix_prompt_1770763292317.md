# REPLIT AGENT PROMPT: Fix Expression Builder Issues 1, 2, and 5

I need you to make the following changes to the HCM Report Custom Column Expression Builder agent:

---

## ISSUE 1: Column Name Formatting Inconsistency

**Current Problem:**
The agent's expression output uses square brackets around column names like `[Scheduled EE Amount]`, but this is inconsistent with the Custom Columns Expressions Encyclopedia syntax, which uses plain column names without brackets (e.g., `EmplPrimaryEmail`, `ScheduledEEAmount`).

Additionally, when showing validation calculations, the agent displays hardcoded string values like `Add(Value("285.50"), Value("142.75"))` instead of showing the actual column references in the expression.

**Required Changes:**

1. **Remove square brackets from all column references in generated expressions.** Column names should be referenced as plain identifiers, not wrapped in brackets.

   Example:
   - ❌ WRONG: `Add(Value([Scheduled EE Amount]), Value([Scheduled ER Amount]))`
   - ✅ CORRECT: `Add(value(ScheduledEEAmount), value(ScheduledERAmount))`

2. **Use consistent column name formatting.** If the actual column name in the report contains spaces (like "Scheduled EE Amount"), convert it to camelCase or remove spaces when referenced in expressions (like `ScheduledEEAmount`).

3. **When displaying validation/preview calculations, show the formula WITH column names first, then show the evaluated result.**

   Example format:
   ```
   Calculation: Add(value(ScheduledEEAmount), value(ScheduledERAmount))
                = Add(value(285.50), value(142.75))
                = 285.50 + 142.75 
                = $428.25
   ```

   NOT:
   ```
   Calculation: Add(Value("285.50"), Value("142.75")) = 285.50 + 142.75 = $428.25
   ```

---

## ISSUE 2: Missing Column Name Suggestion

**Current Problem:**
When the agent generates an expression, it does not suggest a name for the new custom column. This forces the user to come up with their own name, which might not follow naming conventions or clearly describe what the column does.

**Required Changes:**

1. **After generating an expression, always suggest a descriptive column name** based on what the expression does.

2. **Include the suggested column name in the agent's response** right after showing the expression and before asking for validation.

   Example response format:
   ```
   Here's the expression to add the 'Scheduled EE Amount' and 'Scheduled ER Amount' columns:

   Expression: Add(value(ScheduledEEAmount), value(ScheduledERAmount))

   Suggested Column Name: Total Scheduled Contribution

   Output Type: Amount

   Would you like me to validate this logic against a few rows from your report data?
   ```

3. **The suggested column name should:**
   - Be descriptive and clearly indicate what the column calculates
   - Use title case (e.g., "Total Scheduled Contribution", not "total scheduled contribution")
   - Be concise (ideally 2-5 words)
   - Follow common naming patterns:
     - For sums/totals: "Total [Thing]", "Combined [Thing]"
     - For calculations: "[Metric] Calculation", "[Thing] Result"
     - For conditionals: "[Category] Status", "[Thing] Label", "[Thing] Classification"
     - For dates: "Days to [Event]", "[Thing] Date Difference"
     - For percentages: "[Thing] Percentage", "[Thing] as % of [Total]"

---

## ISSUE 5: Validation Uses Hardcoded Rows Without Employee Identifiers

**Current Problem:**
When showing validation/preview output, the agent displays "Row 1" and "Row 2" without identifying which employees these rows represent. This makes it hard for users to verify the calculations are correct, especially in large reports.

**Required Changes:**

1. **Include employee identifiers in validation output.** Use the first available identifier column from the report data (typically Employee ID, Employee Name, or a combination).

2. **Show 3-5 rows in the validation preview** instead of just 2, to give users a better sense of how the expression behaves across different data scenarios.

3. **Format the validation output to include:**
   - Row number
   - Employee identifier (ID and/or Name)
   - Input column values used in the calculation
   - The expression with column names
   - The evaluated result

   Example format:
   ```
   Here are a few rows from your data, showing the calculation in action:

   Row 1 (EMP001 - Sarah Johnson):
     • Scheduled EE Amount: $285.50
     • Scheduled ER Amount: $142.75
     • Calculation: Add(value(ScheduledEEAmount), value(ScheduledERAmount))
                   = 285.50 + 142.75 = $428.25

   Row 2 (EMP002 - Michael Chen):
     • Scheduled EE Amount: $195.00
     • Scheduled ER Amount: $97.50
     • Calculation: Add(value(ScheduledEEAmount), value(ScheduledERAmount))
                   = 195.00 + 97.50 = $292.50

   Row 3 (EMP003 - Emily Rodriguez):
     • Scheduled EE Amount: $450.00
     • Scheduled ER Amount: $225.00
     • Calculation: Add(value(ScheduledEEAmount), value(ScheduledERAmount))
                   = 450.00 + 225.00 = $675.00

   As you can see, the expression adds the employee and employer contribution amounts for each row.

   Does this look correct?
   ```

---

## TESTING REQUIREMENTS

After making these changes, test with the following user prompt:

**User prompt:**
"I want to create a column that adds the Scheduled EE Amount and Scheduled ER Amount"

**Expected agent response should include:**

1. ✅ Expression WITHOUT square brackets: `Add(value(ScheduledEEAmount), value(ScheduledERAmount))`
2. ✅ Suggested column name: "Total Scheduled Contribution" (or similar descriptive name)
3. ✅ Output type: "Amount"
4. ✅ Validation preview showing:
   - 3-5 rows
   - Employee IDs and names (e.g., "EMP001 - Sarah Johnson")
   - Input values with labels
   - Expression with column names shown in the calculation
   - Final calculated results

---

## ADDITIONAL NOTES

- All three issues should be fixed together in a single update
- Maintain all existing functionality (expression generation, troubleshooting, explanation, etc.)
- Do not change the conversational tone or flow — only fix the technical output formatting
- Ensure the fixes work for ALL expression types (math, conditional, concatenation, string functions, date functions)
- Make sure the agent still properly wraps text columns with `value()` when needed for arithmetic operations

---

## IMPLEMENTATION CHECKLIST

Before marking this task complete, verify:

- [ ] Column references in expressions no longer use square brackets
- [ ] Column names are formatted consistently (camelCase or no spaces)
- [ ] Every generated expression includes a suggested column name
- [ ] Validation preview shows 3-5 rows instead of 2
- [ ] Validation rows include employee identifiers (ID + Name)
- [ ] Validation calculations show the expression with column names before showing evaluated results
- [ ] All changes work across different expression types (tested with at least 3 different user prompts)
