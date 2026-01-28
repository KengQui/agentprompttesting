import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
import { generateAgentResponse, generateValidationRules, generateGuardrails, generateSystemPrompt, generateSampleData, evaluateContextSufficiency, processClarifyingChat, generateValidationRulesWithInsights, generateGuardrailsWithInsights, type GenerationContext, type SystemPromptContext, type SampleDataGenerationContext, type ClarifyingChatContext } from "./gemini";
import { loadAgentComponents, clearAgentCache, hasCustomComponents } from "./agent-loader";
import { createRecoveryManager } from "./components/recovery-manager";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

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
        content: z.string().min(1).max(2000, "Message exceeds 2000 character limit") 
      });
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Content is required" });
      }

      const userInput = parsed.data.content;
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
      const agentConfig = {
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

      let responseContent: string;
      let traceSuccess = true;
      let detectedIntent = "answer_question";
      let classificationMethod = "standard";

      try {
        // Try to use orchestrator if agent has custom components
        if (hasCustomComponents(req.params.id)) {
          classificationMethod = "orchestrator";
          const { orchestrator } = await loadAgentComponents(req.params.id, agentConfig);
          const turnResult = await orchestrator.processTurn(req.params.id, userInput);
          detectedIntent = turnResult.intent;
          
          // Record intent classification trace
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
          
          // If the orchestrator handled it completely (like go_back, change_previous_answer)
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
            // Pass to Gemini with intent context for better response generation
            const intentPrefix = turnResult.intent !== 'answer_question' 
              ? `[The user's intent appears to be: ${turnResult.intent}. Please respond accordingly.]\n\n`
              : '';
            
            const llmStartTime = Date.now();
            responseContent = await generateAgentResponse(
              agentConfig,
              intentPrefix + userInput,
              chatHistory
            );
            
            traceEntries.push({
              id: `entry-${Date.now()}-3`,
              type: "llm_call",
              name: "Gemini Response Generation",
              timestamp: new Date().toISOString(),
              duration: Date.now() - llmStartTime,
              metadata: { 
                model: "gemini",
                intent: turnResult.intent,
              },
            });
          }
        } else {
          // No custom components, use standard Gemini response
          classificationMethod = "standard";
          
          traceEntries.push({
            id: `entry-${Date.now()}-1`,
            type: "intent_classification",
            name: "Standard Classification",
            timestamp: new Date().toISOString(),
            metadata: {
              intent: "answer_question",
              classificationMethod: "standard",
            },
          });
          
          const llmStartTime = Date.now();
          responseContent = await generateAgentResponse(
            agentConfig,
            userInput,
            chatHistory
          );
          
          traceEntries.push({
            id: `entry-${Date.now()}-2`,
            type: "llm_call",
            name: "Gemini Response Generation",
            timestamp: new Date().toISOString(),
            duration: Date.now() - llmStartTime,
            metadata: { model: "gemini" },
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
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ message: "Failed to clear messages" });
    }
  });

  // Legacy: Send a message to an agent (will use first session or create one)
  app.post("/api/agents/:id/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;

      // Get or create a default session
      let sessions = await storage.getSessions(req.params.id);
      let sessionId: string;
      
      if (sessions.length === 0) {
        const session = await storage.createSession({
          agentId: req.params.id,
          title: "Default Session",
        });
        sessionId = session.id;
      } else {
        sessionId = sessions[0].id;
      }

      const contentSchema = z.object({ 
        content: z.string().min(1).max(2000, "Message exceeds 2000 character limit") 
      });
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Content is required" });
      }

      const userInput = parsed.data.content;
      const traceStartTime = Date.now();
      const traceEntries: TraceEntry[] = [];

      // Add user message
      const userMessage = await storage.addMessage({
        agentId: req.params.id,
        sessionId,
        role: "user",
        content: userInput,
      });

      // Get chat history for context
      const allMessages = await storage.getMessages(req.params.id, sessionId);
      const chatHistory = allMessages.slice(0, -1).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      // Load agent components (orchestrator with turn manager)
      const agentConfig = {
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

      let responseContent: string;
      let traceSuccess = true;

      try {
        // Try to use orchestrator if agent has custom components
        if (hasCustomComponents(req.params.id)) {
          const { orchestrator } = await loadAgentComponents(req.params.id, agentConfig);
          const turnResult = await orchestrator.processTurn(req.params.id, userInput);
          
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
          
          // If the orchestrator handled it completely (like go_back, change_previous_answer)
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
            // Pass to Gemini with intent context for better response generation
            const intentPrefix = turnResult.intent !== 'answer_question' 
              ? `[The user's intent appears to be: ${turnResult.intent}. Please respond accordingly.]\n\n`
              : '';
            const llmStartTime = Date.now();
            responseContent = await generateAgentResponse(
              agentConfig,
              intentPrefix + userInput,
              chatHistory
            );
            traceEntries.push({
              id: `entry-${Date.now()}-3`,
              type: "llm_call",
              name: "Gemini Response Generation",
              timestamp: new Date().toISOString(),
              duration: Date.now() - llmStartTime,
              metadata: { model: "gemini", intent: turnResult.intent },
            });
          }
        } else {
          // No custom components, use standard Gemini response
          traceEntries.push({
            id: `entry-${Date.now()}-1`,
            type: "intent_classification",
            name: "Standard Classification",
            timestamp: new Date().toISOString(),
            metadata: { intent: "answer_question", classificationMethod: "standard" },
          });
          
          const llmStartTime = Date.now();
          responseContent = await generateAgentResponse(
            agentConfig,
            userInput,
            chatHistory
          );
          traceEntries.push({
            id: `entry-${Date.now()}-2`,
            type: "llm_call",
            name: "Gemini Response Generation",
            timestamp: new Date().toISOString(),
            duration: Date.now() - llmStartTime,
            metadata: { model: "gemini" },
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
        sessionId,
        userInput,
        agentResponse: responseContent,
        startTime: new Date(traceStartTime).toISOString(),
        endTime: new Date().toISOString(),
        totalDuration: Date.now() - traceStartTime,
        entries: traceEntries,
        success: traceSuccess,
      };
      
      storage.addTurnTrace(req.params.id, turnTrace).catch(err => {
        console.error("Failed to save trace:", err);
      });

      // Add assistant message
      const assistantMessage = await storage.addMessage({
        agentId: req.params.id,
        sessionId,
        role: "assistant",
        content: responseContent,
      });

      res.json([userMessage, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Clear all chat history for an agent
  app.delete("/api/agents/:id/messages", async (req: AuthenticatedRequest, res) => {
    try {
      const agent = await verifyAgentOwnership(req, res, req.params.id);
      if (!agent) return;
      
      await storage.clearMessages(req.params.id);
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
      
      res.json({ hasCustomComponents: hasCustomComponents(req.params.id) });
    } catch (error) {
      console.error("Error checking components:", error);
      res.status(500).json({ message: "Failed to check components" });
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

  // Generate system prompt using AI based on prompt style
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
        promptStyle: z.enum(["anthropic", "gemini", "openai"]),
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
        promptStyle: parsed.data.promptStyle,
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

  return httpServer;
}
