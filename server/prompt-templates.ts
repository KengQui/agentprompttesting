import type { PromptStyle, DomainDocument } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";

export interface PromptContext {
  name: string;
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
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

function buildDomainKnowledgeSection(context: PromptContext): string {
  let section = "";
  
  if (context.domainKnowledge) {
    section += context.domainKnowledge;
  }
  
  if (context.domainDocuments && context.domainDocuments.length > 0) {
    if (section) section += "\n\n";
    section += "Reference Documents:";
    for (const doc of context.domainDocuments) {
      section += `\n\n--- ${doc.filename} ---\n${doc.content}`;
    }
  }
  
  return section;
}

export function generateAnthropicStylePrompt(context: PromptContext): string {
  const personality = getPersonalityPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  
  let prompt = `<role>
You are an AI assistant named "${context.name}".
${personality}
</role>

<purpose>
${context.businessUseCase}
</purpose>`;

  if (domainKnowledge) {
    prompt += `

<context>
${domainKnowledge}
</context>`;
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
</instructions>`;

  return prompt;
}

export function generateGeminiStylePrompt(context: PromptContext): string {
  const personality = getPersonalityPrompt();
  const domainKnowledge = buildDomainKnowledgeSection(context);
  
  let prompt = `You are "${context.name}", an AI assistant.

## Purpose
${context.businessUseCase}

## Personality & Behavior
${personality}`;

  if (domainKnowledge) {
    prompt += `

## Domain Knowledge
${domainKnowledge}`;
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
- Stay focused on your defined purpose`;

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
  
  let prompt = `# System Instructions

You are **${context.name}**, an AI assistant with the following configuration:

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
- If you cannot help with a request, explain why politely`;

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
