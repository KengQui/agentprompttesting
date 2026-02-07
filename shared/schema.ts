import { z } from "zod";

// Agent status enum
export const agentStatusEnum = z.enum(["draft", "configured", "active"]);
export type AgentStatus = z.infer<typeof agentStatusEnum>;

// Prompt style enum (simplified to use gemini only)
export const promptStyleEnum = z.enum(["gemini"]);
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

// Agent action field schema (for action parameters)
export const actionFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "date", "select"]),
  label: z.string(),
  required: z.boolean().default(true),
  options: z.array(z.string()).optional(), // For select type
  description: z.string().optional(),
});

export type ActionField = z.infer<typeof actionFieldSchema>;

// Agent action schema (defines what actions the agent can simulate)
export const agentActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string().default("general"),
  requiredFields: z.array(actionFieldSchema).default([]),
  confirmationMessage: z.string().default(""),
  successMessage: z.string().default(""),
  affectedDataFields: z.array(z.string()).default([]), // Which mock data fields this action modifies
});

export type AgentAction = z.infer<typeof agentActionSchema>;

// Mock user state schema (simulated user data the agent can read/modify)
export const mockUserStateSchema = z.object({
  id: z.string(),
  name: z.string(), // e.g., "Employee Profile", "Policy Details"
  description: z.string().default(""),
  fields: z.record(z.any()).default({}), // Key-value pairs of user data
  isGenerated: z.boolean().default(false),
  createdAt: z.string(),
});

export type MockUserState = z.infer<typeof mockUserStateSchema>;

// Clarifying insight from AI Q&A
export const clarifyingInsightSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  category: z.enum(["validation", "guardrails", "general"]),
  createdAt: z.string(),
});

export type ClarifyingInsight = z.infer<typeof clarifyingInsightSchema>;

// Mock mode enum for agent behavior
export const mockModeEnum = z.enum(["disabled", "full", "read_only"]);
export type MockMode = z.infer<typeof mockModeEnum>;

// Mock mode descriptions for UI
export const mockModeDescriptions: Record<MockMode, string> = {
  "disabled": "Real API mode - calls actual backend APIs",
  "full": "Full mock mode - simulates all actions locally without API calls",
  "read_only": "Read-only mock - allows reads but simulates writes locally"
};

// Welcome screen suggested prompt schema
export const welcomePromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  icon: z.string().optional(),
});

export type WelcomePrompt = z.infer<typeof welcomePromptSchema>;

// Welcome screen config schema
export const welcomeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  greeting: z.string().default(""),
  suggestedPrompts: z.array(welcomePromptSchema).default([]),
});

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

// Agent schema
export const agentSchema = z.object({
  id: z.string(),
  userId: z.string(), // Owner of this agent
  name: z.string().min(1, "Name is required"),
  businessUseCase: z.string().default(""),
  description: z.string().default(""),
  domainKnowledge: z.string().default(""),
  domainDocuments: z.array(domainDocumentSchema).default([]),
  sampleDatasets: z.array(sampleDatasetSchema).default([]),
  validationRules: z.string().default(""),
  guardrails: z.string().default(""),
  promptStyle: promptStyleEnum.default("gemini"),
  customPrompt: z.string().default(""),
  clarifyingInsights: z.array(clarifyingInsightSchema).default([]),
  availableActions: z.array(agentActionSchema).default([]),
  mockUserState: z.array(mockUserStateSchema).default([]),
  mockMode: mockModeEnum.default("full"), // Default to full mock for usability testing
  welcomeConfig: welcomeConfigSchema.optional(),
  status: agentStatusEnum.default("draft"),
  configurationStep: z.number().default(1), // Track wizard progress for draft agents
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Agent = z.infer<typeof agentSchema>;

// Insert schema for creating agents (userId is set server-side from session)
export const insertAgentSchema = agentSchema.omit({
  id: true,
  userId: true,
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
  promptStyle: promptStyleEnum.default("gemini"),
  customPrompt: z.string().default(""),
  clarifyingInsights: z.array(clarifyingInsightSchema).default([]),
  availableActions: z.array(agentActionSchema).default([]),
  mockUserState: z.array(mockUserStateSchema).default([]),
  mockMode: mockModeEnum.default("full"),
  welcomeConfig: welcomeConfigSchema.optional(),
});

export type WizardStepData = z.infer<typeof wizardStepSchema>;

// User schema for authentication
export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  createdAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

// Insert schema for creating users (excludes auto-generated fields)
export const insertUserSchema = userSchema.omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Password reset request schema (verify username exists)
export const passwordResetRequestSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

// Password reset schema (set new password)
export const passwordResetSchema = z.object({
  username: z.string(),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// Session schema for auth sessions
export const authSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.string(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

// Public user type (without password)
export type PublicUser = Omit<User, "password">;

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

// === Agent Tracing & Debugging Schemas ===

// Trace entry type enum
export const traceEntryTypeEnum = z.enum([
  "hook_call",
  "signal_read",
  "context_build",
  "intent_classification",
  "llm_call",
  "state_change",
  "validation",
  "guardrail_check",
  "flow_step",
  "error",
]);
export type TraceEntryType = z.infer<typeof traceEntryTypeEnum>;

// Individual trace entry for a single hook/signal/action
export const traceEntrySchema = z.object({
  id: z.string(),
  type: traceEntryTypeEnum,
  name: z.string(),
  timestamp: z.string(),
  duration: z.number().optional(),
  input: z.record(z.any()).optional(),
  output: z.record(z.any()).optional(),
  metadata: z.object({
    classificationMethod: z.string().optional(),
    confidence: z.string().optional(),
    intent: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    tokenCount: z.number().optional(),
    model: z.string().optional(),
    stepId: z.string().optional(),
    previousStep: z.string().optional(),
    errorMessage: z.string().optional(),
  }).optional(),
});

export type TraceEntry = z.infer<typeof traceEntrySchema>;

// Aggregated usage statistics for hooks/signals
export const usageStatsSchema = z.object({
  hookCalls: z.record(z.number()).default({}),
  signalReads: z.record(z.number()).default({}),
  intentDistribution: z.record(z.number()).default({}),
  classificationMethods: z.record(z.number()).default({}),
  avgResponseTime: z.number().default(0),
  totalLlmCalls: z.number().default(0),
  totalTokensUsed: z.number().default(0),
  errorCount: z.number().default(0),
});

export type UsageStats = z.infer<typeof usageStatsSchema>;

// Full trace for a conversation turn
export const turnTraceSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  messageId: z.string().optional(),
  userInput: z.string(),
  agentResponse: z.string().optional(),
  entries: z.array(traceEntrySchema).default([]),
  startTime: z.string(),
  endTime: z.string().optional(),
  totalDuration: z.number().optional(),
  success: z.boolean().default(true),
});

export type TurnTrace = z.infer<typeof turnTraceSchema>;

// Agent trace collection for a session or agent
export const agentTraceSchema = z.object({
  agentId: z.string(),
  sessionId: z.string().optional(),
  traces: z.array(turnTraceSchema).default([]),
  stats: usageStatsSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentTrace = z.infer<typeof agentTraceSchema>;

// Config snapshot for change history
export const configSnapshotSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  timestamp: z.string(),
  description: z.string().optional(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any(),
    newValue: z.any(),
  })).default([]),
  config: z.object({
    name: z.string().optional(),
    businessUseCase: z.string().optional(),
    domainKnowledge: z.string().optional(),
    validationRules: z.string().optional(),
    guardrails: z.string().optional(),
    promptStyle: promptStyleEnum.optional(),
    customPrompt: z.string().optional(),
  }),
  isRevertPoint: z.boolean().default(false),
});

export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;

// Config history for an agent
export const configHistorySchema = z.object({
  agentId: z.string(),
  snapshots: z.array(configSnapshotSchema).default([]),
  currentVersion: z.number().default(0),
});

export type ConfigHistory = z.infer<typeof configHistorySchema>;

// Simulation request/result for testing config changes
export const simulationRequestSchema = z.object({
  agentId: z.string(),
  testMessage: z.string(),
  configOverrides: z.object({
    validationRules: z.string().optional(),
    guardrails: z.string().optional(),
    customPrompt: z.string().optional(),
  }),
});

export type SimulationRequest = z.infer<typeof simulationRequestSchema>;

export const simulationResultSchema = z.object({
  originalResponse: z.string(),
  simulatedResponse: z.string(),
  originalTrace: turnTraceSchema.optional(),
  simulatedTrace: turnTraceSchema.optional(),
  differences: z.array(z.object({
    aspect: z.string(),
    original: z.string(),
    simulated: z.string(),
  })).default([]),
  timestamp: z.string(),
});

export type SimulationResult = z.infer<typeof simulationResultSchema>;
