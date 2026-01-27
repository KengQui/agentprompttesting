import { z } from "zod";

// Agent status enum
export const agentStatusEnum = z.enum(["draft", "configured", "active"]);
export type AgentStatus = z.infer<typeof agentStatusEnum>;

// Agent schema
export const agentSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  businessUseCase: z.string().min(1, "Business use case is required"),
  description: z.string().default(""),
  validationRules: z.string().default(""),
  guardrails: z.string().default(""),
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

// Chat message schema
export const chatMessageSchema = z.object({
  id: z.string(),
  agentId: z.string(),
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
  validationRules: z.string().default(""),
  guardrails: z.string().default(""),
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
