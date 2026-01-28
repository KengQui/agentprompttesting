import type { PromptStyle, DomainDocument } from "@shared/schema";

export interface PromptPreviewContext {
  name?: string;
  businessUseCase?: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  validationRules?: string;
  guardrails?: string;
}

export const promptStyleInfo: Record<PromptStyle, { 
  name: string; 
  description: string;
  detailedDescription: string;
  link: string;
}> = {
  anthropic: {
    name: "Anthropic (Claude)",
    description: "Uses XML tags for clear section separation. Best for complex instructions.",
    detailedDescription: "Anthropic's Claude models work best with XML-style tags to clearly separate different sections of a prompt. This format uses tags like <role>, <purpose>, <context>, and <constraints> to organize instructions. The structured approach helps Claude understand the boundaries between different types of information and follow complex multi-part instructions more reliably.",
    link: "https://docs.anthropic.com/claude/docs/prompt-engineering",
  },
  gemini: {
    name: "Google Gemini",
    description: "Uses Markdown headers with constraints at the end. Direct and structured.",
    detailedDescription: "Google's Gemini models respond well to Markdown-formatted prompts with clear section headers (##). This style places the most important constraints and guardrails at the end of the prompt, as Gemini tends to give more weight to instructions that appear later. The format is clean, readable, and works well for most use cases.",
    link: "https://ai.google.dev/gemini-api/docs/prompting-intro",
  },
  openai: {
    name: "OpenAI",
    description: "Uses Markdown with bold emphasis and explicit role definitions.",
    detailedDescription: "OpenAI's GPT models work well with Markdown formatting that uses bold text (**like this**) to emphasize key terms and explicit role definitions at the start. This style clearly states what the assistant 'is' and what it should do, with organized sections for different aspects of behavior. OpenAI models respond well to direct, assertive instructions.",
    link: "https://platform.openai.com/docs/guides/prompt-engineering",
  },
  custom: {
    name: "Write Your Own",
    description: "Create your own custom prompt from scratch with full control.",
    detailedDescription: "Write your own system prompt entirely from scratch. This gives you complete control over the exact instructions sent to the AI. Useful if you have specific requirements or prefer a particular prompting style not covered by the other options.",
    link: "",
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

    case "custom":
      return "";

    default:
      return "";
  }
}
