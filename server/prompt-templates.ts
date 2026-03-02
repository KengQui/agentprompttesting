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

let brytePromptCache: string | null = null;

export function invalidateBrytePromptCache(): void {
  brytePromptCache = null;
}

export function getBryteSystemPrompt(): string {
  if (brytePromptCache !== null) {
    return brytePromptCache;
  }

  try {
    const mdPath = path.join(process.cwd(), "bryte-system-prompt.md");
    brytePromptCache = fs.readFileSync(mdPath, "utf-8").trim();
    return brytePromptCache;
  } catch {
    try {
      const txtPath = path.join(process.cwd(), "personality-prompt.txt");
      brytePromptCache = fs.readFileSync(txtPath, "utf-8").trim();
      return brytePromptCache;
    } catch {
      console.warn("Could not read bryte-system-prompt.md or personality-prompt.txt, using default");
      const fallback = "You are a helpful, friendly, and professional AI assistant.";
      brytePromptCache = fallback;
      return fallback;
    }
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
  const bryteGlobalPrompt = getBryteSystemPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  const sampleData = buildSampleDataSection(context);
  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = `# TIER 1 — BRYTE GLOBAL GUIDELINES
${bryteGlobalPrompt}

---

# TIER 2 — AGENT-SPECIFIC CONFIGURATION

You are "${context.name}", an AI assistant.

## Current Date
Today is: ${currentDate}
Use this to understand relative time references like "last month", "last year", "this week", etc.

## Purpose
${context.businessUseCase}`;

  if (domainKnowledge) {
    prompt += `

## Domain Knowledge
${domainKnowledge}`;
  }

  if (sampleData) {
    prompt += `

## User Data Records
${sampleData}`;
  }

  if (context.validationRules) {
    prompt += `

## Validation Rules
${context.validationRules}`;
  }

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
