import type { PromptStyle, DomainDocument, ClarifyingInsight } from "@shared/schema";

export interface PromptPreviewContext {
  name?: string;
  businessUseCase?: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  clarifyingInsights?: ClarifyingInsight[];
  validationRules?: string;
  guardrails?: string;
}

export const promptStyleInfo: Record<PromptStyle, { 
  name: string; 
  description: string;
  detailedDescription: string;
  link: string;
}> = {
  gemini: {
    name: "Google Gemini",
    description: "Uses Markdown headers with constraints at the end. Direct and structured.",
    detailedDescription: "Google's Gemini models respond well to Markdown-formatted prompts with clear section headers (##). This style places the most important constraints and guardrails at the end of the prompt, as Gemini tends to give more weight to instructions that appear later. The format is clean, readable, and works well for most use cases.",
    link: "https://ai.google.dev/gemini-api/docs/prompting-intro",
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

  if (context.clarifyingInsights && context.clarifyingInsights.length > 0) {
    if (domainSection) domainSection += "\n\n";
    domainSection += "Additional Context:";
    for (const insight of context.clarifyingInsights) {
      domainSection += `\n- ${insight.answer}`;
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

  // Always use Gemini style
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
}
