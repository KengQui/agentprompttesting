import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAgentSchema, updateAgentSchema } from "@shared/schema";
import { z } from "zod";

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

  // Send a message to an agent (simulated response without AI)
  app.post("/api/agents/:id/messages", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const contentSchema = z.object({ content: z.string().min(1) });
      const parsed = contentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Content is required" });
      }

      // Add user message
      const userMessage = await storage.addMessage({
        agentId: req.params.id,
        role: "user",
        content: parsed.data.content,
      });

      // Generate simulated response based on agent configuration
      const responseContent = generateSimulatedResponse(agent, parsed.data.content);

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

  return httpServer;
}

// Generate a simulated response based on agent configuration
function generateSimulatedResponse(agent: { name: string; description: string; businessUseCase: string }, userMessage: string): string {
  const responses = [
    `Hello! I'm ${agent.name}, and I'm here to help you. Based on my configuration, I'm designed to ${agent.businessUseCase ? agent.businessUseCase.substring(0, 100) + "..." : "assist you with your questions"}.`,
    `Thank you for your message. As ${agent.name}, I understand you're asking about "${userMessage.substring(0, 50)}${userMessage.length > 50 ? "..." : ""}". Let me help you with that.`,
    `I appreciate your question! While I'm currently running in demo mode without AI integration, in a full setup I would use my configured system prompt to provide a tailored response.`,
    `Great question! ${agent.name} is designed to help with scenarios like yours. To enable full AI responses, an OpenAI API key would need to be configured.`,
    `I'm ${agent.name}, your configured AI assistant. In production mode with AI integration, I would use the following personality:\n\n"${agent.description ? agent.description.substring(0, 150) + "..." : "Helpful assistant"}"\n\nHow else can I help you today?`,
  ];

  // Pick a response based on message content hash
  const hash = userMessage.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
  const index = Math.abs(hash) % responses.length;
  
  return responses[index];
}
