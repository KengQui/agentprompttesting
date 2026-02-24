import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, computeConfigFieldsHash } from "./storage";
import { insertAgentSchema, updateAgentSchema, insertChatSessionSchema, updateChatSessionSchema, simulationRequestSchema, insertUserSchema, loginSchema, passwordResetRequestSchema, passwordResetSchema, type PublicUser } from "@shared/schema";
import { z } from "zod";
import type { TurnTrace, TraceEntry, ConfigSnapshot } from "@shared/schema";

// Session cookie name
const SESSION_COOKIE = "auth_session";

// Extended Request type with user
interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

// Helper to get user from session cookie
async function getUserFromSession(req: Request): Promise<PublicUser | undefined> {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return undefined;
  return storage.getUserBySessionId(sessionId);
}

// Middleware to require authentication
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = await getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  req.user = user;
  next();
}
import { generateAgentResponse, generateValidationRules, generateGuardrails, generateSystemPrompt, generateSampleData, evaluateContextSufficiency, processClarifyingChat, generateValidationRulesWithInsights, generateGuardrailsWithInsights, generateActionsAndMockData, parseActionFromResponse, stripActionBlocks, executeSimulatedAction, executeActionWithSampleData, extractBusinessCaseContent, sampleDatasetsToWorkingData, workingDataToSampleDatasets, generateWelcomeConfig, extractPendingQuestion, detectTopicSwitch, isOpenEndedInvitation, generatePromptCoachResponse, type GenerationContext, type SystemPromptContext, type SampleDataGenerationContext, type ClarifyingChatContext, type ActionsGenerationContext, type ExtractionResult, type WelcomeConfigGenerationContext, type PromptCoachMessage, type PromptCoachContext } from "./gemini";
import { loadAgentComponents, clearAgentCache, hasCustomComponents } from "./agent-loader";
import { createRecoveryManager } from "./components/recovery-manager";
import multer from "multer";

// Shared helper to validate AI responses and detect garbage/placeholder output
interface ResponseValidationResult {
  isValid: boolean;
  originalResponse: string;
  recoveryResponse: string;
}

function validateAIResponse(response: string): ResponseValidationResult {
  const trimmed = response.trim();
  const lowered = trimmed.toLowerCase();
  
  // Patterns that indicate placeholder/template text that shouldn't be shown to users
  const invalidPatterns = [
    /^describe your question/i,
    /^what can i help you with/i,
    /^hello!?\s*i'?m here to help/i,
    /^please provide more details/i,
    /^i need more information/i,
  ];
  
  // Check if response matches any invalid pattern AND is suspiciously short
  const matchesPattern = invalidPatterns.some(pattern => pattern.test(trimmed));
  const isTooShort = trimmed.length < 80;
  
  // Also check for exact matches to common placeholder text
  const exactInvalid = [
    "describe your question or issue.",
    "describe your question or issue",
    "what can i help you with today?",
  ];
  const isExactMatch = exactInvalid.includes(lowered);
  
  const isInvalid = isExactMatch || (matchesPattern && isTooShort);
  
  const recoveryMessage = "I apologize, but I wasn't able to fully process that question. Could you please rephrase it, or let me know specifically what information you're looking for from your paycheck data? For example, you could ask about specific deductions, tax withholdings, or pay changes between periods.";
  
  return {
    isValid: !isInvalid,
    originalResponse: trimmed,
    recoveryResponse: isInvalid ? recoveryMessage : trimmed,
  };
}
import { v4 as uuidv4 } from "uuid";
import type { Agent, SampleDataset, MockUserState, AgentAction } from "@shared/schema";
import type { ActionExecutionResult } from "./gemini";

// Helper to execute action with sample data or legacy mockUserState
async function executeAgentAction(
  parsedAction: { actionName: string; actionFields?: Record<string, any> },
  agent: Agent,
  agentId: string
): Promise<{ result: ActionExecutionResult; shouldUpdateStorage: boolean }> {
  const hasSampleData = agent.sampleDatasets && agent.sampleDatasets.length > 0;
  const hasLegacyMockState = agent.mockUserState && agent.mockUserState.length > 0;
  
  let actionResult: ActionExecutionResult;
  
  if (hasSampleData) {
    actionResult = executeActionWithSampleData(
      parsedAction.actionName,
      parsedAction.actionFields || {},
      agent.availableActions || [],
      agent.sampleDatasets!
    );
  } else if (hasLegacyMockState) {
    actionResult = executeSimulatedAction(
      parsedAction.actionName,
      parsedAction.actionFields || {},
      agent.availableActions || [],
      agent.mockUserState!
    );
  } else {
    actionResult = executeSimulatedAction(
      parsedAction.actionName,
      parsedAction.actionFields || {},
      agent.availableActions || [],
      []
    );
  }
  
  let shouldUpdateStorage = false;
  if (actionResult.success) {
    if (hasSampleData && actionResult.updatedSampleDatasets) {
      await storage.updateAgent(agentId, {
        sampleDatasets: actionResult.updatedSampleDatasets
      });
      shouldUpdateStorage = true;
    } else if (hasLegacyMockState && actionResult.updatedMockState) {
      await storage.updateAgent(agentId, {
        mockUserState: actionResult.updatedMockState
      });
      shouldUpdateStorage = true;
    }
  }
  
  return { result: actionResult, shouldUpdateStorage };
}

// Configure multer for file uploads (memory storage for text extraction)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow plain text files that can be read as UTF-8
    const allowedExtensions = ['.txt', '.md', '.csv', '.json'];
    const allowedMimes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json'
    ];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowedExtensions.includes(ext) || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only text-based files are allowed (.txt, .md, .csv, .json)'));
    }
  }
});

interface PendingQuestionState {
  question: string;
  alreadyNudged: boolean;
}
const pendingQuestionStore = new Map<string, PendingQuestionState>();

function getPendingQuestionKey(agentId: string, sessionId: string): string {
  return `${agentId}:${sessionId}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ========== Authentication Routes ==========

  // Register new user
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const user = await storage.createUser(parsed.data);
      const session = await storage.createAuthSession(user.id);

      // Set session cookie (7 days)
      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { password, ...publicUser } = user;
      res.status(201).json(publicUser);
    } catch (error: any) {
      console.error("Error registering user:", error);
      if (error.message === "Username already exists") {
        return res.status(400).json({ message: "Username already exists" });
      }
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const user = await storage.validatePassword(parsed.data.username, parsed.data.password);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const session = await storage.createAuthSession(user.id);

      res.cookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const { password, ...publicUser } = user;
      res.json(publicUser);
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionId = req.cookies?.[SESSION_COOKIE];
      if (sessionId) {
        await storage.deleteAuthSession(sessionId);
      }
      res.clearCookie(SESSION_COOKIE);
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Error logging out:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error getting current user:", error);
      res.status(500).json({ message: "Failed to get current user" });
    }
  });

  // Verify username exists for password reset (step 1)
  app.post("/api/auth/verify-username", async (req, res) => {
    try {
      const parsed = passwordResetRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const exists = await storage.verifyUsernameExists(parsed.data.username);
      if (!exists) {
        return res.status(400).json({ message: "Username not found" });
      }

      // Return success - frontend will show password reset form
      res.json({ success: true, username: parsed.data.username });
    } catch (error) {
      console.error("Error verifying username:", error);
      res.status(500).json({ message: "Failed to verify username" });
    }
  });

  // Reset password (step 2)
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const parsed = passwordResetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const user = await storage.getUserByUsername(parsed.data.username);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const success = await storage.updateUserPassword(user.id, parsed.data.newPassword);
      if (!success) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ========== Agent Routes ==========

  // Get all agents (filtered by logged-in user)
  app.get("/api/agents", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const agents = await storage.getAgentsByUserId(user.id);
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  app.get("/api/agents/flow-modes", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const agents = await storage.getAgentsByUserId(user.id);
      const results: Array<{ agentId: string; agentName: string; flowMode: string }> = [];

      for (const agent of agents) {
        if (!agent.customPrompt) {
          results.push({ agentId: agent.id, agentName: agent.name, flowMode: "ask-first" });
          continue;
        }

        try {
          const agentConfig = {
            name: agent.name,
            businessUseCase: agent.businessUseCase,
            description: agent.description,
            domainKnowledge: agent.domainKnowledge,
            validationRules: agent.validationRules,
            guardrails: agent.guardrails,
            customPrompt: agent.customPrompt,
            sampleDatasets: agent.sampleDatasets,
            availableActions: agent.availableActions,
            mockUserState: agent.mockUserState,
            mockMode: agent.mockMode,
          };

          const { orchestrator } = await loadAgentComponents(agent.id, agentConfig);
          const flowMode = orchestrator.getFlowMode();
          results.push({ agentId: agent.id, agentName: agent.name, flowMode });
        } catch (err) {
          console.error(`Error detecting flow mode for agent ${agent.id}:`, err);
          results.push({ agentId: agent.id, agentName: agent.name, flowMode: "unknown" });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error detecting flow modes:", error);
      res.status(500).json({ message: "Failed to detect flow modes" });
    }
  });

  // Get single agent (verify ownership)
  app.get("/api/agents/:id", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      
      // Check ownership (allow access to legacy agents without userId for migration)
      if (agent.userId && agent.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(500).json({ message: "Failed to fetch agent" });
    }
  });

  // Create agent (set userId from session)
  app.post("/api/agents", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const parsed = insertAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      
      const agent = await storage.createAgent(parsed.data, user.id);
      res.status(201).json(agent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ message: "Failed to create agent" });
    }
  });

  // Update agent (verify ownership)
  app.patch("/api/agents/:id", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const existingAgent = await storage.getAgent(req.params.id);
      if (!existingAgent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      
      if (existingAgent.userId && existingAgent.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const parsed = updateAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const agent = await storage.updateAgent(req.params.id, parsed.data);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      clearAgentCache(req.params.id);
      res.json(agent);
    } catch (error) {
      console.error("Error updating agent:", error);
      res.status(500).json({ message: "Failed to update agent" });
    }
  });

  // Delete agent (verify ownership)
  app.delete("/api/agents/:id", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const existingAgent = await storage.getAgent(req.params.id);
      if (!existingAgent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      
      if (existingAgent.userId && existingAgent.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deleted = await storage.deleteAgent(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Agent not found" });
      }
      clearAgentCache(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting agent:", error);
      res.status(500).json({ message: "Failed to delete agent" });
    }
  });

  // Clone agent (verify ownership)
  app.post("/api/agents/:id/clone", async (req: AuthenticatedRequest, res) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const existingAgent = await storage.getAgent(req.params.id);
      if (!existingAgent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      if (existingAgent.userId && existingAgent.userId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const clonedAgent = await storage.cloneAgent(req.params.id, user.id);
      if (!clonedAgent) {
        return res.status(500).json({ message: "Failed to clone agent" });
      }

      res.status(201).json(clonedAgent);
    } catch (error) {
      console.error("Error cloning agent:", error);
      res.status(500).json({ message: "Failed to clone agent" });
    }
  });

  // Helper to verify agent ownership for nested routes
  async function verifyAgentOwnership(req: AuthenticatedRequest, res: any, agentId: string): Promise<Agent | null> {
    const user = await getUserFromSession(req);
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return null;
    }
    
    const agent = await storage.getAgent(agentId);
    if (!agent) {
      res.status(404).json({ message: "Agent not found" });
      return null;
    }
    
    if (agent.userId && agent.userId !== user.id) {
      res.status(403).json({ message: "Access denied" });
      return null;
    }
    
    return agent;
  }

  // Get all sessions for an agent
  app.get("/api/agents/:id/sessions", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const sessions = await storage.getSessions(req.params.id);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Create a new session for an agent
  app.post("/api/agents/:id/sessions", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const session = await storage.createSession({
        agentId: req.params.id,
        title: req.body.title || "New Session",
      });
      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  // Get a specific session
  app.get("/api/agents/:id/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const session = await storage.getSession(req.params.id, req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Update session (rename)
  app.patch("/api/agents/:id/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;

      const parsed = updateChatSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }

      const session = await storage.updateSession(req.params.id, req.params.sessionId, parsed.data);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  // Delete session
  app.delete("/api/agents/:id/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;

      const deleted = await storage.deleteSession(req.params.id, req.params.sessionId);
      if (!deleted) {
        return res.status(404).json({ message: "Session not found" });
      }
      pendingQuestionStore.delete(getPendingQuestionKey(req.params.id, req.params.sessionId));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  // Get messages for a specific session
  app.get("/api/agents/:id/sessions/:sessionId/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const session = await storage.getSession(req.params.id, req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const messages = await storage.getMessages(req.params.id, req.params.sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Get messages for an agent (all messages, for backwards compatibility)
  app.get("/api/agents/:id/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send a message to a session with Turn Manager + Gemini AI response
  app.post("/api/agents/:id/sessions/:sessionId/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;

      const session = await storage.getSession(req.params.id, req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const contentSchema = z.object({ 
        content: z.string().min(1).max(2000, "Message exceeds 2000 character limit"),
        selectedDatasetIds: z.array(z.string()).optional(),
      });
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Content is required" });
      }

      const userInput = parsed.data.content;
      const selectedDatasetIds = parsed.data.selectedDatasetIds;
      const traceStartTime = Date.now();
      const traceEntries: TraceEntry[] = [];

      // Add user message
      const userMessage = await storage.addMessage({
        agentId: req.params.id,
        sessionId: req.params.sessionId,
        role: "user",
        content: userInput,
      });

      // Get chat history for context (only from this session)
      const allMessages = await storage.getMessages(req.params.id, req.params.sessionId);
      const chatHistory = allMessages.slice(0, -1).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      // Load agent components (orchestrator with turn manager)
      const filteredDatasets = selectedDatasetIds
        ? (agent.sampleDatasets || []).filter(d => selectedDatasetIds.includes(d.id))
        : agent.sampleDatasets;
        
      const agentConfig = {
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        description: agent.description,
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
        sampleDatasets: filteredDatasets,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
        availableActions: agent.availableActions,
        mockUserState: agent.mockUserState,
      };

      let responseContent: string;
      let traceSuccess = true;
      let detectedIntent = "answer_question";
      let classificationMethod = "standard";

      const pqKey = getPendingQuestionKey(req.params.id, req.params.sessionId);
      const pendingState = pendingQuestionStore.get(pqKey);
      let topicSwitchDetected = false;
      let topicSwitchPrefix = '';

      if (pendingState) {
        try {
          const isSwitching = await detectTopicSwitch(pendingState.question, userInput);
          if (isSwitching) {
            topicSwitchDetected = true;
            if (!pendingState.alreadyNudged) {
              pendingQuestionStore.set(pqKey, { ...pendingState, alreadyNudged: true });
              topicSwitchPrefix = `[SYSTEM CONTEXT: You previously asked the user: "${pendingState.question}" but they have not answered it. Instead they are asking about something new. Before addressing their new request, ask them to answer your pending question first. For example: "Before we move on to your new request — ${pendingState.question}" Do NOT process their new request yet. Keep it brief and natural.]\n\n`;
            } else {
              pendingQuestionStore.delete(pqKey);
              topicSwitchPrefix = `[SYSTEM CONTEXT: You previously asked: "${pendingState.question}" but the user chose not to answer it. That's fine — move on and handle their current request directly. Do not mention the skipped question again.]\n\n`;
            }
          } else {
            const confirmedQuestion = pendingState.question;
            pendingQuestionStore.delete(pqKey);
            const shortConfirm = /^(yes|y|yeah|yep|yup|correct|right|sure|ok|okay|no|n|nope|nah|not really|wrong|incorrect|looks good|looks right|that'?s (right|correct)|confirmed?|deny|reject)\b/i;
            if (shortConfirm.test(userInput.trim())) {
              topicSwitchPrefix = `[SYSTEM CONTEXT: The user is responding "${userInput.trim()}" to your question: "${confirmedQuestion}". Proceed to fully carry out what you offered — do not just acknowledge, actually do it with the data.]\n\n`;
            }
          }
        } catch (err) {
          console.error('[PendingQuestion] Error detecting topic switch:', err);
          pendingQuestionStore.delete(pqKey);
        }
      }

      try {
        classificationMethod = "orchestrator";
        const { orchestrator } = await loadAgentComponents(req.params.id, agentConfig);
        const turnResult = await orchestrator.processTurn(req.params.id, userInput);
        
        detectedIntent = turnResult.intent;
          
          traceEntries.push({
            id: `entry-${Date.now()}-1`,
            type: "intent_classification",
            name: "Orchestrator Intent Classification",
            timestamp: new Date().toISOString(),
            metadata: {
              intent: turnResult.intent,
              classificationMethod: "orchestrator",
              confidence: turnResult.confidence || "high",
            },
          });
          
          if (turnResult.nextAction !== 'generate_ai_response') {
            responseContent = turnResult.response;
            traceEntries.push({
              id: `entry-${Date.now()}-2`,
              type: "hook_call",
              name: "Orchestrator Direct Response",
              timestamp: new Date().toISOString(),
              metadata: { action: turnResult.nextAction },
            });
          } else {
            const skipPrefixIntents = ['answer_question', 'confirm', 'reject'];
            let intentPrefix = !skipPrefixIntents.includes(turnResult.intent)
              ? `[The user's intent appears to be: ${turnResult.intent}. Please respond accordingly.]\n\n`
              : '';
            
            // Add system context for suggested action pill clicks to reinforce correct behavior
            const buildTestWithDataPrefix = (): string => {
              const datasets = filteredDatasets || agent.sampleDatasets || [];
              if (datasets.length === 0) {
                return '[SYSTEM CONTEXT: The user clicked "Test with my data". Show a row-by-row validation preview, but note that no sample data is currently loaded.]\n\n';
              }
              const sanitize = (s: string) => s.replace(/[\[\]]/g, '').trim();
              const parseCSV = (line: string): string[] => {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                  const ch = line[i];
                  if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                    else { inQuotes = !inQuotes; }
                  } else if (ch === ',' && !inQuotes) {
                    result.push(current); current = '';
                  } else { current += ch; }
                }
                result.push(current);
                return result;
              };
              const extractJsonIdentifiers = (obj: any): string[] => {
                const ids: string[] = [];
                if (Array.isArray(obj)) {
                  for (let r = 0; r < obj.length && r < 10; r++) {
                    const row = obj[r];
                    if (typeof row !== 'object' || row === null) continue;
                    const nameKey = Object.keys(row).find((k: string) => /name/i.test(k));
                    const idKey = Object.keys(row).find((k: string) => /id/i.test(k));
                    const label = sanitize(nameKey ? String(row[nameKey]) : idKey ? String(row[idKey]) : '');
                    if (label) ids.push(`Row ${r + 1}: ${label}`);
                  }
                } else if (typeof obj === 'object' && obj !== null) {
                  for (const key of Object.keys(obj)) {
                    if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === 'object') {
                      return extractJsonIdentifiers(obj[key]);
                    }
                  }
                  const nameKey = Object.keys(obj).find((k: string) => /name|display/i.test(k));
                  const idKey = Object.keys(obj).find((k: string) => /id/i.test(k));
                  const label = sanitize(nameKey ? String(obj[nameKey]) : idKey ? String(obj[idKey]) : '');
                  if (label) ids.push(`Record: ${label}`);
                }
                return ids;
              };
              const datasetSummaries: string[] = [];
              for (const ds of datasets) {
                const content = ds.content || '';
                const rowIdentifiers: string[] = [];
                let rowCount = 0;
                const safeDsName = sanitize(ds.name || 'Unknown');

                if (ds.format === 'json') {
                  try {
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed)) rowCount = parsed.length;
                    const extracted = extractJsonIdentifiers(parsed);
                    rowIdentifiers.push(...extracted);
                  } catch {}
                } else {
                  const lines = content.split(/\r?\n/).filter((l: string) => l.trim());
                  if (lines.length < 2) continue;
                  rowCount = lines.length - 1;
                  const headerCols = parseCSV(lines[0]);
                  const nameColIdx = headerCols.findIndex((h: string) => /name/i.test(h.trim()));
                  for (let r = 1; r < lines.length && r <= 10; r++) {
                    const cols = parseCSV(lines[r]);
                    const id = sanitize(cols[0] || '');
                    const name = nameColIdx >= 0 ? sanitize(cols[nameColIdx] || '') : '';
                    if (name) {
                      rowIdentifiers.push(`Row ${r}: ${name}`);
                    } else if (id) {
                      rowIdentifiers.push(`Row ${r}: ${id}`);
                    }
                  }
                }
                if (rowIdentifiers.length > 0) {
                  datasetSummaries.push(`Dataset "${safeDsName}" (${rowCount} rows): ${rowIdentifiers.join(', ')}`);
                }
              }
              const dataSummary = datasetSummaries.length > 0
                ? ` The data section contains: ${datasetSummaries.join('; ')}. You MUST use ONLY these actual rows. Do NOT invent or fabricate any names, IDs, or values.`
                : '';
              return `[SYSTEM CONTEXT: The user clicked "Test with my data". Show a row-by-row validation preview using ONLY real rows from the data section.${dataSummary}]\n\n`;
            };
            const suggestedActionPrefixes: Record<string, string> = {
              'Create new column': '[SYSTEM CONTEXT: The user clicked "Create new column". You MUST create the column immediately via the create_calculated_column action. Do NOT show any validation examples, row-by-row calculations, or sample data. Confirm the column was created and offer follow-up options.]\n\n',
              'Test with my data': buildTestWithDataPrefix(),
              'Explain this expression': '[SYSTEM CONTEXT: The user clicked "Explain this expression". Provide a plain-language explanation of how the expression works without showing sample data rows.]\n\n',
              'Breakdown in details (L)': '[SYSTEM CONTEXT: The user clicked "Breakdown in details (L)". Provide a detailed step-by-step breakdown of the most recent expression. Use EXACTLY this format:\n\n**Expression:**\n<the full expression on its own line>\n\n**Step-by-Step:**\n1. <first sub-expression or argument>\n   → <brief plain-language explanation of what this step does>\n2. <second sub-expression or argument>\n   → <brief plain-language explanation of what this step does>\n... (continue numbering each distinct sub-expression)\nN. *Final:* <the full expression rewritten showing how all steps combine, referencing [Step 1],[Step 2],etc.>\n   → <one-sentence summary of what the complete expression produces>\n\nRules:\n- Break the expression into its smallest meaningful parts — each function call argument, each nested function, each literal string.\n- Each step MUST have a → annotation line immediately after it explaining what that step does in simple terms a non-technical user can understand.\n- For the Final step, show how all numbered steps combine back into the full expression. Use [Step N] references to show composition.\n- Do NOT include any additional headers or commentary beyond Expression and Step-by-Step.\n- Do NOT use code fences or markdown code blocks.]\n\n',
              'Breakdown in details (S)': '[SYSTEM CONTEXT: The user clicked "Breakdown in details (S)". Provide a SHORT, high-level structural breakdown of the most recent expression. The goal is FEWER steps — show only the top-level arguments of the outermost function, NOT every nested sub-expression.\n\nUse EXACTLY this format:\n\n**Expression:**\n<the full expression on its own line>\n\n**Step-by-Step:**\n1. <first direct argument of the outermost function, kept whole — do NOT decompose it further>\n   → <one short sentence explaining what this argument does>\n2. <second direct argument, kept whole>\n   → <one short sentence explaining what this argument does>\n3. <third direct argument, kept whole>\n   → <one short sentence explaining what this argument does>\n... (one step per direct argument — typically 2–4 steps)\nN-1. <outermost function with [Step N] references, e.g. If([Step 1],[Step 2],[Step 3])>\n   → <one short sentence explaining how the steps combine>\nN. *Final:* <the full expression written out>\n\nCRITICAL RULES:\n- ONLY break down the outermost function into its direct arguments. Each argument becomes ONE step, no matter how complex that argument is internally.\n- Do NOT recursively decompose nested functions — leave them intact as a single step.\n- For example, If(A,B,C) produces exactly 3 argument steps + composition + Final = 5 steps total. Even if A is Or(Eq(...), Search(...) > 0), it stays as one step.\n- For nested If chains like If(cond1, val1, If(cond2, val2, If(cond3, val3, default))), break down the OUTERMOST If only: Step 1 = cond1, Step 2 = val1, Step 3 = the entire inner If(...) as one step. Then composition + Final.\n- Each step MUST have a → annotation line immediately after it. Keep annotations to one brief sentence — concise and plain-language.\n- The composition step shows the outermost function structure using [Step N] references.\n- The Final step shows the complete expression. No annotation needed for the Final step.\n- Aim for approximately 4–6 total steps. NEVER exceed 8 steps.\n- Do NOT include any additional headers or commentary beyond Expression and Step-by-Step.\n- Do NOT use code fences or markdown code blocks.]\n\n',
              'Revise this expression': '[SYSTEM CONTEXT: The user clicked "Revise this expression". Do NOT review, analyze, or suggest improvements to the expression on your own — the user has not asked for that. Simply ask the user whether they would like to (1) manually edit the expression themselves, or (2) describe the changes they want and let you make the revisions. Keep your response brief — just present these two options and wait for the user to choose.]\n\n',
              'See related expressions': '[SYSTEM CONTEXT: The user clicked "See related expressions". Suggest 3 related expressions they might find useful.]\n\n',
              'Create new expression': '[SYSTEM CONTEXT: The user clicked "Create new expression". Ask what they would like to build.]\n\n',
              "I'm done": '[SYSTEM CONTEXT: The user clicked "I\'m done". Give a brief friendly sign-off.]\n\n',
            };
            const actionPrefix = suggestedActionPrefixes[userInput.trim()] || '';
            intentPrefix = topicSwitchPrefix + actionPrefix + intentPrefix;
            
            const llmStartTime = Date.now();
            const rawResponse = await generateAgentResponse(
              agentConfig,
              intentPrefix + userInput,
              chatHistory
            );
            
            // Validate AI response using shared helper
            const validation = validateAIResponse(rawResponse);
            responseContent = validation.recoveryResponse;
            
            if (!validation.isValid) {
              traceEntries.push({
                id: `entry-${Date.now()}-recovery`,
                type: "recovery",
                name: "Response Validation Recovery",
                timestamp: new Date().toISOString(),
                metadata: { 
                  reason: "Detected invalid/placeholder response",
                  originalResponse: validation.originalResponse.substring(0, 100),
                },
              });
            }
            
            // Check for simulated action in the response (orchestrator path)
            if (agent.availableActions && agent.availableActions.length > 0) {
              const parsedAction = parseActionFromResponse(responseContent);
              
              if (parsedAction.hasAction && parsedAction.actionName) {
                // Handle parse errors
                if (parsedAction.parseError) {
                  traceEntries.push({
                    id: `entry-${Date.now()}-action-error`,
                    type: "action_simulation",
                    name: `Action Parse Error`,
                    timestamp: new Date().toISOString(),
                    metadata: { error: parsedAction.parseError, actionName: parsedAction.actionName },
                  });
                  responseContent = parsedAction.cleanedResponse || 
                    `I tried to perform "${parsedAction.actionName}" but encountered an error processing the action. Please try again.`;
                } else {
                  // Execute action with sample data or legacy mockUserState
                  const { result: actionResult } = await executeAgentAction(
                    { actionName: parsedAction.actionName, actionFields: parsedAction.actionFields },
                    agent,
                    req.params.id
                  );
                  
                  traceEntries.push({
                    id: `entry-${Date.now()}-action`,
                    type: "action_simulation",
                    name: `Action: ${actionResult.actionName}`,
                    timestamp: new Date().toISOString(),
                    metadata: {
                      actionName: actionResult.actionName,
                      fields: actionResult.fields,
                      success: actionResult.success,
                      message: actionResult.message
                    },
                  });
                  
                  responseContent = parsedAction.cleanedResponse;
                  if (!responseContent.trim() && actionResult.success) {
                    try {
                      const isColumnCreation = actionResult.actionName === 'create_calculated_column';
                      const columnCreationSuffix = isColumnCreation
                        ? ' MANDATORY: Your response MUST end with exactly this marker on its own line:\n{{SUGGESTED_ACTIONS:See related expressions|Create new expression|I\'m done}}\nDo NOT omit this marker. Do NOT rephrase it. Do NOT replace it with free-form text.'
                        : '';
                      const actionFollowUp = `[SYSTEM: You just executed the action "${actionResult.actionName}" with these parameters: ${JSON.stringify(actionResult.fields)}. The action was successful: "${actionResult.message}". Now, based on the user data you have access to, provide a helpful response that: 1) Summarizes what you found or did (include specific data values), 2) Explains what this means in context of the user's request, 3) Suggests a logical next step. Do NOT just repeat the success message. Be specific and actionable.${columnCreationSuffix}]`;
                      const followUpHistory = [
                        ...chatHistory,
                        { role: "user" as const, content: userInput },
                      ];
                      responseContent = await generateAgentResponse(
                        agentConfig,
                        actionFollowUp,
                        followUpHistory
                      );
                    } catch (followUpErr) {
                      console.error("Action follow-up AI call failed:", followUpErr);
                      responseContent = actionResult.message;
                    }
                  } else if (!responseContent.trim()) {
                    responseContent = actionResult.message;
                  } else if (!actionResult.success) {
                    responseContent += `\n\n(Action failed: ${actionResult.message})`;
                  }
                }
              }
            }
            
            traceEntries.push({
              id: `entry-${Date.now()}-3`,
              type: "llm_call",
              name: "Gemini Response Generation",
              timestamp: new Date().toISOString(),
              duration: Date.now() - llmStartTime,
              metadata: { 
                model: "gemini",
                intent: turnResult.intent,
                validated: validation.isValid,
              },
            });
          }
      } catch (aiError: any) {
        console.error("AI generation error:", aiError);
        traceSuccess = false;
        responseContent = `I apologize, but I'm having trouble generating a response. ${aiError.message?.includes("GEMINI_API_KEY") ? "The Gemini API key may not be configured correctly." : "Please try again."}`;
        
        traceEntries.push({
          id: `entry-${Date.now()}-err`,
          type: "error",
          name: "AI Generation Error",
          timestamp: new Date().toISOString(),
          metadata: { error: aiError.message || "Unknown error" },
        });
      }

      // Save trace data
      const turnTrace: TurnTrace = {
        id: `trace-${Date.now()}`,
        sessionId: req.params.sessionId,
        userInput,
        agentResponse: responseContent,
        startTime: new Date(traceStartTime).toISOString(),
        endTime: new Date().toISOString(),
        totalDuration: Date.now() - traceStartTime,
        entries: traceEntries,
        success: traceSuccess,
      };
      
      // Fire and forget - don't block the response
      storage.addTurnTrace(req.params.id, turnTrace).catch(err => {
        console.error("Failed to save trace:", err);
      });

      // Safety net: strip any remaining action blocks before saving
      responseContent = stripActionBlocks(responseContent);

      const newPendingQuestion = extractPendingQuestion(responseContent);
      if (newPendingQuestion) {
        if (isOpenEndedInvitation(newPendingQuestion)) {
          if (!topicSwitchDetected) {
            pendingQuestionStore.delete(pqKey);
          }
        } else {
          const existingState = pendingQuestionStore.get(pqKey);
          const preserveNudged = topicSwitchDetected && existingState?.alreadyNudged === true;
          pendingQuestionStore.set(pqKey, { question: newPendingQuestion, alreadyNudged: preserveNudged });
        }
      } else if (!topicSwitchDetected) {
        pendingQuestionStore.delete(pqKey);
      }

      // Add assistant message
      const assistantMessage = await storage.addMessage({
        agentId: req.params.id,
        sessionId: req.params.sessionId,
        role: "assistant",
        content: responseContent,
      });

      res.json([userMessage, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Clear messages for a specific session
  app.delete("/api/agents/:id/sessions/:sessionId/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const session = await storage.getSession(req.params.id, req.params.sessionId);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      await storage.clearMessages(req.params.id, req.params.sessionId);
      pendingQuestionStore.delete(getPendingQuestionKey(req.params.id, req.params.sessionId));
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ message: "Failed to clear messages" });
    }
  });

  // Check if agent has custom components
  app.get("/api/agents/:id/components", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      res.json({ hasCustomComponents: await hasCustomComponents(req.params.id) });
    } catch (error) {
      console.error("Error checking components:", error);
      res.status(500).json({ message: "Failed to check components" });
    }
  });

  app.get("/api/agents/:id/flow-mode", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;

      const agentConfig = {
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        description: agent.description,
        domainKnowledge: agent.domainKnowledge,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        customPrompt: agent.customPrompt,
        sampleDatasets: agent.sampleDatasets,
        availableActions: agent.availableActions,
        mockUserState: agent.mockUserState,
        mockMode: agent.mockMode,
      };

      clearAgentCache(req.params.id);
      const { orchestrator } = await loadAgentComponents(req.params.id, agentConfig);
      const flowMode = orchestrator.getFlowMode();

      res.json({ agentId: req.params.id, flowMode });
    } catch (error) {
      console.error("Error detecting flow mode:", error);
      res.status(500).json({ message: "Failed to detect flow mode" });
    }
  });

  // Upload domain knowledge document (returns parsed document)
  app.post("/api/upload-document", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Extract text content from the file
      const content = req.file.buffer.toString('utf-8');
      
      const document = {
        id: uuidv4(),
        filename: req.file.originalname,
        content: content.substring(0, 50000), // Limit content to 50k chars
        uploadedAt: new Date().toISOString(),
      };

      res.json(document);
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Generate validation rules using AI
  app.post("/api/generate/validation-rules", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, model } = req.body;
      
      if (!businessUseCase) {
        return res.status(400).json({ message: "Business use case is required" });
      }

      const context: GenerationContext = {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        model,
      };

      const validationRules = await generateValidationRules(context);
      res.json({ validationRules });
    } catch (error: any) {
      console.error("Error generating validation rules:", error);
      res.status(500).json({ message: error?.message || "Failed to generate validation rules" });
    }
  });

  // Generate guardrails using AI
  app.post("/api/generate/guardrails", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, model } = req.body;
      
      if (!businessUseCase) {
        return res.status(400).json({ message: "Business use case is required" });
      }

      const context: GenerationContext = {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        model,
      };

      const guardrails = await generateGuardrails(context);
      res.json({ guardrails });
    } catch (error: any) {
      console.error("Error generating guardrails:", error);
      res.status(500).json({ message: error?.message || "Failed to generate guardrails" });
    }
  });

  // Evaluate if there's enough context to generate rules/guardrails
  app.post("/api/generate/evaluate-context", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, generationType } = req.body;
      
      if (!generationType || !["validation", "guardrails"].includes(generationType)) {
        return res.status(400).json({ message: "Valid generationType (validation or guardrails) is required" });
      }

      const context: GenerationContext = {
        businessUseCase: businessUseCase || "",
        domainKnowledge,
        domainDocuments,
      };

      const result = await evaluateContextSufficiency(context, generationType);
      res.json(result);
    } catch (error: any) {
      console.error("Error evaluating context:", error);
      res.status(500).json({ message: error?.message || "Failed to evaluate context" });
    }
  });

  // Process clarifying chat for gathering more context
  app.post("/api/generate/clarifying-chat", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, clarifyingInsights, generationType, chatHistory, userMessage } = req.body;
      
      if (!generationType || !["validation", "guardrails"].includes(generationType)) {
        return res.status(400).json({ message: "Valid generationType is required" });
      }

      if (!userMessage) {
        return res.status(400).json({ message: "User message is required" });
      }

      const context: ClarifyingChatContext = {
        businessUseCase: businessUseCase || "",
        domainKnowledge,
        domainDocuments,
        clarifyingInsights,
        generationType,
        chatHistory: chatHistory || [],
      };

      const result = await processClarifyingChat(context, userMessage);
      res.json(result);
    } catch (error: any) {
      console.error("Error in clarifying chat:", error);
      res.status(500).json({ message: error?.message || "Failed to process chat" });
    }
  });

  // Generate validation rules with clarifying insights
  app.post("/api/generate/validation-rules-with-insights", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, clarifyingInsights, model } = req.body;
      
      if (!businessUseCase) {
        return res.status(400).json({ message: "Business use case is required" });
      }

      const context = {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        clarifyingInsights,
        model,
      };

      const validationRules = await generateValidationRulesWithInsights(context);
      res.json({ validationRules });
    } catch (error: any) {
      console.error("Error generating validation rules with insights:", error);
      res.status(500).json({ message: error?.message || "Failed to generate validation rules" });
    }
  });

  // Generate guardrails with clarifying insights
  app.post("/api/generate/guardrails-with-insights", async (req, res) => {
    try {
      const { businessUseCase, domainKnowledge, domainDocuments, clarifyingInsights, model } = req.body;
      
      if (!businessUseCase) {
        return res.status(400).json({ message: "Business use case is required" });
      }

      const context = {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        clarifyingInsights,
        model,
      };

      const guardrails = await generateGuardrailsWithInsights(context);
      res.json({ guardrails });
    } catch (error: any) {
      console.error("Error generating guardrails with insights:", error);
      res.status(500).json({ message: error?.message || "Failed to generate guardrails" });
    }
  });

  // Check for conflicts between guardrails and recovery manager rules
  app.post("/api/validate/guardrail-conflicts", async (req, res) => {
    try {
      const conflictCheckSchema = z.object({
        guardrails: z.string().min(1, "Guardrails content is required"),
        recoveryConfig: z.object({
          escalationKeywords: z.array(z.string()).optional(),
          outOfScopeKeywords: z.array(z.string()).optional(),
          sensitiveTopicKeywords: z.array(z.string()).optional(),
          maxRetryAttempts: z.number().optional(),
        }).optional(),
      });

      const parsed = conflictCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const recoveryManager = createRecoveryManager(parsed.data.recoveryConfig);
      const conflicts = recoveryManager.validateAgainstGuardrails(parsed.data.guardrails);

      res.json({ 
        conflicts,
        hasErrors: conflicts.some(c => c.severity === 'error'),
        hasWarnings: conflicts.some(c => c.severity === 'warning'),
        summary: {
          errors: conflicts.filter(c => c.severity === 'error').length,
          warnings: conflicts.filter(c => c.severity === 'warning').length,
          info: conflicts.filter(c => c.severity === 'info').length,
        }
      });
    } catch (error: any) {
      console.error("Error checking guardrail conflicts:", error);
      res.status(500).json({ message: error?.message || "Failed to check guardrail conflicts" });
    }
  });

  // Generate system prompt using AI with intelligent prompt engineering
  app.post("/api/generate/system-prompt", async (req, res) => {
    try {
      const systemPromptRequestSchema = z.object({
        name: z.string().min(1, "Name is required"),
        businessUseCase: z.string().min(1, "Business use case is required"),
        domainKnowledge: z.string().optional(),
        domainDocuments: z.array(z.object({
          id: z.string(),
          filename: z.string(),
          content: z.string(),
          uploadedAt: z.string(),
        })).optional(),
        validationRules: z.string().optional(),
        guardrails: z.string().optional(),
        sampleDatasets: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
          content: z.string(),
          format: z.enum(["json", "csv", "text"]),
          isGenerated: z.boolean().optional(),
          createdAt: z.string(),
        })).optional(),
        availableActions: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          category: z.string().optional(),
          requiredFields: z.array(z.object({
            name: z.string(),
            type: z.enum(["string", "number", "boolean", "date", "select"]),
            label: z.string(),
            required: z.boolean().optional(),
            options: z.array(z.string()).optional(),
            description: z.string().optional(),
          })).optional(),
          confirmationMessage: z.string().optional(),
          successMessage: z.string().optional(),
          affectedDataFields: z.array(z.string()).optional(),
        })).optional(),
        model: z.enum(["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"]).optional(),
      });

      const parsed = systemPromptRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const context: SystemPromptContext = {
        name: parsed.data.name,
        businessUseCase: parsed.data.businessUseCase,
        domainKnowledge: parsed.data.domainKnowledge,
        domainDocuments: parsed.data.domainDocuments,
        validationRules: parsed.data.validationRules,
        guardrails: parsed.data.guardrails,
        sampleDatasets: parsed.data.sampleDatasets,
        availableActions: parsed.data.availableActions,
        model: parsed.data.model,
      };

      const systemPrompt = await generateSystemPrompt(context);
      res.json({ systemPrompt });
    } catch (error: any) {
      console.error("Error generating system prompt:", error);
      res.status(500).json({ message: error?.message || "Failed to generate system prompt" });
    }
  });

  // Generate sample data using AI
  app.post("/api/generate/sample-data", async (req, res) => {
    try {
      const sampleDataRequestSchema = z.object({
        businessUseCase: z.string().min(1, "Business use case is required"),
        domainKnowledge: z.string().optional(),
        domainDocuments: z.array(z.object({
          id: z.string(),
          filename: z.string(),
          content: z.string(),
          uploadedAt: z.string(),
        })).optional(),
        dataType: z.string().optional(),
        recordCount: z.number().min(1).max(100).optional(),
        format: z.enum(["json", "csv", "text"]).optional(),
        model: z.enum(["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"]).optional(),
      });

      const parsed = sampleDataRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const context: SampleDataGenerationContext = {
        businessUseCase: parsed.data.businessUseCase,
        domainKnowledge: parsed.data.domainKnowledge,
        domainDocuments: parsed.data.domainDocuments,
        dataType: parsed.data.dataType,
        recordCount: parsed.data.recordCount,
        format: parsed.data.format,
        model: parsed.data.model,
      };

      const sampleData = await generateSampleData(context);
      res.json(sampleData);
    } catch (error: any) {
      console.error("Error generating sample data:", error);
      res.status(500).json({ message: error?.message || "Failed to generate sample data" });
    }
  });

  // Upload sample data file
  app.post("/api/upload-sample-data", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const content = req.file.buffer.toString('utf-8');
      const filename = req.file.originalname;
      const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
      
      let format: "json" | "csv" | "text" = "text";
      if (ext === '.json') format = "json";
      else if (ext === '.csv') format = "csv";

      const dataset = {
        id: uuidv4(),
        name: filename,
        description: `Uploaded file: ${filename}`,
        content: content.substring(0, 100000),
        format: format,
        isGenerated: false,
        createdAt: new Date().toISOString(),
      };

      res.json(dataset);
    } catch (error) {
      console.error("Error uploading sample data:", error);
      res.status(500).json({ message: "Failed to upload sample data" });
    }
  });

  // Smart Business Case Extractor - extracts only prompt-relevant content
  app.post("/api/extract-business-case", async (req, res) => {
    try {
      const schema = z.object({
        businessCaseText: z.string().min(1, "Business case text is required"),
        model: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const result = await extractBusinessCaseContent(
        parsed.data.businessCaseText,
        parsed.data.model as any
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Error extracting business case:", error);
      res.status(500).json({ message: error?.message || "Failed to extract business case content" });
    }
  });

  // Generate actions and mock user data based on business use case
  app.post("/api/generate-actions", async (req, res) => {
    try {
      const schema = z.object({
        businessUseCase: z.string().min(1, "Business use case is required"),
        domainKnowledge: z.string().optional(),
        domainDocuments: z.array(z.object({
          id: z.string(),
          filename: z.string(),
          content: z.string(),
          uploadedAt: z.string(),
        })).optional(),
        model: z.string().optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const context: ActionsGenerationContext = {
        businessUseCase: parsed.data.businessUseCase,
        domainKnowledge: parsed.data.domainKnowledge,
        domainDocuments: parsed.data.domainDocuments,
        model: parsed.data.model as any,
      };

      const result = await generateActionsAndMockData(context);
      res.json(result);
    } catch (error: any) {
      console.error("Error generating actions:", error);
      res.status(500).json({ message: error?.message || "Failed to generate actions" });
    }
  });

  // === Agent Tracing API ===
  
  // Get traces for an agent (optionally filtered by session)
  app.get("/api/agents/:id/traces", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const sessionId = req.query.sessionId as string | undefined;
      const traces = await storage.getAgentTraces(req.params.id, sessionId);
      
      res.json(traces || {
        agentId: req.params.id,
        traces: [],
        stats: {
          hookCalls: {},
          signalReads: {},
          intentDistribution: {},
          classificationMethods: {},
          avgResponseTime: 0,
          totalLlmCalls: 0,
          totalTokensUsed: 0,
          errorCount: 0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching traces:", error);
      res.status(500).json({ message: "Failed to fetch traces" });
    }
  });

  // Clear traces for an agent (optionally filtered by session)
  app.delete("/api/agents/:id/traces", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const sessionId = req.query.sessionId as string | undefined;
      await storage.clearTraces(req.params.id, sessionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing traces:", error);
      res.status(500).json({ message: "Failed to clear traces" });
    }
  });

  // === Config History API ===
  
  // Get config history for an agent
  app.get("/api/agents/:id/config-history", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const history = await storage.getConfigHistory(req.params.id);
      
      res.json(history || {
        agentId: req.params.id,
        snapshots: [],
        currentVersion: 0,
      });
    } catch (error) {
      console.error("Error fetching config history:", error);
      res.status(500).json({ message: "Failed to fetch config history" });
    }
  });

  // Add a config snapshot
  app.post("/api/agents/:id/config-history", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const snapshotSchema = z.object({
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
          promptStyle: z.enum(["anthropic", "gemini", "openai", "custom"]).optional(),
          customPrompt: z.string().optional(),
        }),
        isRevertPoint: z.boolean().default(false),
      });
      
      const parsed = snapshotSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      
      const snapshot = await storage.addConfigSnapshot(req.params.id, {
        agentId: req.params.id,
        ...parsed.data,
      });
      
      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Error creating config snapshot:", error);
      res.status(500).json({ message: "Failed to create config snapshot" });
    }
  });

  // Revert to a config snapshot
  app.post("/api/agents/:id/config-history/:snapshotId/revert", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const revertedAgent = await storage.revertToSnapshot(req.params.id, req.params.snapshotId);
      if (!revertedAgent) {
        return res.status(404).json({ message: "Snapshot not found" });
      }
      
      clearAgentCache(req.params.id);
      res.json(revertedAgent);
    } catch (error) {
      console.error("Error reverting to snapshot:", error);
      res.status(500).json({ message: "Failed to revert to snapshot" });
    }
  });

  // Simulate config changes
  app.post("/api/agents/:id/simulate", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      const simulateSchema = z.object({
        testMessage: z.string().min(1),
        configOverrides: z.object({
          validationRules: z.string().optional(),
          guardrails: z.string().optional(),
          customPrompt: z.string().optional(),
        }),
      });
      
      const parsed = simulateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      
      const { testMessage, configOverrides } = parsed.data;
      
      // Generate response with original config
      const originalConfig = {
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        description: agent.description,
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
        sampleDatasets: agent.sampleDatasets,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
      };
      
      // Generate response with simulated config
      const simulatedConfig = {
        ...originalConfig,
        validationRules: configOverrides.validationRules ?? agent.validationRules,
        guardrails: configOverrides.guardrails ?? agent.guardrails,
        customPrompt: configOverrides.customPrompt ?? agent.customPrompt,
      };
      
      let originalResponse: string;
      let simulatedResponse: string;
      
      try {
        originalResponse = await generateAgentResponse(originalConfig, testMessage, []);
        simulatedResponse = await generateAgentResponse(simulatedConfig, testMessage, []);
      } catch (aiError: any) {
        return res.status(500).json({ 
          message: `AI generation error: ${aiError.message || 'Unknown error'}` 
        });
      }
      
      // Find differences
      const differences: { aspect: string; original: string; simulated: string }[] = [];
      
      if (originalResponse.length !== simulatedResponse.length) {
        differences.push({
          aspect: "Response Length",
          original: `${originalResponse.length} characters`,
          simulated: `${simulatedResponse.length} characters`,
        });
      }
      
      if (originalResponse !== simulatedResponse) {
        differences.push({
          aspect: "Content",
          original: originalResponse.substring(0, 200) + (originalResponse.length > 200 ? "..." : ""),
          simulated: simulatedResponse.substring(0, 200) + (simulatedResponse.length > 200 ? "..." : ""),
        });
      }
      
      res.json({
        originalResponse,
        simulatedResponse,
        differences,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error simulating config:", error);
      res.status(500).json({ message: "Failed to simulate config" });
    }
  });

  // Generate welcome config using AI
  app.post("/api/generate/welcome-config", async (req, res) => {
    try {
      const welcomeConfigRequestSchema = z.object({
        name: z.string().min(1, "Agent name is required"),
        businessUseCase: z.string().min(1, "Business use case is required"),
        domainKnowledge: z.string().optional(),
        sampleData: z.string().optional(),
        model: z.enum(["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview", "gemini-3-pro-preview"]).optional(),
      });

      const parsed = welcomeConfigRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const context: WelcomeConfigGenerationContext = {
        name: parsed.data.name,
        businessUseCase: parsed.data.businessUseCase,
        domainKnowledge: parsed.data.domainKnowledge,
        sampleData: parsed.data.sampleData,
        model: parsed.data.model,
      };

      const welcomeConfig = await generateWelcomeConfig(context);
      res.json(welcomeConfig);
    } catch (error: any) {
      console.error("Error generating welcome config:", error);
      res.status(500).json({ message: error?.message || "Failed to generate welcome config" });
    }
  });

  // Save welcome config for an agent
  app.put("/api/agents/:id/welcome-config", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.userId && agent.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });

      const { welcomeConfigSchema } = await import("@shared/schema");
      const parsed = welcomeConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid welcome config" });
      }

      await storage.updateAgent(req.params.id, { welcomeConfig: parsed.data });
      res.json(parsed.data);
    } catch (error: any) {
      console.error("Error saving welcome config:", error);
      res.status(500).json({ message: error?.message || "Failed to save welcome config" });
    }
  });

  // Get welcome config for an agent (public - used by chat page)
  // Auto-generates for existing agents that don't have one yet
  app.get("/api/agents/:id/welcome-config", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.welcomeConfig) {
        return res.json(agent.welcomeConfig);
      }

      // Auto-generate for existing agents that have a business use case
      if (agent.businessUseCase && agent.businessUseCase.trim()) {
        try {
          const sampleDataString = agent.sampleDatasets?.length
            ? agent.sampleDatasets.map((s: any) => `${s.name || "Sample"}:\n${typeof s.content === 'string' ? s.content : JSON.stringify(s.content)}`).join("\n\n")
            : undefined;
          const config = await generateWelcomeConfig({
            name: agent.name,
            businessUseCase: agent.businessUseCase,
            domainKnowledge: agent.domainKnowledge,
            sampleData: sampleDataString,
          });
          await storage.updateAgent(agent.id, { welcomeConfig: config });
          return res.json(config);
        } catch (genError) {
          console.error("Auto-generate welcome config failed:", genError);
        }
      }

      res.json({ enabled: false, greeting: "", suggestedPrompts: [] });
    } catch (error: any) {
      console.error("Error getting welcome config:", error);
      res.status(500).json({ message: error?.message || "Failed to get welcome config" });
    }
  });

  // ==================== PROMPT COACH ROUTES ====================

  // Get prompt coach chat history
  app.get("/api/agents/:id/prompt-coach/history", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const messages = await storage.getPromptCoachHistory(req.params.id);
      res.json(messages);
    } catch (error: any) {
      console.error("Error getting prompt coach history:", error);
      res.status(500).json({ message: "Failed to get history" });
    }
  });

  // Save prompt coach chat history
  app.put("/api/agents/:id/prompt-coach/history", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { messages } = req.body;
      if (!Array.isArray(messages)) {
        return res.status(400).json({ message: "Messages must be an array" });
      }
      await storage.savePromptCoachHistory(req.params.id, messages);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving prompt coach history:", error);
      res.status(500).json({ message: "Failed to save history" });
    }
  });

  // Clear prompt coach chat history
  app.delete("/api/agents/:id/prompt-coach/history", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.clearPromptCoachHistory(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error clearing prompt coach history:", error);
      res.status(500).json({ message: "Failed to clear history" });
    }
  });

  // Send message to prompt coach for an agent
  app.post("/api/agents/:id/prompt-coach", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { message, chatHistory } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }

      const sampleDataSummary = agent.sampleDatasets?.length
        ? agent.sampleDatasets.map((s: any) => `${s.name} (${s.format}): ${s.description || 'no description'}`).join("; ")
        : "";

      const welcomeConfigStr = agent.welcomeConfig
        ? `Greeting: "${agent.welcomeConfig.greeting || ''}", Prompts: ${(agent.welcomeConfig.suggestedPrompts || []).map((p: any) => p.title).join(", ")}`
        : "";

      const actionsStr = agent.availableActions?.length
        ? agent.availableActions.map((a: any) => `${a.name}: ${a.description}`).join("; ")
        : "";

      const context: PromptCoachContext = {
        agentName: agent.name,
        businessUseCase: agent.businessUseCase || "",
        domainKnowledge: agent.domainKnowledge || "",
        validationRules: agent.validationRules || "",
        guardrails: agent.guardrails || "",
        sampleDataSummary,
        welcomeConfig: welcomeConfigStr,
        availableActions: actionsStr,
        customPrompt: agent.customPrompt || "",
      };

      const history: PromptCoachMessage[] = Array.isArray(chatHistory) ? chatHistory : [];

      const response = await generatePromptCoachResponse(context, history, message);
      res.json(response);
    } catch (error: any) {
      console.error("Error in prompt coach:", error);
      res.status(500).json({ message: error?.message || "Failed to get coach response" });
    }
  });

  // Apply a suggested change from the prompt coach
  app.post("/api/agents/:id/save-prompt", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { customPrompt, revisedBy } = req.body;
      if (typeof customPrompt !== "string") {
        return res.status(400).json({ message: "customPrompt is required" });
      }

      const validSources = ["user", "prompt-coach", "ai-generate"];
      const source = validSources.includes(revisedBy) ? revisedBy : "user";

      const now = new Date().toISOString();
      const update: Record<string, any> = {
        customPrompt,
        promptLastRevisedBy: source,
        promptLastRevisedAt: now,
      };

      const mergedAgent = { ...agent, ...update };
      update.configFieldsHash = computeConfigFieldsHash(mergedAgent);

      await storage.updateAgent(req.params.id, update as any);
      clearAgentCache(req.params.id);

      res.json({ success: true, promptLastRevisedBy: source, promptLastRevisedAt: now, configFieldsHash: update.configFieldsHash });
    } catch (error: any) {
      console.error("Error saving prompt:", error);
      res.status(500).json({ message: error?.message || "Failed to save prompt" });
    }
  });

  app.get("/api/agents/:id/prompt-sync-status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const currentHash = computeConfigFieldsHash(agent);
      const isInSync = !agent.configFieldsHash || agent.configFieldsHash === currentHash;

      res.json({
        isInSync,
        promptLastRevisedBy: agent.promptLastRevisedBy || null,
        promptLastRevisedAt: agent.promptLastRevisedAt || null,
        configFieldsHash: agent.configFieldsHash || null,
        currentConfigHash: currentHash,
      });
    } catch (error: any) {
      console.error("Error checking prompt sync status:", error);
      res.status(500).json({ message: error?.message || "Failed to check sync status" });
    }
  });

  app.post("/api/agents/:id/prompt-coach/apply", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.userId !== req.user!.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { field, action, content, promptUpdate } = req.body;

      const allowedFields = ["businessUseCase", "domainKnowledge", "validationRules", "guardrails", "welcomeGreeting", "welcomeSuggestedPrompts"];
      if (!allowedFields.includes(field)) {
        return res.status(400).json({ message: `Invalid field: ${field}. Allowed: ${allowedFields.join(", ")}` });
      }

      if (!content || typeof content !== "string") {
        return res.status(400).json({ message: "Content is required" });
      }

      let update: Record<string, any>;

      if (field === "welcomeGreeting") {
        const currentConfig = agent.welcomeConfig || { enabled: true, greeting: "", suggestedPrompts: [] };
        update = {
          welcomeConfig: {
            ...currentConfig,
            greeting: content,
          },
        };
      } else if (field === "welcomeSuggestedPrompts") {
        try {
          const prompts = JSON.parse(content);
          if (!Array.isArray(prompts)) {
            return res.status(400).json({ message: "Welcome suggested prompts content must be a JSON array" });
          }
          const currentConfig = agent.welcomeConfig || { enabled: true, greeting: "", suggestedPrompts: [] };
          update = {
            welcomeConfig: {
              ...currentConfig,
              suggestedPrompts: prompts,
            },
          };
        } catch {
          return res.status(400).json({ message: "Invalid JSON for welcome suggested prompts" });
        }
      } else {
        let newValue: string;
        const currentValue = (agent as any)[field] || "";

        if (action === "replace") {
          newValue = content;
        } else if (action === "append") {
          newValue = currentValue ? `${currentValue}\n\n${content}` : content;
        } else {
          return res.status(400).json({ message: "Invalid action. Must be 'replace' or 'append'" });
        }

        update = { [field]: newValue };
      }

      let promptUpdated = false;
      if (promptUpdate && typeof promptUpdate === "object" && agent.customPrompt) {
        const { findText, replaceText } = promptUpdate;
        if (findText && typeof findText === "string" && typeof replaceText === "string") {
          const currentPrompt = agent.customPrompt;
          if (currentPrompt.includes(findText)) {
            update.customPrompt = currentPrompt.replace(findText, replaceText);
            update.promptLastRevisedBy = "prompt-coach";
            update.promptLastRevisedAt = new Date().toISOString();
            const mergedAgent = { ...agent, ...update };
            update.configFieldsHash = computeConfigFieldsHash(mergedAgent);
            promptUpdated = true;
          }
        }
      }

      await storage.updateAgent(req.params.id, update as any);

      clearAgentCache(req.params.id);

      res.json({ success: true, field, promptUpdated });
    } catch (error: any) {
      console.error("Error applying prompt coach change:", error);
      res.status(500).json({ message: error?.message || "Failed to apply change" });
    }
  });

  // Diagnostic endpoint - returns DB info and agent counts (no auth required)
  app.get("/api/admin/db-info", async (_req: Request, res: Response) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const crypto = await import('crypto');
      const fs = await import('fs');
      const path = await import('path');
      
      const dbUrlHash = crypto.createHash("md5").update(process.env.DATABASE_URL || "").digest("hex").substring(0, 8);
      const agentCountRes = await db.execute(sql`SELECT count(*)::int as count FROM agents`);
      const userCountRes = await db.execute(sql`SELECT count(*)::int as count FROM users`);
      const componentCountRes = await db.execute(sql`SELECT count(*)::int as count FROM agent_components`);
      
      const agentsByUser = await db.execute(sql`SELECT user_id, count(*)::int as count FROM agents GROUP BY user_id`);
      const agentCount = agentCountRes.rows?.[0]?.count ?? agentCountRes[0]?.count;
      const userCount = userCountRes.rows?.[0]?.count ?? userCountRes[0]?.count;
      const componentCount = componentCountRes.rows?.[0]?.count ?? componentCountRes[0]?.count;
      
      const agentsDirExists = fs.existsSync('./agents');
      const agentDirCount = agentsDirExists ? fs.readdirSync('./agents').filter((d: string) => fs.statSync(path.join('./agents', d)).isDirectory()).length : 0;
      
      res.json({
        dbUrlHash,
        nodeEnv: process.env.NODE_ENV,
        enableSync: process.env.ENABLE_SYNC,
        agentCount: agentCount,
        userCount: userCount, 
        componentCount: componentCount,
        agentsByUser: agentsByUser.rows ?? agentsByUser,
        agentsDirExists,
        agentDirCount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cleanup test users endpoint - removes auto-generated test accounts and their data
  app.post("/api/admin/cleanup-test-users", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }
      const syncKey = req.headers['x-sync-key'];
      if (syncKey !== 'temp-sync-2026') {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');

      const keepUsernames = ['kengqui.chia@ukg.com', 'svstoyanov', 'svstoyanovvvv', 'test@abv.bg'];

      // Get test user IDs
      const testUsersRes = await db.execute(sql`SELECT id, username FROM users WHERE username NOT IN ('kengqui.chia@ukg.com', 'svstoyanov', 'svstoyanovvvv', 'test@abv.bg')`);
      const testUsers = testUsersRes.rows ?? testUsersRes;
      const testUserIds = testUsers.map((u: any) => u.id);

      if (testUserIds.length === 0) {
        return res.json({ message: "No test users to clean up", deleted: 0 });
      }

      // Get agent IDs for test users
      const testAgentsRes = await db.execute(sql`SELECT id FROM agents WHERE user_id = ANY(${testUserIds})`);
      const testAgents = testAgentsRes.rows ?? testAgentsRes;
      const testAgentIds = testAgents.map((a: any) => a.id);

      // Delete in order: messages -> sessions -> components -> traces -> coach history -> config snapshots -> agents -> auth sessions -> users
      if (testAgentIds.length > 0) {
        await db.execute(sql`DELETE FROM chat_messages WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM chat_sessions WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM agent_components WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM agent_traces WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM prompt_coach_history WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM config_snapshots WHERE agent_id = ANY(${testAgentIds})`);
        await db.execute(sql`DELETE FROM agents WHERE id = ANY(${testAgentIds})`);
      }
      await db.execute(sql`DELETE FROM auth_sessions WHERE user_id = ANY(${testUserIds})`);
      await db.execute(sql`DELETE FROM users WHERE id = ANY(${testUserIds})`);

      res.json({
        message: "Cleanup complete",
        deletedUsers: testUserIds.length,
        deletedAgents: testAgentIds.length,
        keptUsers: keepUsernames,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export a single agent's config data (for prod-to-dev sync)
  app.get("/api/admin/export-agent/:agentId", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const agent = await storage.getAgent(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      res.json({ success: true, agent });
    } catch (error: any) {
      console.error("Export agent error:", error);
      res.status(500).json({ message: error?.message || "Export failed" });
    }
  });

  // List all agents for sync (for prod-to-dev sync UI)
  app.get("/api/admin/export-agents-list", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const agents = await storage.getAgents();
      const summary = agents.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        updatedAt: a.updatedAt,
        hasPrompt: !!(a.customPrompt && a.customPrompt.trim()),
      }));

      res.json({ success: true, agents: summary });
    } catch (error: any) {
      console.error("Export agents list error:", error);
      res.status(500).json({ message: error?.message || "Export list failed" });
    }
  });

  // Shared list of fields that sync copies from production to dev
  const syncFieldsToCompare = [
    { key: 'name', label: 'Agent Name' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'promptStyle', label: 'Prompt Style' },
    { key: 'mockMode', label: 'Mock Mode' },
    { key: 'configurationStep', label: 'Configuration Step' },
    { key: 'businessUseCase', label: 'Business Use Case' },
    { key: 'domainKnowledge', label: 'Domain Knowledge' },
    { key: 'validationRules', label: 'Validation Rules' },
    { key: 'guardrails', label: 'Guardrails' },
    { key: 'customPrompt', label: 'System Prompt' },
    { key: 'domainDocuments', label: 'Domain Documents' },
    { key: 'sampleDatasets', label: 'Sample Data' },
    { key: 'clarifyingInsights', label: 'Clarifying Insights' },
    { key: 'availableActions', label: 'Available Actions' },
    { key: 'mockUserState', label: 'Mock User State' },
    { key: 'welcomeConfig', label: 'Welcome Config' },
  ];

  // Batch check which agents have differences between dev and production
  app.get("/api/admin/sync-status", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.json({ success: true, statuses: {} });
      }

      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const prodUrl = process.env.PROD_APP_URL;
      if (!prodUrl) {
        return res.json({ success: true, statuses: {} });
      }

      const devAgents = await storage.getAgentsByUserId(user.id);
      const statuses: Record<string, { hasDifferences: boolean; changedFields: string[] }> = {};

      for (const devAgent of devAgents) {
        try {
          const exportUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/export-agent/${devAgent.id}`;
          const response = await fetch(exportUrl);
          if (!response.ok) {
            continue;
          }
          const { agent: prodAgent } = await response.json();
          if (!prodAgent) continue;

          const changedFields: string[] = [];
          for (const { key, label } of syncFieldsToCompare) {
            const devVal = JSON.stringify((devAgent as any)[key] ?? null);
            const prodVal = JSON.stringify((prodAgent as any)[key] ?? null);
            if (devVal !== prodVal) {
              changedFields.push(label);
            }
          }

          statuses[devAgent.id] = {
            hasDifferences: changedFields.length > 0,
            changedFields,
          };
        } catch {
          // Skip agents that fail to fetch from prod
        }
      }

      res.json({ success: true, statuses });
    } catch (error: any) {
      console.error("Sync status error:", error);
      res.status(500).json({ message: error?.message || "Sync status check failed" });
    }
  });

  // Preview differences between dev and production agent configs
  app.post("/api/admin/sync-preview", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { agentId } = req.body;
      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      const devAgent = await storage.getAgent(agentId);
      if (!devAgent || devAgent.userId !== user.id) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const prodUrl = process.env.PROD_APP_URL;
      if (!prodUrl) {
        return res.status(400).json({ message: "PROD_APP_URL environment variable is not set." });
      }

      const exportUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/export-agent/${agentId}`;
      const response = await fetch(exportUrl);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Failed to fetch from production" }));
        return res.status(response.status).json({ message: err.message || "Failed to fetch from production" });
      }

      const { agent: prodAgent } = await response.json();
      if (!prodAgent) {
        return res.status(404).json({ message: "Agent not found in production" });
      }
      const differences: Array<{ field: string; label: string; devValue: string; prodValue: string }> = [];

      for (const { key, label } of syncFieldsToCompare) {
        const devVal = JSON.stringify((devAgent as any)[key] ?? null);
        const prodVal = JSON.stringify((prodAgent as any)[key] ?? null);
        if (devVal !== prodVal) {
          const summarize = (val: any) => {
            if (val === null || val === undefined || val === '') return '(empty)';
            if (typeof val === 'string') {
              return val.length > 120 ? val.substring(0, 120) + '...' : val;
            }
            const s = JSON.stringify(val);
            return s.length > 120 ? s.substring(0, 120) + '...' : s;
          };
          differences.push({
            field: key,
            label,
            devValue: summarize((devAgent as any)[key]),
            prodValue: summarize((prodAgent as any)[key]),
          });
        }
      }

      res.json({
        success: true,
        hasDifferences: differences.length > 0,
        differences,
        agentName: prodAgent.name,
      });
    } catch (error: any) {
      console.error("Sync preview error:", error);
      res.status(500).json({ message: error?.message || "Preview failed" });
    }
  });

  // Import agent config from production into dev (prod-to-dev sync)
  app.post("/api/admin/sync-from-prod", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { agentId } = req.body;
      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      const existingAgent = await storage.getAgent(agentId);
      if (!existingAgent || existingAgent.userId !== user.id) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const prodUrl = process.env.PROD_APP_URL;
      if (!prodUrl) {
        return res.status(400).json({ message: "PROD_APP_URL environment variable is not set. Please set it to your production app URL (e.g., https://your-app.replit.app)." });
      }

      const exportUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/export-agent/${agentId}`;
      const response = await fetch(exportUrl);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Failed to fetch from production" }));
        return res.status(response.status).json({ message: err.message || "Failed to fetch from production" });
      }

      const { agent: prodAgent } = await response.json();
      if (!prodAgent) {
        return res.status(404).json({ message: "Agent not found in production" });
      }

      if (existingAgent) {
        const updateData: UpdateAgent = {};
        for (const { key } of syncFieldsToCompare) {
          (updateData as any)[key] = (prodAgent as any)[key];
        }
        await storage.updateAgent(agentId, updateData);
      } else {
        return res.status(404).json({ message: "Agent does not exist in dev. Only existing agents can be synced." });
      }

      res.json({ success: true, message: "Agent synced from production", agentName: prodAgent.name });
    } catch (error: any) {
      console.error("Sync from prod error:", error);
      res.status(500).json({ message: error?.message || "Sync from production failed" });
    }
  });

  // Import agent config from dev into production (dev-to-prod sync - receiver endpoint)
  app.post("/api/admin/import-agent", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const syncKey = req.headers['x-sync-key'];
      if (syncKey !== 'temp-sync-2026') {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { agentId, updates } = req.body;
      if (!agentId || !updates) {
        return res.status(400).json({ message: "agentId and updates are required" });
      }

      const existingAgent = await storage.getAgent(agentId);
      if (!existingAgent) {
        return res.status(404).json({ message: "Agent not found in this environment" });
      }

      await storage.updateAgent(agentId, updates);
      res.json({ success: true, message: "Agent updated successfully" });
    } catch (error: any) {
      console.error("Import agent error:", error);
      res.status(500).json({ message: error?.message || "Import failed" });
    }
  });

  // Push agent config from dev to production (dev-to-prod sync)
  app.post("/api/admin/sync-to-prod", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { agentId } = req.body;
      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      const devAgent = await storage.getAgent(agentId);
      if (!devAgent || devAgent.userId !== user.id) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const prodUrl = process.env.PROD_APP_URL;
      if (!prodUrl) {
        return res.status(400).json({ message: "PROD_APP_URL environment variable is not set." });
      }

      const updateData: Record<string, any> = {};
      for (const { key } of syncFieldsToCompare) {
        updateData[key] = (devAgent as any)[key];
      }

      const importUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/import-agent`;
      const response = await fetch(importUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sync-key': 'temp-sync-2026',
        },
        body: JSON.stringify({ agentId, updates: updateData }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Failed to push to production" }));
        return res.status(response.status).json({ message: err.message || "Failed to push to production" });
      }

      res.json({ success: true, message: "Agent pushed to production", agentName: devAgent.name });
    } catch (error: any) {
      console.error("Sync to prod error:", error);
      res.status(500).json({ message: error?.message || "Push to production failed" });
    }
  });

  // Preview differences for dev-to-prod push
  app.post("/api/admin/sync-to-prod-preview", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { agentId } = req.body;
      if (!agentId) {
        return res.status(400).json({ message: "agentId is required" });
      }

      const devAgent = await storage.getAgent(agentId);
      if (!devAgent || devAgent.userId !== user.id) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const prodUrl = process.env.PROD_APP_URL;
      if (!prodUrl) {
        return res.status(400).json({ message: "PROD_APP_URL environment variable is not set." });
      }

      const exportUrl = `${prodUrl.replace(/\/$/, '')}/api/admin/export-agent/${agentId}`;
      const response = await fetch(exportUrl);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: "Failed to fetch from production" }));
        return res.status(response.status).json({ message: err.message || "Failed to fetch from production" });
      }

      const { agent: prodAgent } = await response.json();
      if (!prodAgent) {
        return res.status(404).json({ message: "Agent not found in production" });
      }

      const differences: Array<{ field: string; label: string; devValue: string; prodValue: string }> = [];

      for (const { key, label } of syncFieldsToCompare) {
        const devVal = JSON.stringify((devAgent as any)[key] ?? null);
        const prodVal = JSON.stringify((prodAgent as any)[key] ?? null);
        if (devVal !== prodVal) {
          const summarize = (val: any) => {
            if (val === null || val === undefined || val === '') return '(empty)';
            if (typeof val === 'string') {
              return val.length > 120 ? val.substring(0, 120) + '...' : val;
            }
            const s = JSON.stringify(val);
            return s.length > 120 ? s.substring(0, 120) + '...' : s;
          };
          differences.push({
            field: key,
            label,
            devValue: summarize((devAgent as any)[key]),
            prodValue: summarize((prodAgent as any)[key]),
          });
        }
      }

      res.json({
        success: true,
        hasDifferences: differences.length > 0,
        differences,
        agentName: devAgent.name,
      });
    } catch (error: any) {
      console.error("Sync to prod preview error:", error);
      res.status(500).json({ message: error?.message || "Preview failed" });
    }
  });

  // Pending sync queue management (for publish-based sync)
  app.get("/api/admin/pending-sync", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { getPendingOps } = await import("./pending-sync");
      res.json({ success: true, operations: getPendingOps() });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to get pending ops" });
    }
  });

  app.post("/api/admin/pending-sync", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const { type, agentId, agentName, updates } = req.body;
      if (!type || !agentId) {
        return res.status(400).json({ message: "type and agentId are required" });
      }

      if (type === "update" && !updates) {
        return res.status(400).json({ message: "updates are required for update operations" });
      }

      const { addPendingOp, getPendingOps } = await import("./pending-sync");
      const op = {
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: type as "update" | "delete",
        agentId,
        agentName,
        updates,
        addedAt: new Date().toISOString(),
      };
      addPendingOp(op);
      res.json({ success: true, operation: op, totalPending: getPendingOps().length });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to add pending op" });
    }
  });

  app.delete("/api/admin/pending-sync", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromSession(req);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const { clearPendingOps } = await import("./pending-sync");
      clearPendingOps();
      res.json({ success: true, message: "Pending sync queue cleared" });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to clear pending ops" });
    }
  });

  // Data sync endpoint - only active when ENABLE_SYNC=true env var is set
  const expressModule = await import('express');
  app.post("/api/admin/sync-data", expressModule.json({ limit: '50mb' }), async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }

      const { users: userData, agents: agentData, components, authSessions: authData, chatSessions: sessionData, chatMessages: messageData, traces, snapshots, coachHistory } = req.body;

      const { db } = await import('./db');
      const schema = await import('@shared/schema');
      const { sql } = await import('drizzle-orm');

      await db.execute(sql`DELETE FROM prompt_coach_history`);
      await db.execute(sql`DELETE FROM config_snapshots`);
      await db.execute(sql`DELETE FROM agent_traces`);
      await db.execute(sql`DELETE FROM chat_messages`);
      await db.execute(sql`DELETE FROM chat_sessions`);
      await db.execute(sql`DELETE FROM agent_components`);
      await db.execute(sql`DELETE FROM auth_sessions`);
      await db.execute(sql`DELETE FROM agents`);
      await db.execute(sql`DELETE FROM users`);

      if (userData?.length) await db.insert(schema.usersTable).values(userData);
      if (agentData?.length) {
        for (let i = 0; i < agentData.length; i += 5) {
          await db.insert(schema.agentsTable).values(agentData.slice(i, i + 5));
        }
      }
      if (components?.length) {
        for (let i = 0; i < components.length; i += 20) {
          await db.insert(schema.agentComponentsTable).values(components.slice(i, i + 20));
        }
      }
      if (authData?.length) await db.insert(schema.authSessionsTable).values(authData);
      if (sessionData?.length) {
        for (let i = 0; i < sessionData.length; i += 20) {
          await db.insert(schema.chatSessionsTable).values(sessionData.slice(i, i + 20));
        }
      }
      if (messageData?.length) {
        for (let i = 0; i < messageData.length; i += 20) {
          await db.insert(schema.chatMessagesTable).values(messageData.slice(i, i + 20));
        }
      }
      if (traces?.length) await db.insert(schema.agentTracesTable).values(traces);
      if (snapshots?.length) await db.insert(schema.configSnapshotsTable).values(snapshots);
      if (coachHistory?.length) await db.insert(schema.promptCoachHistoryTable).values(coachHistory);

      res.json({ 
        success: true, 
        counts: {
          users: userData?.length || 0,
          agents: agentData?.length || 0,
          components: components?.length || 0,
          sessions: sessionData?.length || 0,
          messages: messageData?.length || 0,
        }
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ message: error?.message || "Sync failed" });
    }
  });

  app.get("/api/admin/backup-export", async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { db } = await import('./db');
      const schema = await import('@shared/schema');

      const agents = await db.select().from(schema.agentsTable);
      const components = await db.select().from(schema.agentComponentsTable);
      const usersRaw = await db.select().from(schema.usersTable);
      const users = usersRaw.map(({ password, ...rest }) => rest);
      const chatSessions = await db.select().from(schema.chatSessionsTable);
      const chatMessages = await db.select().from(schema.chatMessagesTable);
      const traces = await db.select().from(schema.agentTracesTable);
      const snapshots = await db.select().from(schema.configSnapshotsTable);
      const coachHistory = await db.select().from(schema.promptCoachHistoryTable);

      const backup = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        exportedBy: user.username,
        counts: {
          users: users.length,
          agents: agents.length,
          components: components.length,
          chatSessions: chatSessions.length,
          chatMessages: chatMessages.length,
          traces: traces.length,
          snapshots: snapshots.length,
          coachHistory: coachHistory.length,
        },
        data: {
          users,
          agents,
          components,
          chatSessions,
          chatMessages,
          traces,
          snapshots,
          coachHistory,
        },
      };

      const filename = `agent-studio-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(backup);
    } catch (error: any) {
      console.error("Backup export error:", error);
      res.status(500).json({ message: error?.message || "Export failed" });
    }
  });

  const backupImportParser = (await import('express')).json({ limit: '100mb' });
  app.post("/api/admin/backup-import", backupImportParser, async (req: Request, res: Response) => {
    try {
      if (process.env.ENABLE_SYNC !== 'true') {
        return res.status(404).json({ message: "Not found" });
      }
      const user = await getUserFromSession(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const backup = req.body;
      if (!backup?.version || !backup?.data) {
        return res.status(400).json({ message: "Invalid backup file format" });
      }

      const { db } = await import('./db');
      const { pool } = await import('./db');
      const schema = await import('@shared/schema');

      const { users: userData, agents: agentData, components, chatSessions: sessionData, chatMessages: messageData, traces, snapshots, coachHistory } = backup.data;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query('DELETE FROM prompt_coach_history');
        await client.query('DELETE FROM config_snapshots');
        await client.query('DELETE FROM agent_traces');
        await client.query('DELETE FROM chat_messages');
        await client.query('DELETE FROM chat_sessions');
        await client.query('DELETE FROM agent_components');
        await client.query('DELETE FROM auth_sessions');
        await client.query('DELETE FROM agents');
        await client.query('DELETE FROM users');

        const { sql } = await import('drizzle-orm');
        const txDb = db;

        if (userData?.length) await txDb.insert(schema.usersTable).values(userData);
        if (agentData?.length) {
          for (let i = 0; i < agentData.length; i += 5) {
            await txDb.insert(schema.agentsTable).values(agentData.slice(i, i + 5));
          }
        }
        if (components?.length) {
          for (let i = 0; i < components.length; i += 20) {
            await txDb.insert(schema.agentComponentsTable).values(components.slice(i, i + 20));
          }
        }
        if (sessionData?.length) {
          for (let i = 0; i < sessionData.length; i += 20) {
            await txDb.insert(schema.chatSessionsTable).values(sessionData.slice(i, i + 20));
          }
        }
        if (messageData?.length) {
          for (let i = 0; i < messageData.length; i += 20) {
            await txDb.insert(schema.chatMessagesTable).values(messageData.slice(i, i + 20));
          }
        }
        if (traces?.length) {
          for (let i = 0; i < traces.length; i += 20) {
            await txDb.insert(schema.agentTracesTable).values(traces.slice(i, i + 20));
          }
        }
        if (snapshots?.length) {
          for (let i = 0; i < snapshots.length; i += 20) {
            await txDb.insert(schema.configSnapshotsTable).values(snapshots.slice(i, i + 20));
          }
        }
        if (coachHistory?.length) {
          for (let i = 0; i < coachHistory.length; i += 20) {
            await txDb.insert(schema.promptCoachHistoryTable).values(coachHistory.slice(i, i + 20));
          }
        }

        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        message: "Backup restored successfully",
        counts: backup.counts,
      });
    } catch (error: any) {
      console.error("Backup import error:", error);
      res.status(500).json({ message: error?.message || "Import failed" });
    }
  });

  app.post("/api/admin/force-snapshot", async (_req: Request, res: Response) => {
    try {
      const { writeAgentSnapshot } = await import("./snapshot-sync");
      await writeAgentSnapshot();
      res.json({ success: true, message: "Snapshot written successfully" });
    } catch (error: any) {
      console.error("Force snapshot error:", error);
      res.status(500).json({ message: error?.message || "Snapshot write failed" });
    }
  });

  return httpServer;
}
