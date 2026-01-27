import type { PromptStyle, DomainDocument } from "@shared/schema";

export interface PromptPreviewContext {
  name?: string;
  businessUseCase?: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  validationRules?: string;
  guardrails?: string;
}

export const promptStyleInfo: Record<PromptStyle, { name: string; description: string }> = {
  anthropic: {
    name: "Anthropic (Claude)",
    description: "Uses XML tags for clear section separation. Best for complex instructions.",
  },
  gemini: {
    name: "Google Gemini",
    description: "Uses Markdown headers with constraints at the end. Direct and structured.",
  },
  openai: {
    name: "OpenAI",
    description: "Uses Markdown with bold emphasis and explicit role definitions.",
  },
};

function buildDomainSection(context: PromptPreviewContext): string {
  let domainSection = "";
  
  if (context.domainKnowledge) {
    const truncated = context.domainKnowledge.slice(0, 500);
    domainSection = truncated + (context.domainKnowledge.length > 500 ? "..." : "");
  }
  
  if (context.domainDocuments && context.domainDocuments.length > 0) {
    if (domainSection) domainSection += "\n\n";
    domainSection += "Reference Documents:";
    for (const doc of context.domainDocuments) {
      const preview = doc.content.slice(0, 200);
      const suffix = doc.content.length > 200 ? "..." : "";
      domainSection += `\n\n--- ${doc.filename} ---\n${preview}${suffix}`;
    }
  }
  
  return domainSection;
}

export function generatePromptPreview(style: PromptStyle, context: PromptPreviewContext): string {
  const personality = "[Platform personality from personality-prompt.txt]";
  const domainSection = buildDomainSection(context);
  
  const name = context.name || "Agent";
  const useCase = context.businessUseCase || "";
  const validation = context.validationRules || "";
  const guardrails = context.guardrails || "";

  switch (style) {
    case "anthropic":
      return `<role>
You are an AI assistant named "${name}".
${personality}
</role>

<purpose>
${useCase}
</purpose>${domainSection ? `

<context>
${domainSection}
</context>` : ''}${validation ? `

<rules>
${validation}
</rules>` : ''}${guardrails ? `

<constraints>
${guardrails}
</constraints>` : ''}

<instructions>
- Always be helpful, accurate, and stay within your defined scope
- If a request falls outside your capabilities, politely explain why
</instructions>`;

    case "gemini":
      return `You are "${name}", an AI assistant.

## Purpose
${useCase}

## Personality & Behavior
${personality}${domainSection ? `

## Domain Knowledge
${domainSection}` : ''}${validation ? `

## Validation Rules
${validation}` : ''}

## Response Guidelines
- Be direct and precise in your responses
- Stay focused on your defined purpose${guardrails ? `

## Constraints (IMPORTANT - Follow Strictly)
${guardrails}` : ''}`;

    case "openai":
      return `# System Instructions

You are **${name}**, an AI assistant with the following configuration:

## Role Definition
${personality}

## Primary Objective
${useCase}${domainSection ? `

## Knowledge Base
${domainSection}` : ''}${validation ? `

## Validation Requirements
${validation}` : ''}${guardrails ? `

## Guardrails & Restrictions
${guardrails}` : ''}

## Output Format
- Provide clear, well-structured responses
- Stay within your defined scope and guardrails`;

    default:
      return "";
  }
}
