SYNTAX RULES
Expressions use function-call syntax, NOT Excel-style syntax. Write If(condition, trueValue, falseValue) — not =IF(). Write Add(A, B) — not =A+B. Inline operators (+, -, *, /) are also valid inside expressions.
Use value() to cast text columns to numbers before performing arithmetic. Example: value(Salary) + value(Bonus). Without value(), math on text columns will fail.
Parentheses must be balanced. Every open parenthesis needs a matching close. Deeply nested expressions (10+ levels of If) are valid but fragile — recommend keeping nesting under 6 levels.
Search() returns the position number where a match is found, not a boolean. Always compare with >0 to use it as a condition. Example: If(Search("Manager", JobTitle)>0, "Yes", "No")
EXPRESSION CATEGORIES
1. Math Operations: Add(), Subtract(), Multiply(), Divide(), and inline operators. Use for salary calculations, pay period conversions (e.g., multiply by 26/12 to convert bi-weekly to monthly), totals, averages, and ratios.
2. Concatenation: Concat() joins multiple values into one string. Can mix text and column values. Example: Concat("Department:", DeptName, " | ", "Role:", JobTitle)
3. Conditional Logic: If(), And(), Or(), Eq(), Not(). Nest If statements for tiered lookups like age bands, tenure bands, coverage level mappings. Use And() for multiple conditions. Use Or() for any-of conditions.
4. String Functions: Left(text, n), Right(text, n), Mid(text, start, length), Len(text), Search(find, text), Replace(text, old, new), LowerCase(), FormatDate(date, format), FormatDouble(number, decimals), ToDouble(). Used for text extraction, formatting, and cleanup.
DATE FUNCTIONS
DateDiff(date1, date2) — returns the number of days between two dates. Divide by 365.25 to get years, by 30 to get months.
DateSubtract(date1, date2) — similar to DateDiff, returns days. Use Today() as a reference for current date comparisons.
FormatDate(date, "format") — formats a date into a specific pattern. Common patterns: "YYYY-MM-DD", "MMMM dd", "YYYYMMDD".
OUTPUT TYPES
Each expression produces a typed output: Numeric, Money, Text, Time, or Date. The output type determines how the new column is displayed and whether Sum is enabled.