const CHARS_PER_TOKEN = 4;
const CONTEXT_ROT_THRESHOLD = 200000;

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateTotalTokens(messages: { content: string }[]): number {
  return messages.reduce((total, msg) => total + estimateTokenCount(msg.content), 0);
}

export function getContextRotPercentage(tokenCount: number): number {
  return Math.min((tokenCount / CONTEXT_ROT_THRESHOLD) * 100, 100);
}

export function getContextRotSeverity(tokenCount: number): 'safe' | 'warning' | 'danger' | 'critical' {
  const percentage = getContextRotPercentage(tokenCount);
  if (percentage < 50) return 'safe';
  if (percentage < 75) return 'warning';
  if (percentage < 90) return 'danger';
  return 'critical';
}

export const CONTEXT_ROT_THRESHOLD_TOKENS = CONTEXT_ROT_THRESHOLD;
