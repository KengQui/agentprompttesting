import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAgentSchema, updateAgentSchema } from "@shared/schema";
import { z } from "zod";
import { generateAgentResponse, generateValidationRules, generateGuardrails, generateSystemPrompt, generateSampleData, type GenerationContext, type SystemPromptContext, type SampleDataGenerationContext } from "./gemini";
import { loadAgentComponents, clearAgentCache, hasCustomComponents } from "./agent-loader";
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
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
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

  return httpServer;
}
