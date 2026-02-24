IMPORTANT: ONLY the functions listed below are valid. Do NOT use any function not on this list (e.g., IsBlank, IsEmpty, SUM, VLOOKUP, COUNTIF are all INVALID). To check if a field is empty, use =="" comparison (e.g., EmplPrimaryEmail==""). To check if a field is not empty, use !="" or Len(field)>0.

SYNTAX RULES
Expressions use function-call syntax, NOT Excel-style syntax. Write If(condition, trueValue, falseValue) — not =IF(). Write Add(A, B) — not =A+B. Inline operators (+, -, *, /) are also valid inside expressions.
Parentheses must be balanced. Every open parenthesis needs a matching close. Recommend keeping nesting under 6 levels.

BASIC MODE vs ADVANCED MODE
The expression builder has two modes. The agent always builds expressions for **Basic Mode** unless the user explicitly says they are using Advanced Mode.
- **Basic Mode:** Column variables used in arithmetic or comparisons must be wrapped in `Value()`. For example: `Add(Value(TotalTimeByTACounter_xxx), Value(TotalTimeByTACounter_xxx))`. Without `Value()`, your custom column will show results, but you won't be able to sort employees by that value, subtotal by department, or add it to a chart. `Value()` is the basic-mode way of referencing column values so the system can process them correctly.
- **Advanced Mode:** Column variables are referenced directly without `Value()`. For example: `Add(TotalTimeByTACounter_xxx, TotalTimeByTACounter_xxx)`. The system handles column referencing natively in this mode.
- Some functions and columns are not yet supported in Advanced Mode (e.g., DateSubtract, certain HR Custom Fields, counter-aligned cost center columns). Advanced Mode also has a 500-character expression limit.
- **User opt-out behavior:** If a user says they don't need sorting, grouping, or filtering, the agent should ask a clarifying question before removing `Value()` — confirming the user understands the trade-offs (you won't be able to sort employees by it, subtotal by department, or add it to a chart). The agent should never silently switch modes.
Search() returns the position number where a match is found, not a boolean. Always compare with >0 to use it as a condition.

SUPPORTED OPERATORS
Arithmetic: +, -, *, /
Comparison: =, ==, !=, >=, <=, >, <
Logical: && (AND), || (OR)

VALID FUNCTIONS — COMPLETE REFERENCE

Comparison and Logic:
- Eq(text1, text2) — returns true if two text values are equal
- If(test_value, value_if_true, value_if_false) — conditional logic
- In(val_to_find, in_val1, in_val2, ..., in_valN) — returns true if first value matches any listed value
- Max(num1, num2) — returns the larger of two numbers
- Min(num1, num2) — returns the smaller of two numbers
- Not(value_to_negate) — reverses a logical value
- Or(logical1, logical2, ..., logicalN) — returns true if any condition is true
- And(logical1, logical2, ..., logicalN) — returns true only if all conditions are true

Date Functions:
- AddDays(date, n) — adds n days to a date
- DateDiff(date1, date2) — returns difference in days between two dates
- DateSubtract(date1, date2) — returns difference in days (similar to DateDiff)
- FormatDate(date, pattern) — formats a date (patterns: "YYYY-MM-DD", "MMMM dd", "YYYYMMDD")
- GetDay(date) — returns the day portion of a date
- GetMonth(date) — returns the month from a date
- GetWeekday(date) — returns the weekday name from a date
- GetYear(date) — returns the year from a date
- MonthEnd(date) — returns the last day of the month
- MonthStart(date) — returns the first day of the month
- Today() — returns the current UTC date
- Today(timezone) — returns the current date for a specified timezone (e.g., "Eastern")

Numeric Functions:
- Add(number1, number2, ...) — adds two or more numbers
- Ceiling(val, prec) — rounds up to nearest increment
- Divide(number1, number2) — divides one number by another
- Floor(val, prec) — rounds down to nearest increment
- MRound(val, prec) — rounds to nearest increment of precision
- Multiply(number1, number2, ...) — multiplies two or more numbers
- Round(val, prec) — rounds to specified decimal places
- RoundUp(val, prec) — rounds up, away from zero
- RoundDown(val, prec) — rounds down, toward zero
- Subtract(number1, number2) — subtracts second from first
- Value(column) — wraps a column reference for use in Basic Mode expressions. Required in Basic Mode for arithmetic, comparisons, and to enable sorting/grouping/filtering on the resulting column. Not needed in Advanced Mode.
- ToDouble(text) — converts text to a double-precision number (alternative to Value() for numeric conversion)

String Functions:
- Concat(text1, text2, ...) — joins multiple text strings together
- Left(text, num_chars) — returns characters from left of string
- Len(text) — returns length of text
- LowerCase(text) — converts text to lowercase
- Mid(text, start_num, num_chars) — extracts substring at specified position
- PadLeft(text, num_chars, pad_with) — pads text from left
- PadRight(text, num_chars, pad_with) — pads text from right
- Replace(str, old_str, new_str) — replaces part of text with new text
- Right(text, num_chars) — returns characters from right of string
- Search(find_text, within_text, start_num) — returns position of text within another string
- UpperCase(text) — converts text to uppercase
- FormatDouble(number, decimals) — formats a number with specified decimal places
- ToHHMM(value) — converts a value to time format (HH:MM)