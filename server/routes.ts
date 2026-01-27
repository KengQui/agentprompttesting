import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAgentSchema, updateAgentSchema } from "@shared/schema";
import { z } from "zod";
import { generateAgentResponse } from "./gemini";
import { loadAgentComponents, clearAgentCache, hasCustomComponents } from "./agent-loader";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get all agents
  app.get("/api/agents", async (req, res) => {
    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  // Get single agent
  app.get("/api/agents/:id", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      res.json(agent);
    } catch (error) {
      console.error("Error fetching agent:", error);
      res.status(500).json({ message: "Failed to fetch agent" });
    }
  });

  // Create agent
  app.post("/api/agents", async (req, res) => {
    try {
      const parsed = insertAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.message });
      }
      const agent = await storage.createAgent(parsed.data);
      res.status(201).json(agent);
    } catch (error) {
      console.error("Error creating agent:", error);
      res.status(500).json({ message: "Failed to create agent" });
    }
  });

  // Update agent
  app.patch("/api/agents/:id", async (req, res) => {
    try {
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

  // Delete agent
  app.delete("/api/agents/:id", async (req, res) => {
    try {
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

  // Get messages for an agent
  app.get("/api/agents/:id/messages", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      const messages = await storage.getMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send a message to an agent with Turn Manager + Gemini AI response
  app.post("/api/agents/:id/messages", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const contentSchema = z.object({ 
        content: z.string().min(1).max(2000, "Message exceeds 2000 character limit") 
      });
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Content is required" });
      }

      const userInput = parsed.data.content;

      // Add user message
      const userMessage = await storage.addMessage({
        agentId: req.params.id,
        role: "user",
        content: userInput,
      });

      // Get chat history for context
      const allMessages = await storage.getMessages(req.params.id);
      const chatHistory = allMessages.slice(0, -1).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      // Load agent components (orchestrator with turn manager)
      const agentConfig = {
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        description: agent.description,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
      };

      let responseContent: string;

      try {
        // Try to use orchestrator if agent has custom components
        if (hasCustomComponents(req.params.id)) {
          const { orchestrator } = await loadAgentComponents(req.params.id, agentConfig);
          const turnResult = await orchestrator.processTurn(req.params.id, userInput);
          
          // If the orchestrator handled it completely (like go_back, change_previous_answer)
          if (turnResult.nextAction !== 'generate_ai_response') {
            responseContent = turnResult.response;
          } else {
            // Pass to Gemini with intent context for better response generation
            const intentPrefix = turnResult.intent !== 'answer_question' 
              ? `[The user's intent appears to be: ${turnResult.intent}. Please respond accordingly.]\n\n`
              : '';
            responseContent = await generateAgentResponse(
              agentConfig,
              intentPrefix + userInput,
              chatHistory
            );
          }
        } else {
          // No custom components, use standard Gemini response
          responseContent = await generateAgentResponse(
            agentConfig,
            userInput,
            chatHistory
          );
        }
      } catch (aiError: any) {
        console.error("AI generation error:", aiError);
        responseContent = `I apologize, but I'm having trouble generating a response. ${aiError.message?.includes("GEMINI_API_KEY") ? "The Gemini API key may not be configured correctly." : "Please try again."}`;
      }

      // Add assistant message
      const assistantMessage = await storage.addMessage({
        agentId: req.params.id,
        role: "assistant",
        content: responseContent,
      });

      res.json([userMessage, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Clear chat history
  app.delete("/api/agents/:id/messages", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      await storage.clearMessages(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing messages:", error);
      res.status(500).json({ message: "Failed to clear messages" });
    }
  });

  // Check if agent has custom components
  app.get("/api/agents/:id/components", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }
      res.json({ hasCustomComponents: hasCustomComponents(req.params.id) });
    } catch (error) {
      console.error("Error checking components:", error);
      res.status(500).json({ message: "Failed to check components" });
    }
  });

  return httpServer;
}
