import { z } from "zod";

// Agent status enum
export const agentStatusEnum = z.enum(["draft", "configured", "active"]);
export type AgentStatus = z.infer<typeof agentStatusEnum>;

// Prompt style enum
export const promptStyleEnum = z.enum(["anthropic", "gemini", "openai", "custom"]);
export type PromptStyle = z.infer<typeof promptStyleEnum>;

// Gemini model enum for generation
export const geminiModelEnum = z.enum([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
]);
export type GeminiModel = z.infer<typeof geminiModelEnum>;

// Model display names for UI
export const geminiModelDisplayNames: Record<GeminiModel, string> = {
  "gemini-2.5-flash": "Gemini 2.5 Flash (UKG)",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-3-flash-preview": "Gemini 3 Flash",
  "gemini-3-pro-preview": "Gemini 3 Pro",
};

// Default model for generation
export const defaultGenerationModel: GeminiModel = "gemini-2.5-flash";

// Domain document schema
export const domainDocumentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content: z.string(),
  uploadedAt: z.string(),
});

export type DomainDocument = z.infer<typeof domainDocumentSchema>;

// Sample dataset schema
export const sampleDatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  content: z.string(),
  format: z.enum(["json", "csv", "text"]).default("json"),
  isGenerated: z.boolean().default(false),
  createdAt: z.string(),
});

export type SampleDataset = z.infer<typeof sampleDatasetSchema>;

// Clarifying insight from AI Q&A
export const clarifyingInsightSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  category: z.enum(["validation", "guardrails", "general"]),
  createdAt: z.string(),
});

export type ClarifyingInsight = z.infer<typeof clarifyingInsightSchema>;

// Agent schema
export const agentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  businessUseCase: z.string().min(1, "Business use case is required"),
  description: z.string().default(""),
  domainKnowledge: z.string().default(""),
  domainDocuments: z.array(domainDocumentSchema).default([]),
  sampleDatasets: z.array(sampleDatasetSchema).default([]),
  validationRules: z.string().default(""),
  guardrails: z.string().default(""),
  promptStyle: promptStyleEnum.default("anthropic"),
  customPrompt: z.string().default(""),
  clarifyingInsights: z.array(clarifyingInsightSchema).default([]),
  status: agentStatusEnum.default("draft"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Agent = z.infer<typeof agentSchema>;

// Insert schema for creating agents
export const insertAgentSchema = agentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;

// Update schema for editing agents
export const updateAgentSchema = insertAgentSchema.partial();
export type UpdateAgent = z.infer<typeof updateAgentSchema>;

// Chat session schema (for grouping conversations)
export const chatSessionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string().default("New Session"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;

// Insert chat session schema
export const insertChatSessionSchema = chatSessionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;

// Update chat session schema (for renaming)
export const updateChatSessionSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
});

export type UpdateChatSession = z.infer<typeof updateChatSessionSchema>;

// Chat session with preview info (for listing)
export const chatSessionWithPreviewSchema = chatSessionSchema.extend({
  messageCount: z.number().default(0),
  firstMessage: z.string().optional(),
  lastMessageAt: z.string().optional(),
});

export type ChatSessionWithPreview = z.infer<typeof chatSessionWithPreviewSchema>;

// Chat message schema
export const chatMessageSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// Insert chat message schema
export const insertChatMessageSchema = chatMessageSchema.omit({
  id: true,
  timestamp: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// Wizard step data for creating agents
export const wizardStepSchema = z.object({
  businessUseCase: z.string().default(""),
  name: z.string().default(""),
  description: z.string().default(""),
  domainKnowledge: z.string().default(""),
  domainDocuments: z.array(domainDocumentSchema).default([]),
  sampleDatasets: z.array(sampleDatasetSchema).default([]),
  validationRules: z.string().default(""),
  guardrails: z.string().default(""),
  promptStyle: promptStyleEnum.default("anthropic"),
  customPrompt: z.string().default(""),
  clarifyingInsights: z.array(clarifyingInsightSchema).default([]),
});

export type WizardStepData = z.infer<typeof wizardStepSchema>;

// Legacy user schema (keeping for compatibility)
export const users = {
  id: "",
  username: "",
  password: "",
};

export type User = {
  id: string;
  username: string;
  password: string;
};

export type InsertUser = Omit<User, "id">;

// Session status enum
export const sessionStatusEnum = z.enum(["active", "paused", "completed", "archived"]);
export type SessionStatus = z.infer<typeof sessionStatusEnum>;

// Session TODO item schema
export const sessionTodoSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export type SessionTodo = z.infer<typeof sessionTodoSchema>;

// Session message (extended from chat message with token count)
export const sessionMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.string(),
  tokenCount: z.number().optional(),
  summarized: z.boolean().default(false),
});

export type SessionMessage = z.infer<typeof sessionMessageSchema>;

// Context summary for older messages
export const contextSummarySchema = z.object({
  id: z.string(),
  content: z.string(),
  messageRange: z.object({
    startId: z.string(),
    endId: z.string(),
    messageCount: z.number(),
  }),
  topics: z.array(z.string()).default([]),
  keyDecisions: z.array(z.string()).default([]),
  createdAt: z.string(),
  tokenCount: z.number().optional(),
});

export type ContextSummary = z.infer<typeof contextSummarySchema>;

// Session metadata schema
export const sessionMetaSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  status: sessionStatusEnum.default("active"),
  topic: z.string().optional(),
  intent: z.string().optional(),
  messageCount: z.number().default(0),
  totalTokens: z.number().default(0),
  contextWindowSize: z.number().default(20),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActivityAt: z.string(),
});

export type SessionMeta = z.infer<typeof sessionMetaSchema>;

// Full session schema
export const sessionSchema = z.object({
  meta: sessionMetaSchema,
  messages: z.array(sessionMessageSchema).default([]),
  summaries: z.array(contextSummarySchema).default([]),
  todos: z.array(sessionTodoSchema).default([]),
});

export type Session = z.infer<typeof sessionSchema>;

// Session context for LLM (what gets sent to the AI)
export const sessionContextSchema = z.object({
  recentMessages: z.array(sessionMessageSchema),
  summarizedContext: z.string().optional(),
  activeTodos: z.array(sessionTodoSchema).default([]),
  sessionMeta: z.object({
    topic: z.string().optional(),
    intent: z.string().optional(),
    messageCount: z.number(),
  }),
});

export type SessionContext = z.infer<typeof sessionContextSchema>;

// Session config for context window management
export const sessionConfigSchema = z.object({
  maxMessagesInContext: z.number().default(20),
  maxTokensInContext: z.number().default(8000),
  summarizationThreshold: z.number().default(15),
  autoSummarize: z.boolean().default(true),
});

export type SessionConfig = z.infer<typeof sessionConfigSchema>;
