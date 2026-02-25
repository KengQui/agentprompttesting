import type { PromptStyle, DomainDocument, SampleDataset } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

export interface PromptContext {
  name: string;
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  sampleDatasets?: SampleDataset[];
  validationRules?: string;
  guardrails?: string;
}

function getPersonalityPrompt(): string {
  try {
    const promptPath = path.join(process.cwd(), "personality-prompt.txt");
    return fs.readFileSync(promptPath, "utf-8").trim();
  } catch (error) {
    console.warn("Could not read personality-prompt.txt, using default");
    return "You are a helpful AI assistant.";
  }
}

const MAX_DOMAIN_KNOWLEDGE_CHARS = 50000;
const MAX_DOC_PREVIEW_CHARS = 10000;
const MAX_SAMPLE_DATA_CHARS = 30000;

function buildDomainKnowledgeSection(context: PromptContext): string {
  let section = "";
  let totalChars = 0;
  
  if (context.domainKnowledge) {
    const truncatedKnowledge = context.domainKnowledge.slice(0, MAX_DOMAIN_KNOWLEDGE_CHARS);
    section += truncatedKnowledge;
    totalChars += truncatedKnowledge.length;
  }
  
  if (context.domainDocuments && context.domainDocuments.length > 0) {
    if (section) section += "\n\n";
    section += "Reference Documents:";
    
    for (const doc of context.domainDocuments) {
      const remainingBudget = MAX_DOMAIN_KNOWLEDGE_CHARS - totalChars;
      if (remainingBudget <= 0) break;
      
      const maxDocChars = Math.min(MAX_DOC_PREVIEW_CHARS, remainingBudget);
      const truncatedContent = doc.content.slice(0, maxDocChars);
      const suffix = doc.content.length > maxDocChars ? "\n[Document truncated...]" : "";
      
      section += `\n\n--- ${doc.filename} ---\n${truncatedContent}${suffix}`;
      totalChars += truncatedContent.length + doc.filename.length + 20;
    }
  }
  
  return section;
}

function stripCodeBlocks(content: string): string {
  let cleaned = content.replace(/^```(?:json|csv|text|)?\s*\n?/gi, '');
  cleaned = cleaned.replace(/\n?```\s*$/gi, '');
  return cleaned.trim();
}

export function countRecordsInDataset(content: string, format: string): number {
  const cleaned = stripCodeBlocks(content);
  
  if (format === 'csv') {
    const lines = cleaned.split('\n').filter(l => l.trim());
    return Math.max(0, lines.length - 1);
  }
  
  if (format === 'json') {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
      const values = Object.values(parsed);
      const firstArray = values.find(v => Array.isArray(v));
      if (firstArray && Array.isArray(firstArray)) {
        return firstArray.length;
      }
      return 1;
    } catch {
      return 0;
    }
  }
  
  return 0;
}

function injectRowNumbers(csvContent: string): string {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length <= 1) return csvContent;
  
  const result: string[] = [];
  result.push("Row," + lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const spreadsheetRow = i + 1;
    result.push(spreadsheetRow + "," + lines[i]);
  }
  return result.join("\n");
}

function buildSampleDataSection(context: PromptContext): string {
  if (!context.sampleDatasets || context.sampleDatasets.length === 0) {
    return "";
  }
  
  let section = "USER'S DATA RECORDS - Use this data to answer questions about the user's personal information:\n";
  let totalChars = 0;
  let wasTruncated = false;
  
  for (const dataset of context.sampleDatasets) {
    const remainingBudget = MAX_SAMPLE_DATA_CHARS - totalChars;
    if (remainingBudget <= 0) {
      wasTruncated = true;
      break;
    }
    
    const cleanedContent = stripCodeBlocks(dataset.content);
    const numberedContent = dataset.format === 'csv' ? injectRowNumbers(cleanedContent) : cleanedContent;
    const maxDataChars = Math.min(MAX_DOC_PREVIEW_CHARS, remainingBudget);
    const truncatedContent = numberedContent.slice(0, maxDataChars);
    const datasetTruncated = numberedContent.length > maxDataChars;
    if (datasetTruncated) wasTruncated = true;
    const suffix = datasetTruncated ? "\n[Data truncated...]" : "";
    
    const recordCount = countRecordsInDataset(dataset.content, dataset.format);
    const countLabel = recordCount > 0 ? `Total records: ${recordCount}` : "";
    
    section += `\n--- ${dataset.name} (${dataset.format.toUpperCase()}) ---\n`;
    if (countLabel) {
      section += `${countLabel}\n`;
    }
    section += `${truncatedContent}${suffix}\n`;
    totalChars += truncatedContent.length + dataset.name.length + 30;
  }
  
  if (wasTruncated) {
    section += `\n[NOTE: Some data was truncated due to size limits. Only reference the records shown above. If you cannot see all records, tell the user you are showing a subset.]\n`;
  }
  
  return section;
}

export function generatePrompt(style: PromptStyle, context: PromptContext): string {
  const personality = getPersonalityPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  const sampleData = buildSampleDataSection(context);
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = `You are "${context.name}", an AI assistant.

## Current Date
Today is: ${currentDate}
Use this to understand relative time references like "last month", "last year", "this week", etc.

## Purpose
${context.businessUseCase}

## Personality & Behavior
${personality}`;

  if (domainKnowledge) {
    prompt += `

## Domain Knowledge
${domainKnowledge}`;
  }

  if (sampleData) {
    prompt += `

## User Data Records
${sampleData}

**CRITICAL INSTRUCTIONS FOR DATA ACCESS:**
- You HAVE ACCESS to the user's personal data shown above
- When the user asks about their pay, salary, deductions, or any personal records, ANALYZE the data above and respond with a clear, helpful answer
- DO NOT say you don't have access to their information - you DO have it above
- DO NOT generate code or tool calls - just read the data and provide the answer in plain English
- **NEVER output raw JSON, code blocks, or data dumps** - always provide human-readable explanations and summaries
- Respond naturally with specific numbers, dates, and insights from the data
- If the user asks about changes over time (like pay increases), compare the relevant records and explain what changed

**CRITICAL: DATA COUNT AND ROW NUMBER ACCURACY:**
- Each dataset above includes a "Total records" count. Use that exact number when stating how many records exist.
- If you display a table or list of records, the number of rows you display MUST match the count you state. Do NOT say "there are 3 employees" and then list 5.
- If data was truncated, clearly state "showing N of M total records" so the user knows not all data is visible.
- NEVER guess or estimate record counts — always count the actual records you can see in the data above before stating a number.
- CSV datasets have a "Row" column prepended as the first column. These row numbers match the user's spreadsheet (where row 1 is the header row). When referring to a specific data row, ALWAYS use the value in the "Row" column — do NOT count rows yourself or assign your own row numbers.
- ONLY use data values that actually appear in the dataset. NEVER fabricate, invent, or guess data values. If a field value is not visible in the data, say so rather than making one up.`;
  }

  if (context.validationRules) {
    prompt += `

## Validation Rules
${context.validationRules}`;
  }

  prompt += `

## Response Guidelines
- Be direct and precise in your responses
- Use the domain knowledge to inform accurate answers
- Stay focused on your defined purpose
- When the user asks about their personal data, use the provided data records to answer accurately
- Do not address the user by name in every response. Use their name sparingly, only when it adds clarity or on first greeting.
- CRITICAL: NEVER output placeholder text like "Describe your question or issue", "What can I help you with today?", or any template/help text. Always provide a real, substantive response. If you cannot answer, explain what you can help with instead.
- CRITICAL: NEVER output Python, JavaScript, or any other programming language code in your responses. If you need to demonstrate a calculation or logic, use only the custom expression language (e.g. If(), DateDiff(), And(), etc.) and plain English explanations.

## Request Faithfulness
- Carefully parse the user's request BEFORE acting — extract the exact calculation, logic, or output format they specified and follow it faithfully
- NEVER contradict or ignore what the user explicitly stated (e.g., if they say "percentage", the output must be a percentage, not a raw decimal; if they say "relative to X", use X as the reference point)
- Only ask clarifying questions when the request is genuinely ambiguous — do NOT ask for clarification on details the user already provided

## Clarification Consistency
- When a request IS genuinely ambiguous, identify ALL decision points that need clarification — not just the first one that comes to mind
- Ask about each one at a time, in order of impact — start with the most significant decision first
- The same type of ambiguous request should always surface the same set of clarifying questions regardless of session
- Ask only ONE question at a time — never ask multiple questions in a single response`;

  if (context.guardrails) {
    prompt += `

## Constraints (IMPORTANT - Follow Strictly)
${context.guardrails}
- If a request falls outside these constraints, politely decline and explain why`;
  }

  return prompt;
}

export function getPromptStyleDescription(style: PromptStyle): string {
  return "Uses Markdown headers with constraints placed at the end. Optimized for direct, structured responses.";
}
