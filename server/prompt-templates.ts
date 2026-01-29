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

// Helper to strip markdown code block markers from content
function stripCodeBlocks(content: string): string {
  // Remove opening code blocks like ```json, ```csv, ``` etc.
  let cleaned = content.replace(/^```(?:json|csv|text|)?\s*\n?/gi, '');
  // Remove closing code blocks
  cleaned = cleaned.replace(/\n?```\s*$/gi, '');
  return cleaned.trim();
}

function buildSampleDataSection(context: PromptContext): string {
  if (!context.sampleDatasets || context.sampleDatasets.length === 0) {
    return "";
  }
  
  let section = "USER'S DATA RECORDS - Use this data to answer questions about the user's personal information:\n";
  let totalChars = 0;
  
  for (const dataset of context.sampleDatasets) {
    const remainingBudget = MAX_SAMPLE_DATA_CHARS - totalChars;
    if (remainingBudget <= 0) break;
    
    // Strip code block markers from the content
    const cleanedContent = stripCodeBlocks(dataset.content);
    const maxDataChars = Math.min(MAX_DOC_PREVIEW_CHARS, remainingBudget);
    const truncatedContent = cleanedContent.slice(0, maxDataChars);
    const suffix = cleanedContent.length > maxDataChars ? "\n[Data truncated...]" : "";
    
    section += `\n--- ${dataset.name} (${dataset.format.toUpperCase()}) ---\n${truncatedContent}${suffix}\n`;
    totalChars += truncatedContent.length + dataset.name.length + 30;
  }
  
  return section;
}

export function generateAnthropicStylePrompt(context: PromptContext): string {
  const personality = getPersonalityPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  const sampleData = buildSampleDataSection(context);
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = `<role>
You are an AI assistant named "${context.name}".
${personality}
</role>

<current_date>
Today's date is: ${currentDate}
Use this to understand relative time references like "last month", "last year", "this week", etc.
</current_date>

<purpose>
${context.businessUseCase}
</purpose>`;

  if (domainKnowledge) {
    prompt += `

<context>
${domainKnowledge}
</context>`;
  }

  if (sampleData) {
    prompt += `

<data>
${sampleData}

CRITICAL INSTRUCTIONS FOR DATA ACCESS:
- You HAVE ACCESS to the user's personal data shown above
- When the user asks about their pay, salary, deductions, or any personal records, ANALYZE the data above and respond with a clear, helpful answer
- DO NOT say you don't have access to their information - you DO have it above
- DO NOT generate code or tool calls - just read the data and provide the answer in plain English
- NEVER output raw JSON or data dumps - always provide human-readable explanations and summaries
- Respond naturally with specific numbers, dates, and insights from the data
- If the user asks about changes over time (like pay increases), compare the relevant records and explain what changed
</data>`;
  }

  if (context.validationRules) {
    prompt += `

<rules>
${context.validationRules}
</rules>`;
  }

  if (context.guardrails) {
    prompt += `

<constraints>
${context.guardrails}
</constraints>`;
  }

  prompt += `

<instructions>
- Always be helpful, accurate, and stay within your defined scope
- If a request falls outside your capabilities or constraints, politely explain why you cannot assist
- Use the context and domain knowledge provided to inform your responses
- When the user asks about their personal data, use the provided data records to answer accurately
- Do not address the user by name in every response. Use their name sparingly, only when it adds clarity or on first greeting.
- CRITICAL: NEVER output placeholder text like "Describe your question or issue", "What can I help you with today?", or any template/help text. Always provide a real, substantive response. If you cannot answer, explain what you can help with instead.
</instructions>`;

  return prompt;
}

export function generateGeminiStylePrompt(context: PromptContext): string {
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
- If the user asks about changes over time (like pay increases), compare the relevant records and explain what changed`;
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
- CRITICAL: NEVER output placeholder text like "Describe your question or issue", "What can I help you with today?", or any template/help text. Always provide a real, substantive response. If you cannot answer, explain what you can help with instead.`;

  if (context.guardrails) {
    prompt += `

## Constraints (IMPORTANT - Follow Strictly)
${context.guardrails}
- If a request falls outside these constraints, politely decline and explain why`;
  }

  return prompt;
}

export function generateOpenAIStylePrompt(context: PromptContext): string {
  const personality = getPersonalityPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  const sampleData = buildSampleDataSection(context);
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = `# System Instructions

You are **${context.name}**, an AI assistant with the following configuration:

## Current Date
Today is: ${currentDate}
Use this to understand relative time references like "last month", "last year", "this week", etc.

## Role Definition
${personality}

## Primary Objective
${context.businessUseCase}`;

  if (domainKnowledge) {
    prompt += `

## Knowledge Base
Use the following information to inform your responses:

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
- If the user asks about changes over time (like pay increases), compare the relevant records and explain what changed`;
  }

  if (context.validationRules) {
    prompt += `

## Validation Requirements
Apply these rules when processing requests:
${context.validationRules}`;
  }

  if (context.guardrails) {
    prompt += `

## Guardrails & Restrictions
You MUST follow these guidelines:
${context.guardrails}`;
  }

  prompt += `

## Output Format
- Provide clear, well-structured responses
- When uncertain, acknowledge limitations honestly
- Stay within your defined scope and guardrails
- If you cannot help with a request, explain why politely
- When the user asks about their personal data, use the provided data records to answer accurately
- Do not address the user by name in every response. Use their name sparingly, only when it adds clarity or on first greeting.
- CRITICAL: NEVER output placeholder text like "Describe your question or issue", "What can I help you with today?", or any template/help text. Always provide a real, substantive response. If you cannot answer, explain what you can help with instead.`;

  return prompt;
}

export function generatePrompt(style: PromptStyle, context: PromptContext): string {
  switch (style) {
    case "anthropic":
      return generateAnthropicStylePrompt(context);
    case "gemini":
      return generateGeminiStylePrompt(context);
    case "openai":
      return generateOpenAIStylePrompt(context);
    default:
      return generateAnthropicStylePrompt(context);
  }
}

export function getPromptStyleDescription(style: PromptStyle): string {
  switch (style) {
    case "anthropic":
      return "Uses XML tags for clear section separation. Best for complex instructions with multiple components.";
    case "gemini":
      return "Uses Markdown headers with constraints placed at the end. Optimized for direct, structured responses.";
    case "openai":
      return "Uses Markdown with bold emphasis and explicit role definitions. Great for detailed instruction following.";
    default:
      return "";
  }
}
