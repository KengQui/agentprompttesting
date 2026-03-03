import { GoogleGenAI } from "@google/genai";
import { generatePrompt, countRecordsInDataset, type PromptContext } from "./prompt-templates";
import type { PromptStyle, DomainDocument, GeminiModel, SampleDataset, ClarifyingInsight, AgentAction, MockUserState } from "@shared/schema";
import { defaultGenerationModel } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";

export interface ContextEvaluationResult {
  hasEnoughContext: boolean;
  missingAreas: string[];
  initialQuestion: string | null;
}

export interface ClarifyingChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClarifyingChatContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  clarifyingInsights?: ClarifyingInsight[];
  generationType: "validation" | "guardrails";
  chatHistory: ClarifyingChatMessage[];
}

export interface ClarifyingChatResponse {
  message: string;
  isReadyToGenerate: boolean;
  gatheredInsight?: ClarifyingInsight;
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

async function generateWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  maxRetries = 3
): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
  const delays = [1000, 2000, 4000];
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      lastError = error;
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED") ||
        error?.message?.includes("Resource exhausted");
      if (isRateLimit && attempt < maxRetries) {
        const delay = delays[attempt] ?? 4000;
        console.warn(
          `[generateWithRetry] Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface AgentContext {
  name: string;
  businessUseCase: string;
  description: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  sampleDatasets?: SampleDataset[];
  validationRules: string;
  guardrails: string;
  promptStyle?: PromptStyle;
  customPrompt?: string;
  availableActions?: AgentAction[];
  mockUserState?: MockUserState[];
}

export interface ChatHistory {
  role: "user" | "assistant";
  content: string;
}

// Result of parsing an AI response for action blocks
export interface ParsedActionResult {
  hasAction: boolean;
  actionName?: string;
  actionFields?: Record<string, any>;
  cleanedResponse: string;
  rawActionBlock?: string;
  parseError?: string;
}

// Result of executing an action
export interface ActionExecutionResult {
  success: boolean;
  actionName: string;
  fields: Record<string, any>;
  message: string;
  updatedMockState?: MockUserState[];
  updatedSampleDatasets?: SampleDataset[];
}

// Parse CSV line handling quoted fields properly - preserves raw values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Escape value for CSV output
function escapeCSVValue(value: any): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Extended MockUserState with format metadata for round-trip
interface WorkingData extends MockUserState {
  _format?: 'json' | 'csv' | 'text';
  _csvHeaders?: string[];
}

// Convert sample datasets to a workable data structure for action execution
export function sampleDatasetsToWorkingData(sampleDatasets: SampleDataset[]): WorkingData[] {
  const result: WorkingData[] = [];
  
  for (const dataset of sampleDatasets) {
    try {
      let fields: Record<string, any> = {};
      const cleanedContent = dataset.content
        .replace(/^```(?:json|csv|text|)?\s*\n?/gi, '')
        .replace(/\n?```\s*$/gi, '')
        .trim();
      
      let format: 'json' | 'csv' | 'text' = dataset.format || 'json';
      let csvHeaders: string[] | undefined;
      
      if (format === 'json') {
        const parsed = JSON.parse(cleanedContent);
        fields = parsed;
      } else if (format === 'csv') {
        const lines = cleanedContent.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          csvHeaders = parseCSVLine(lines[0]);
          const rows = lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const obj: Record<string, any> = {};
            csvHeaders!.forEach((h, i) => {
              obj[h] = values[i] ?? '';
            });
            return obj;
          });
          fields = rows;
        }
      } else {
        fields = { _textContent: cleanedContent };
      }
      
      result.push({
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        fields,
        isGenerated: dataset.isGenerated,
        createdAt: dataset.createdAt,
        _format: format,
        _csvHeaders: csvHeaders
      });
    } catch (e) {
      const strippedContent = dataset.content
        .replace(/^```(?:json|csv|text|)?\s*\n?/gi, '')
        .replace(/\n?```\s*$/gi, '')
        .trim();
      result.push({
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        fields: { _textContent: strippedContent },
        isGenerated: dataset.isGenerated,
        createdAt: dataset.createdAt,
        _format: 'text'
      });
    }
  }
  
  return result;
}

// Convert working data back to sample datasets format
export function workingDataToSampleDatasets(
  workingData: WorkingData[], 
  originalDatasets: SampleDataset[]
): SampleDataset[] {
  return workingData.map(data => {
    const original = originalDatasets.find(d => d.id === data.id);
    const format = data._format || original?.format || 'json';
    
    let content: string;
    
    if (format === 'text') {
      content = data.fields._textContent ?? JSON.stringify(data.fields, null, 2);
    } else if (format === 'csv' && Array.isArray(data.fields)) {
      const headers = data._csvHeaders || (data.fields.length > 0 ? Object.keys(data.fields[0]) : []);
      const csvLines = [headers.map(h => escapeCSVValue(h)).join(',')];
      for (const row of data.fields) {
        csvLines.push(headers.map(h => escapeCSVValue(row[h])).join(','));
      }
      content = csvLines.join('\n');
    } else if (Array.isArray(data.fields)) {
      content = JSON.stringify(data.fields, null, 2);
    } else if (data.fields._textContent !== undefined) {
      content = data.fields._textContent;
    } else {
      content = JSON.stringify(data.fields, null, 2);
    }
    
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      content,
      format,
      isGenerated: data.isGenerated,
      createdAt: data.createdAt
    };
  });
}

// Parse action blocks from AI response
// Strip all action blocks from a response string (safety net for display)
export function stripActionBlocks(response: string): string {
  // Strip well-formed action blocks (with closing ```)
  let cleaned = response.replace(/```action\s*\n?[\s\S]*?```/gi, '');
  // Strip malformed action blocks (missing closing ```) - matches to end of string
  cleaned = cleaned.replace(/```action\s*\n?[\s\S]*$/gi, '');
  return cleaned.trim();
}

export function parseActionFromResponse(response: string): ParsedActionResult {
  const actionBlockRegex = /```action\s*\n?([\s\S]*?)```/i;
  const match = response.match(actionBlockRegex);
  
  if (!match) {
    return { hasAction: false, cleanedResponse: response };
  }
  
  const rawBlock = match[0];
  const blockContent = match[1].trim();
  
  // Parse the action block
  const actionNameMatch = blockContent.match(/^ACTION:\s*(.+?)$/mi);
  // Use multiline capture to handle pretty-printed JSON spanning multiple lines
  const fieldsMatch = blockContent.match(/^FIELDS:\s*([\s\S]+)$/mi);
  
  if (!actionNameMatch) {
    return { hasAction: false, cleanedResponse: response };
  }
  
  const actionName = actionNameMatch[1].trim();
  let actionFields: Record<string, any> = {};
  let parseError: string | undefined;
  
  if (fieldsMatch) {
    try {
      // Try to parse the fields as JSON
      const rawFields = fieldsMatch[1].trim();
      actionFields = JSON.parse(rawFields);
    } catch (e) {
      console.error("Failed to parse action fields:", e);
      parseError = `Failed to parse action fields: ${e instanceof Error ? e.message : 'Invalid JSON'}`;
    }
  }
  
  // Remove the action block from the response for clean display
  const cleanedResponse = response.replace(rawBlock, '').trim();
  
  return {
    hasAction: true,
    actionName,
    actionFields,
    cleanedResponse,
    rawActionBlock: rawBlock,
    parseError
  };
}

// Execute a simulated action and update mock state
export function executeSimulatedAction(
  actionName: string,
  fields: Record<string, any>,
  availableActions: AgentAction[],
  currentMockState: MockUserState[]
): ActionExecutionResult {
  // Find the action definition
  const action = availableActions.find(
    a => a.name.toLowerCase() === actionName.toLowerCase() || 
         a.name.toLowerCase().replace(/\s+/g, '_') === actionName.toLowerCase()
  );
  
  if (!action) {
    return {
      success: false,
      actionName,
      fields,
      message: `Action "${actionName}" is not available.`
    };
  }
  
  // Validate required fields are present (check for undefined/null, not falsy)
  const missingFields = action.requiredFields.filter(
    f => (fields[f.name] === undefined || fields[f.name] === null) && f.name !== 'id'
  );
  
  if (missingFields.length > 0) {
    return {
      success: false,
      actionName,
      fields,
      message: `Missing required fields: ${missingFields.map(f => f.label).join(', ')}`
    };
  }
  
  // Clone the mock state for modification
  const updatedMockState = JSON.parse(JSON.stringify(currentMockState)) as MockUserState[];
  
  // Determine target profile/entity based on action name and provided fields
  // Look for fields like 'profileId', 'entityId', 'targetId', or state category matches
  const targetId = fields.profileId || fields.entityId || fields.targetId || fields.id;
  
  // Apply simulated action effects based on category
  if (action.category === 'create' || action.category === 'add') {
    // For create/add actions, add the new item to the most appropriate state
    const targetState = updatedMockState.find(s => 
      s.name.toLowerCase().includes(action.name.split(' ').pop()?.toLowerCase() || '') ||
      action.name.toLowerCase().includes(s.name.toLowerCase())
    );
    
    if (targetState && Array.isArray(targetState.fields)) {
      targetState.fields.push({
        id: `sim_${Date.now()}`,
        ...fields,
        createdAt: new Date().toISOString()
      });
    } else if (targetState && typeof targetState.fields === 'object') {
      // If fields is an object that should contain arrays, try to find the right array
      const fieldsObj = targetState.fields as Record<string, any>;
      for (const key of Object.keys(fieldsObj)) {
        if (Array.isArray(fieldsObj[key])) {
          fieldsObj[key].push({
            id: `sim_${Date.now()}`,
            ...fields,
            createdAt: new Date().toISOString()
          });
          break;
        }
      }
    }
  } else if (action.category === 'update' || action.category === 'modify') {
    // For update actions, modify the targeted state or array item
    let updated = false;
    
    // First try to find and update an item in an array by targetId
    if (targetId) {
      for (const state of updatedMockState) {
        // Handle array-based fields (e.g., list of dependents, policies)
        if (Array.isArray(state.fields)) {
          const itemIndex = state.fields.findIndex(
            (item: any) => item.id === targetId || item.entityId === targetId || item.dependentId === targetId
          );
          if (itemIndex >= 0) {
            Object.assign(state.fields[itemIndex], fields);
            updated = true;
            break;
          }
        } 
        // Handle object with nested arrays
        else if (typeof state.fields === 'object') {
          const fieldsObj = state.fields as Record<string, any>;
          // Check if this object directly matches targetId
          if (fieldsObj.id === targetId || fieldsObj.employeeId === targetId || fieldsObj.userId === targetId) {
            Object.assign(fieldsObj, fields);
            updated = true;
            break;
          }
          // Check nested arrays
          for (const key of Object.keys(fieldsObj)) {
            if (Array.isArray(fieldsObj[key])) {
              const itemIndex = fieldsObj[key].findIndex(
                (item: any) => item.id === targetId || item.entityId === targetId || item.dependentId === targetId
              );
              if (itemIndex >= 0) {
                Object.assign(fieldsObj[key][itemIndex], fields);
                updated = true;
                break;
              }
            }
          }
          if (updated) break;
        }
      }
    }
    
    // Fallback: match by action name if no targetId or not found
    if (!updated) {
      const targetState = updatedMockState.find(s => 
        s.name.toLowerCase().includes(action.name.split(' ').pop()?.toLowerCase() || '') ||
        action.name.toLowerCase().includes(s.name.toLowerCase())
      );
      
      if (targetState && typeof targetState.fields === 'object' && !Array.isArray(targetState.fields)) {
        Object.assign(targetState.fields, fields);
        updated = true;
      }
    }
    
    if (!updated) {
      return {
        success: false,
        actionName: action.name,
        fields,
        message: `Could not find target to update. ${targetId ? `No item with ID ${targetId} was found.` : 'Please specify a target ID.'}`
      };
    }
  } else if (action.category === 'delete' || action.category === 'remove') {
    // For delete actions, remove items from arrays
    let deleted = false;
    
    if (targetId) {
      for (const state of updatedMockState) {
        // Handle top-level arrays
        if (Array.isArray(state.fields)) {
          const originalLength = state.fields.length;
          state.fields = state.fields.filter(
            (item: any) => item.id !== targetId && item.entityId !== targetId && item.dependentId !== targetId
          );
          if (state.fields.length < originalLength) {
            deleted = true;
            break;
          }
        }
        // Handle object with nested arrays
        else if (typeof state.fields === 'object') {
          const fieldsObj = state.fields as Record<string, any>;
          for (const key of Object.keys(fieldsObj)) {
            if (Array.isArray(fieldsObj[key])) {
              const originalLength = fieldsObj[key].length;
              fieldsObj[key] = fieldsObj[key].filter(
                (item: any) => item.id !== targetId && item.entityId !== targetId && item.dependentId !== targetId
              );
              if (fieldsObj[key].length < originalLength) {
                deleted = true;
                break;
              }
            }
          }
          if (deleted) break;
        }
      }
    }
    
    if (!deleted) {
      return {
        success: false,
        actionName: action.name,
        fields,
        message: `Could not find item to delete. ${targetId ? `No item with ID ${targetId} was found.` : 'Please specify a target ID.'}`
      };
    }
  }
  
  // Build success message
  let message = action.successMessage || `Successfully executed: ${action.name}`;
  
  // Replace placeholders in success message
  for (const [key, value] of Object.entries(fields)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, 'gi'), String(value));
  }
  
  return {
    success: true,
    actionName: action.name,
    fields,
    message,
    updatedMockState
  };
}

// Execute action with sample datasets - handles conversion automatically
export function executeActionWithSampleData(
  actionName: string,
  fields: Record<string, any>,
  availableActions: AgentAction[],
  sampleDatasets: SampleDataset[]
): ActionExecutionResult {
  const workingData = sampleDatasetsToWorkingData(sampleDatasets);
  const result = executeSimulatedAction(actionName, fields, availableActions, workingData);
  
  if (result.success) {
    const dataToConvert = (result.updatedMockState || workingData) as WorkingData[];
    result.updatedSampleDatasets = workingDataToSampleDatasets(
      dataToConvert,
      sampleDatasets
    );
  }
  
  return result;
}

export function extractPendingQuestion(assistantResponse: string): string | null {
  if (!assistantResponse) return null;
  
  const lines = assistantResponse.trim().split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;
  
  const lastFewLines = lines.slice(-3);
  
  for (let i = lastFewLines.length - 1; i >= 0; i--) {
    const line = lastFewLines[i].trim();
    if (line.endsWith('?')) {
      const cleanedLine = line
        .replace(/^\*\*/, '').replace(/\*\*$/, '')
        .replace(/^\*/, '').replace(/\*$/, '')
        .replace(/^[-•]\s*/, '')
        .trim();
      if (cleanedLine.length > 10) {
        return cleanedLine;
      }
    }
  }
  
  return null;
}

export function isOpenEndedInvitation(question: string): boolean {
  const openEndedPatterns = [
    /what would you like to (build|create|do|make|work on)/i,
    /how can i help/i,
    /what can i (help|do|assist)/i,
    /what('s| is) (next|on your mind)/i,
    /what do you (need|want)/i,
    /what are you looking (for|to)/i,
    /what('s| is) your (next |new )?request/i,
    /tell me what you('d like| want)/i,
    /what expression would you like/i,
    /what column would you like/i,
    /what would you like me to/i,
    /^how can i assist you/i,
    /^what can i do for you/i,
  ];
  const cleaned = question.replace(/[*_`]/g, '').trim();
  return openEndedPatterns.some(p => p.test(cleaned));
}

export async function detectTopicSwitch(
  pendingQuestion: string,
  userMessage: string
): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  const confirmPatterns = /^(yes|y|yeah|yep|yup|correct|right|sure|ok|okay|no|n|nope|nah|not really|wrong|incorrect|looks good|looks right|that'?s (right|correct)|confirmed?|deny|reject)/i;
  if (confirmPatterns.test(userMessage.trim())) {
    return false;
  }

  if (isOpenEndedInvitation(pendingQuestion)) {
    return false;
  }

  try {
    const detectAi = new GoogleGenAI({ apiKey });
    const prompt = `You are analyzing whether a user's message is answering/responding to a specific question, or if they are switching to a completely different topic.

QUESTION THAT WAS ASKED: "${pendingQuestion}"

USER'S RESPONSE: "${userMessage}"

IMPORTANT: If the question is broad or open-ended (e.g. asking what the user wants to do, what they'd like to build, how you can help), then ANY substantive request from the user should be considered ANSWERING — because they are telling you what they want, which is exactly what was asked.

Is the user answering or responding to the question above, or are they asking about something completely different/unrelated?

Reply with ONLY one word: "ANSWERING" or "SWITCHING"`;

    const response = await detectAi.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 10
      }
    });

    const result = (response.text || '').trim().toUpperCase();
    return result.includes('SWITCHING');
  } catch (error) {
    console.error('[detectTopicSwitch] Error:', error);
    return false;
  }
}

export interface ContextSections {
  needsData: boolean;
  needsActions: boolean;
  needsMockState: boolean;
  needsDomainKnowledge: boolean;
}

export function classifyMessageContext(
  userMessage: string,
  _chatHistory: ChatHistory[] = [],
  agent: AgentContext
): ContextSections {
  let cleanMessage = userMessage;
  const scMatch = cleanMessage.match(/\[SYSTEM CONTEXT:[^\]]*\]\s*/);
  if (scMatch) {
    cleanMessage = cleanMessage.substring((scMatch.index || 0) + scMatch[0].length);
  }
  const msgLower = cleanMessage.toLowerCase().trim();

  const dataKeywords = [
    'my salary', 'my pay', 'my data', 'my record', 'my info', 'my information',
    'my email', 'my address', 'my phone', 'my name', 'my department',
    'my benefits', 'my insurance', 'my deduction', 'my earning',
    'my balance', 'my accrual', 'my pto', 'my time off', 'my leave',
    'my schedule', 'my shift', 'my hours', 'my overtime',
    'how much do i', 'what is my', 'what are my', 'show me my', 'show my',
    'look up employee', 'find employee', 'find the employee',
    'employee data', 'employee record', 'employee info',
    'how many employee', 'how many record', 'how many people',
    'list all employee', 'show all employee',
    'paycheck', 'pay check', 'payroll', 'compensation', 'wage',
    'net pay', 'gross pay', 'lower than', 'higher than', 'pay stub',
    'who has', 'who is on', 'who are', 'which employee',
    'total for', 'sum of', 'average of',
    'current plan', 'current coverage', 'current enrollment',
    'enrolled in', 'coverage tier',
  ];

  const actionKeywords = [
    'submit my', 'submit the', 'submit a',
    'enroll me', 'enroll in', 'sign me up',
    'please process', 'go ahead and', 'proceed with', 'confirm the',
    'i want to submit', 'i want to enroll', 'i want to cancel',
    'i need to submit', 'i need to enroll', 'i need to cancel',
    'i\'d like to submit', 'i\'d like to enroll',
    'opt in to', 'opt out of',
    'approve my', 'approve the',
    'cancel my', 'terminate my', 'drop my',
    'update my benefits', 'change my plan', 'switch my plan',
    'transfer my', 'modify my',
  ];

  const domainKeywords = [
    'how does', 'how do i', 'how to', 'what is a', 'what is the', 'what are the', 'what does',
    'explain', 'describe', 'tell me about', 'help me understand',
    'policy', 'procedure', 'rule', 'regulation',
    'eligibility', 'eligible', 'qualify', 'requirement',
    'deadline', 'when can i', 'when do i', 'when is the',
    'definition', 'define', 'meaning of',
    'difference between', 'versus', 'vs',
    'qualifying life event', 'open enrollment',
    'syntax', 'expression', 'formula', 'format',
  ];

  const casualPatterns = [
    /^(hi|hello|hey|thanks|thank you|bye|goodbye|ok|okay|sure|yes|no|y|n)[\s!.?]*$/i,
    /^(good morning|good afternoon|good evening|how are you)[\s!.?]*$/i,
    /^(that'?s? (great|good|helpful|perfect|awesome))[\s!.?]*$/i,
  ];

  const isCasual = casualPatterns.some(p => p.test(msgLower));

  if (isCasual) {
    return {
      needsData: false,
      needsActions: false,
      needsMockState: false,
      needsDomainKnowledge: false,
    };
  }

  const hasDataSignal = dataKeywords.some(kw => msgLower.includes(kw));
  const hasActionSignal = actionKeywords.some(kw => msgLower.includes(kw));
  const hasDomainSignal = domainKeywords.some(kw => msgLower.includes(kw));

  const hasData = !!(agent.sampleDatasets && agent.sampleDatasets.length > 0);
  const hasActions = !!(agent.availableActions && agent.availableActions.length > 0);
  const hasMockState = !!(agent.mockUserState && agent.mockUserState.length > 0);
  const hasDomain = !!(agent.domainKnowledge || (agent.domainDocuments && agent.domainDocuments.length > 0));

  const promptRequiresData = !!(agent.customPrompt && agent.customPrompt.includes('{{SAMPLE_DATA}}') && hasData);

  // Check if recent chat history involved data-related topics (for follow-up messages)
  const chatHistoryNeedsData = hasData && _chatHistory.length > 0 && _chatHistory.some(msg => {
    const msgText = msg.content.toLowerCase();
    return dataKeywords.some(kw => msgText.includes(kw));
  });

  // Always load sample data when agent has it - the data is small enough that
  // it's better to always have it available than to risk not loading it
  const alwaysLoadData = hasData;

  const noSignals = !hasDataSignal && !hasActionSignal && !hasDomainSignal;
  if (noSignals) {
    return {
      needsData: alwaysLoadData || promptRequiresData || chatHistoryNeedsData,
      needsActions: false,
      needsMockState: false,
      needsDomainKnowledge: false,
    };
  }

  return {
    needsData: alwaysLoadData || (hasDataSignal && hasData) || promptRequiresData || chatHistoryNeedsData,
    needsActions: hasActionSignal && hasActions,
    needsMockState: hasActionSignal && hasMockState,
    needsDomainKnowledge: hasDomainSignal && hasDomain,
  };
}

export async function generateAgentResponse(
  agent: AgentContext,
  userMessage: string,
  chatHistory: ChatHistory[] = []
): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const contextNeeds = classifyMessageContext(userMessage, chatHistory, agent);
  const systemPrompt = getSystemPrompt(agent, contextNeeds);

  console.log('[ContextManager] Message:', userMessage.substring(0, 80), '| Sections:', JSON.stringify(contextNeeds));

  const contents = [
    ...chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  try {
    const response = await generateWithRetry({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 4000,
      },
      contents: contents,
    });

    return response.text || "I apologize, but I was unable to generate a response. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate response: ${error?.message || error}`);
  }
}


// Build domain knowledge section including documents
function buildDomainKnowledgeText(agent: AgentContext): string {
  let section = "";
  
  if (agent.domainKnowledge) {
    section += agent.domainKnowledge;
  }
  
  if (agent.domainDocuments && agent.domainDocuments.length > 0) {
    if (section) section += "\n\n";
    section += "Reference Documents:";
    for (const doc of agent.domainDocuments) {
      section += `\n\n--- ${doc.filename} ---\n${doc.content}`;
    }
  }
  
  return section;
}

// Helper to strip markdown code block markers from content
function stripCodeBlocks(content: string): string {
  // Remove opening code blocks like ```json, ```csv, ``` etc.
  let cleaned = content.replace(/^```(?:json|csv|text|)?\s*\n?/gi, '');
  // Remove closing code blocks
  cleaned = cleaned.replace(/\n?```\s*$/gi, '');
  return cleaned.trim();
}

function injectRowNumbersIntoCSV(csvContent: string): string {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length <= 1) return csvContent;

  const result: string[] = [];
  result.push("Row," + lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const spreadsheetRow = i + 1;
    result.push(spreadsheetRow + "," + lines[i]);
  }
  return result.join("\n");
}

function buildSampleDatasetsText(agent: AgentContext): string {
  if (!agent.sampleDatasets || agent.sampleDatasets.length === 0) {
    return "";
  }
  
  let section = "User Data Records:\n";
  for (const dataset of agent.sampleDatasets) {
    const cleanedContent = stripCodeBlocks(dataset.content);
    const displayContent = dataset.format === 'csv' ? injectRowNumbersIntoCSV(cleanedContent) : cleanedContent;
    const recordCount = countRecordsInDataset(dataset.content, dataset.format);
    const countLabel = recordCount > 0 ? `Total records: ${recordCount}` : "";
    
    // DEBUG: Log injected CSV to verify row numbers
    const displayLines = displayContent.split('\n');
    console.log(`[ROW-DEBUG] Dataset: ${dataset.name}, format: ${dataset.format}`);
    console.log(`[ROW-DEBUG] Header: ${displayLines[0]?.substring(0, 100)}`);
    // Find Oliver Houser in output
    for (let i = 0; i < displayLines.length; i++) {
      if (displayLines[i].includes('Oliver') || displayLines[i].includes('Houser')) {
        console.log(`[ROW-DEBUG] Oliver Houser line: "${displayLines[i].substring(0, 120)}"`);
      }
    }
    console.log(`[ROW-DEBUG] First 3 data lines:`);
    for (let i = 1; i <= 3 && i < displayLines.length; i++) {
      console.log(`[ROW-DEBUG]   ${displayLines[i]?.substring(0, 100)}`);
    }
    
    section += `\n--- ${dataset.name} (${dataset.format.toUpperCase()}) ---\n`;
    if (countLabel) {
      section += `${countLabel}\n`;
    }
    section += `${displayContent}\n`;
  }
  return section;
}


// Build action simulation section for system prompt
function buildActionsText(agent: AgentContext): string {
  if (!agent.availableActions || agent.availableActions.length === 0) {
    return "";
  }
  
  let section = `## Available Actions

You can execute the following actions directly for users. Do NOT ask users to navigate to pages or perform actions themselves - you will complete these tasks for them within this conversation.

### How to Execute Actions:

1. **Acknowledge the request** - Confirm you understand what they want to do
2. **Gather information** - If any required fields are missing, ask for them conversationally (one question at a time if needed)
3. **Confirm before executing** - Summarize what you're about to do and ask for confirmation
4. **Execute the action** - Output the action block in this format (this is processed by the system):

\`\`\`action
ACTION: action_name
FIELDS: {"field_name": "value", "other_field": "value"}
\`\`\`

5. **Confirm completion** - After the action block, provide a friendly confirmation of what was done and any next steps

### Example Conversation Flow:

User: "I need to add my new baby to my health insurance"

Good response: "Congratulations on your new baby! I can add them to your health insurance right now.

I'll need a few details:
- What is your baby's name?
- What is their date of birth?

[After user provides info]

Great! I'll add [baby's name] (born [date]) as a dependent child to your health insurance. Should I proceed?

[After user confirms]

\`\`\`action
ACTION: add_dependent
FIELDS: {"name": "Baby Name", "relationship": "child", "dob": "2024-01-15"}
\`\`\`

Done! I've added [baby's name] to your health insurance. The changes will be effective as of their birth date. You should receive a confirmation email shortly, and new insurance cards will be mailed within 7-10 business days.

Is there anything else you'd like me to help you with?"

### Available Actions:\n`;

  for (const action of agent.availableActions) {
    section += `\n**${action.name}** (${action.category})\n`;
    section += `Description: ${action.description}\n`;
    if (action.requiredFields.length > 0) {
      section += `Required fields:\n`;
      for (const field of action.requiredFields) {
        section += `  - ${field.name} (${field.type}): ${field.label}`;
        if (field.options) {
          section += ` [Options: ${field.options.join(", ")}]`;
        }
        section += `\n`;
      }
    }
    if (action.confirmationMessage) {
      section += `Confirmation to show before executing: "${action.confirmationMessage}"\n`;
    }
    if (action.successMessage) {
      section += `Success message to show after: "${action.successMessage}"\n`;
    }
  }
  
  section += `\n### Important Guidelines:
- Execute actions directly for users - do NOT ask them to navigate to pages or systems
- Reference the user's data when relevant (e.g., "I can see you're enrolled in...")
- Be conversational and helpful, not robotic
- Gather all required information before executing an action
- After completing an action, explain any next steps or what they should expect

### Smart Name Resolution:
- When a user refers to a person by name, search the available data for matches
- If there is exactly ONE person matching that name, proceed immediately without asking for further clarification — do NOT ask for Employee ID, record ID, or any other identifier
- Only ask for disambiguation when there are MULTIPLE people with the same or similar name (e.g., "I found two people named John — John Smith in Engineering and John Davis in Marketing. Which one did you mean?")
- Never expect users to know internal system identifiers like Employee IDs, record IDs, or account numbers. Instead, look up records using human-friendly attributes such as name, department, role, or other contextual details the user would naturally know
- When you need to narrow down a match, ask about recognizable attributes (e.g., department, role, location) rather than requesting an ID number

### Clarification Consistency:
- When a user's request involves ambiguity or requires decisions before proceeding, identify ALL factors that need clarification — not just the first one that comes to mind
- Mentally enumerate every assumption or decision point (e.g., which formula to use, how to handle edge cases, what output format is needed, what scope applies)
- Ask about each clarification one at a time, in order of impact — start with the most significant decision first
- Never randomly skip a clarification — every session should surface the same set of clarifying questions for the same type of request
- This ensures a predictable, thorough experience regardless of when or how many times the user asks the same question
`;
  
  return section;
}

// Build mock user state section for system prompt
function buildMockUserStateText(agent: AgentContext): string {
  if (!agent.mockUserState || agent.mockUserState.length === 0) {
    return "";
  }
  
  let section = "## Current User Profile\n\n";
  section += "This is the user's current data. Reference this when answering questions about their profile or when actions would modify their data.\n\n";
  section += "**Important**: You are operating in a demonstration environment. When completing actions or referencing this data, respond naturally and professionally. Do NOT mention 'simulation', 'mock', 'demo', or 'test' to the user. Simply confirm actions as completed (e.g., 'Done', 'I've updated your records') without exposing the demonstration nature of the environment.\n\n";
  
  for (const state of agent.mockUserState) {
    section += `### ${state.name}\n`;
    if (state.description) {
      section += `${state.description}\n`;
    }
    section += "```json\n" + JSON.stringify(state.fields, null, 2) + "\n```\n\n";
  }
  
  return section;
}

function getSystemPrompt(agent: AgentContext, contextNeeds?: ContextSections): string {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  const currentDateSection = `\n\n## Current Date\nToday is: ${currentDate}`;
  
  const includeAll = !contextNeeds;
  const needs = contextNeeds || {
    needsData: true,
    needsActions: true,
    needsMockState: true,
    needsDomainKnowledge: true,
  };

  if (agent.customPrompt && agent.customPrompt.trim()) {
    let fullPrompt = agent.customPrompt.trim();
    
    const sampleDatasetsText = needs.needsData ? buildSampleDatasetsText(agent) : '';
    const actionsText = needs.needsActions ? buildActionsText(agent) : '';
    const mockStateText = needs.needsMockState ? buildMockUserStateText(agent) : '';
    
    fullPrompt = fullPrompt.replace(/\{\{SAMPLE_DATA\}\}/g, sampleDatasetsText || '(No sample data provided)');
    fullPrompt = fullPrompt.replace(/\{\{VALIDATION_RULES\}\}/g, agent.validationRules || '(No validation rules provided)');
    fullPrompt = fullPrompt.replace(/\{\{GUARDRAILS\}\}/g, agent.guardrails || '(No guardrails provided)');

    if (sampleDatasetsText) {
      const dataFirstRule = `

### CRITICAL OVERRIDE: Data-First Response Rule (HIGHEST PRIORITY — overrides ALL other instructions)
All records in the <data> section represent the user's own payroll history. When the user asks about their paycheck, pay, deductions, or any data-related question, you MUST respond with data analysis — NEVER ask a question first.

HOW TO FIND THE RIGHT RECORD:
- "last paycheck", "most recent", "latest", "previous" → Sort all records by pay_date descending. The first one is "last". The second one is the comparison.
- A specific date like "Jan 31" or "January 31" → Find the record with the closest pay_date to that date in any year. Prefer the current year if available.
- "lower than usual", "higher than normal", "different" → Compare the identified record against the one immediately BEFORE it chronologically.

WHAT TO DO:
1. Identify the target record and the comparison record using the rules above.
2. Compare EVERY field between the two records. List each difference with exact dollar amounts.
3. Explain why each change likely occurred (e.g., 401k increase, bonus, new deduction, tax change).

YOUR FIRST RESPONSE MUST CONTAIN THE COMPARISON. You are FORBIDDEN from:
- Asking "which paycheck?", "what pay date?", "can you confirm?", "could you tell me?", or ANY question before showing the comparison
- Saying you need more information — you have all the data you need
- Asking the user for the previous paycheck date — find it yourself from the data
This rule overrides CONSTRAINTS, TASK, and any other instruction that says to ask for clarification.

`;
      const beforeLen = fullPrompt.length;
      fullPrompt = fullPrompt.replace(/<data>\s*<\/data>/g, `<data>\n${sampleDatasetsText}\n</data>`);
      const afterLen = fullPrompt.length;
      console.log(`[DataInjection] <data> tag replacement: before=${beforeLen}, after=${afterLen}, injected=${afterLen - beforeLen} chars`);
      if (beforeLen === afterLen) {
        console.log('[DataInjection] WARNING: No <data></data> tag found in custom prompt, appending data to end');
        fullPrompt += `\n\n## User Data\n${sampleDatasetsText}`;
      }

      // Inject data-first rule BEFORE the CONSTRAINTS section for maximum priority
      const constraintsIdx = fullPrompt.indexOf('### 3. CONSTRAINTS');
      if (constraintsIdx > 0) {
        fullPrompt = fullPrompt.substring(0, constraintsIdx) + dataFirstRule + '\n' + fullPrompt.substring(constraintsIdx);
        console.log('[DataInjection] Injected data-first rule before CONSTRAINTS section');
      } else {
        const altIdx = fullPrompt.indexOf('## CONSTRAINTS') || fullPrompt.indexOf('### CONSTRAINTS');
        if (altIdx > 0) {
          fullPrompt = fullPrompt.substring(0, altIdx) + dataFirstRule + '\n' + fullPrompt.substring(altIdx);
        } else {
          fullPrompt = dataFirstRule + '\n' + fullPrompt;
          console.log('[DataInjection] No CONSTRAINTS section found, prepended data-first rule');
        }
      }

      // T003: Patch CONSTRAINTS to add data-available exceptions
      fullPrompt = fullPrompt.replace(
        /Must only ask clarifying questions when the request is genuinely ambiguous/g,
        'Must only ask clarifying questions when the request is genuinely ambiguous. IMPORTANT: A question about pay, paychecks, or deductions when payroll data is available in the <data> section is NOT ambiguous — use the data to answer directly'
      );
      fullPrompt = fullPrompt.replace(
        /\*\*For Insufficient Information\*\*:/g,
        '**For Insufficient Information** (EXCEPTION: When payroll data is available in <data>, pay-related questions are NOT "insufficient information" — analyze the data and answer directly):'
      );
    }

    fullPrompt += currentDateSection;
    
    if (actionsText) {
      fullPrompt += `\n\n${actionsText}`;
    }
    
    if (mockStateText) {
      fullPrompt += `\n\n${mockStateText}`;
    }
    
    const hasDataOrState = sampleDatasetsText || mockStateText;
    if (hasDataOrState) {
      fullPrompt += `\n\n## Smart Name Resolution
- When a user refers to a person by name, search the available data for matches
- If there is exactly ONE person matching that name, proceed immediately without asking for further clarification — do NOT ask for Employee ID, record ID, or any other identifier
- Only ask for disambiguation when there are MULTIPLE people with the same or similar name, and in that case ask about recognizable attributes (department, role, location) rather than requesting an ID number
- Never expect users to know internal system identifiers like Employee IDs, record numbers, or account IDs. Look up records using human-friendly attributes such as name, department, role, or other contextual details the user would naturally know`;
    }

    if (!needs.needsData && !needs.needsActions && !needs.needsMockState && !needs.needsDomainKnowledge) {
      fullPrompt += `\n\n[NOTE: Additional data, actions, and reference materials are available but not loaded for this turn. If the user asks about their data, available actions, or domain-specific questions, those materials will be loaded automatically.]`;
    }
    
    return fullPrompt;
  }
  
  const domainKnowledgeText = needs.needsDomainKnowledge ? buildDomainKnowledgeText(agent) : '';
  const sampleDatasetsText = needs.needsData ? buildSampleDatasetsText(agent) : '';
  const actionsText = needs.needsActions ? buildActionsText(agent) : '';
  const mockStateText = needs.needsMockState ? buildMockUserStateText(agent) : '';
  
  let fullPrompt = `You are ${agent.name}, a helpful AI assistant.`;
  
  fullPrompt += currentDateSection;
  
  if (agent.businessUseCase) {
    fullPrompt += `\n\n## Purpose\n${agent.businessUseCase}`;
  }
  
  if (domainKnowledgeText) {
    fullPrompt += `\n\n## Domain Knowledge\n${domainKnowledgeText}`;
  }
  
  if (sampleDatasetsText) {
    fullPrompt += `\n\n## User Data\n${sampleDatasetsText}`;
    fullPrompt += `\n\n## CRITICAL: Data-First Response Rule (HIGHEST PRIORITY — overrides all other instructions)
When the user asks about their paycheck, pay, deductions, or any data-related question:
1. Search the data above for the record that best matches the user's date reference. If no exact match exists, use the CLOSEST record by date. State which record you are using.
2. Find the comparison record — the pay period immediately BEFORE the matched one in the data.
3. Compare EVERY field between the two records and list what changed with exact dollar amounts.
4. Explain why each change likely occurred.

ABSOLUTE RULES:
- NEVER ask "which year?", "can you confirm?", "is this the one?", or any other clarifying question before comparing records. Just pick the best match and compare.
- NEVER ask the user for the previous paycheck date. Find it yourself from the data.
- If the date doesn't match exactly, say "I found a paycheck near that date on [date]" and proceed with the comparison immediately.
- You have ALL the data you need. Use it. Do not ask the user for information that is already in the data.`;
  }
  
  if (agent.validationRules) {
    fullPrompt += `\n\n## Validation Rules\n${agent.validationRules}`;
  }
  
  if (agent.guardrails) {
    fullPrompt += `\n\n## Guardrails (CRITICAL - Must Follow)\n${agent.guardrails}`;
  }
  
  if (actionsText) {
    fullPrompt += `\n\n${actionsText}`;
  }
  
  if (mockStateText) {
    fullPrompt += `\n\n${mockStateText}`;
  }
  
  const hasDataOrState = sampleDatasetsText || mockStateText;
  if (hasDataOrState) {
    fullPrompt += `\n\n## Smart Name Resolution
- When a user refers to a person by name, search the available data for matches
- If there is exactly ONE person matching that name, proceed immediately without asking for further clarification — do NOT ask for Employee ID, record ID, or any other identifier
- Only ask for disambiguation when there are MULTIPLE people with the same or similar name, and in that case ask about recognizable attributes (department, role, location) rather than requesting an ID number
- Never expect users to know internal system identifiers like Employee IDs, record numbers, or account IDs. Look up records using human-friendly attributes such as name, department, role, or other contextual details the user would naturally know`;
  }

  if (!needs.needsData && !needs.needsActions && !needs.needsMockState && !needs.needsDomainKnowledge) {
    fullPrompt += `\n\n[NOTE: Additional data, actions, and reference materials are available but not loaded for this turn. If the user asks about their data, available actions, or domain-specific questions, those materials will be loaded automatically.]`;
  }
  
  return fullPrompt;
}

export interface GenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  model?: GeminiModel;
}

export async function generateValidationRules(context: GenerationContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating validation rules for AI agents. Based on the business use case and domain knowledge provided, generate appropriate validation criteria in Markdown format.

The validation criteria should define WHAT MAKES A VALID REQUEST, not step-by-step processes:
1. Required Information - What information is needed (but agent can gather it flexibly)
2. Validation Criteria - What conditions must be met (e.g., "balance must be sufficient", "date must be in future")
3. What to do when validation fails - How to handle invalid requests

CRITICAL: Write CRITERIA and PRINCIPLES, not rigid step-by-step instructions.
- ✅ Good: "Verify time-off request doesn't exceed available balance. If insufficient, explain accrual schedule."
- ❌ Bad: "Step 1: Ask for start date. Step 2: Ask for end date. Step 3: Check balance."

The agent will apply these criteria flexibly in conversation. Focus on what makes requests valid/invalid.
Output ONLY the validation criteria in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate validation rules for an AI agent handling this use case.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Input Validation Rules\n\n- Unable to generate validation rules. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate validation rules: ${error?.message || error}`);
  }
}

export async function generateGuardrails(context: GenerationContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating safety guardrails for AI agents. Based on the business use case and domain knowledge provided, generate appropriate guardrails in Markdown format.

The guardrails should define BOUNDARIES and ESCALATION CRITERIA:
1. What NOT to do - Specific actions/topics the agent should avoid
2. When to escalate - Clear criteria for routing to human support (not rigid rules)
3. Privacy/Security - What sensitive data to protect

CRITICAL: Write PRINCIPLES that guide behavior, not rigid scripts.
- ✅ Good: "Don't approve time-off requests (only managers can). Escalate when: request violates blackout period, balance calculation unclear."
- ❌ Bad: "If user asks to approve, say 'I cannot approve requests' and ask if they want to view instead."

Focus on defining boundaries and escalation triggers. The agent will apply these principles naturally.
Output ONLY the guardrails in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate safety guardrails for an AI agent handling this use case.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Agent Guardrails\n\n- Unable to generate guardrails. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate guardrails: ${error?.message || error}`);
  }
}

export interface SystemPromptContext {
  name: string;
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  validationRules?: string;
  guardrails?: string;
  sampleDatasets?: SampleDataset[];
  availableActions?: AgentAction[];
  model?: GeminiModel;
}

export async function generateSystemPrompt(context: SystemPromptContext): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "None provided";

  const sampleDataText = context.sampleDatasets?.length
    ? context.sampleDatasets.map(ds => `${ds.name} (${ds.format}): ${ds.content}`).join("\n\n")
    : "None provided";

  const actionsText = context.availableActions?.length
    ? context.availableActions.map(action => 
        `- ${action.name}: ${action.description}${action.requiredFields?.length ? ` (requires: ${action.requiredFields.map(f => f.name).join(', ')})` : ''}`
      ).join("\n")
    : "None provided";

  const metaPrompt = `You are an expert AI prompt engineer trained in Anthropic's prompt engineering best practices. Your task is to create a high-quality system prompt for a customer-facing AI agent.

You will receive information about:
- Agent name and business use case
- Domain knowledge and documents
- Validation rules and guardrails
- Sample data and available actions

Your goal is to INTELLIGENTLY ANALYZE and REORGANIZE this information into Anthropic's Production-Ready prompt structure. Do NOT just mechanically map each input to a section - analyze the content and place information where it logically belongs.

## Production-Ready Prompt Structure (follow this order):

### 1. ROLE
Define the agent's identity and expertise:
ROLE
You are [Agent Name], a [specific role with context based on business use case].

### 2. GOAL
Define what success looks like based on the business use case:
GOAL
[Synthesized from business use case - what the agent does, who it helps, what problems it solves]

Success looks like: [Describe what a successful interaction achieves]

### 3. CONSTRAINTS
Analyze ALL input sources — domain knowledge, business use case, validation rules, AND guardrails — to extract and synthesize behavioral constraints. Cross-reference the content: if domain knowledge contains rule-like statements (e.g., "never use X", "always do Y"), place them here as constraints rather than in the knowledge section. If validation rules contain guardrail-like boundaries, merge them appropriately.

Integrate the FULL content of the provided validation rules and guardrails into this section, organized logically. Do NOT summarize or omit any rules — include every single rule from both sources, restructured for clarity.

CONSTRAINTS

[All validation rules — fully included, not summarized]

[All guardrails — fully included, not summarized]

Additionally, include these universal constraints:
- Must [any domain-specific constraint inferred from the business use case or domain knowledge]
- Must carefully parse the user's request BEFORE acting — extract the exact calculation, logic, or output format the user specified and follow it faithfully
- Must NEVER contradict or ignore what the user explicitly stated (e.g., if they say "percentage", the output must be a percentage, not a raw decimal; if they say "relative to the employee's amount", use that as the denominator)
- Must only ask clarifying questions when the request is genuinely ambiguous — do NOT ask for clarification on details the user already provided
- When the request IS genuinely ambiguous, must identify ALL decision points that need clarification and ask about them one at a time in order of impact (most significant first), never skipping any
- Must ask only ONE question at a time — never ask multiple questions in a single response
- When a [SYSTEM CONTEXT] note indicates a pending unanswered question and a topic switch, must follow the system's instruction: either ask the user to resolve the pending question first (naturally and briefly), or move on if they already declined once. Never use robotic phrasing like "I'll take that as confirmed."

### 4. INPUT
Include reference materials the agent needs. Analyze the domain knowledge to separate factual reference material (which goes here) from behavioral rules (which should go in CONSTRAINTS).
INPUT
<knowledge>
[Domain knowledge that is purely reference material — facts, procedures, function lists, schemas, policies. Exclude any rule-like statements that belong in CONSTRAINTS]
</knowledge>

<data>
[Include sample data here if provided. Format it clearly for the agent to reference during conversations]
</data>

### 5. TASK
Define numbered steps for handling user requests. Emphasize careful request parsing and faithful execution:
TASK
1. [First step - carefully parse the user's request: identify the exact calculation, logic, output format, and any constraints they explicitly stated]
2. [Second step - check if the request is genuinely ambiguous. If the user already specified the formula, format, or approach, do NOT ask about it — just follow their instructions. Only ask a clarifying question when there is a real gap in the request]
3. [Third step - check available data and apply the user's stated logic faithfully]
4. [Fourth step - formulate response matching the user's requested output format exactly]
5. [If actions are available, include step for executing actions when the user requests them]

### 6. OUTPUT FORMAT
Define how responses should be structured based on the use case. When the agent presents a NEW calculated column or expression (initial proposal, revised, or related suggestion), it should also suggest a descriptive column name displayed in bold and include the output type. However, when the agent is CORRECTING a user's syntax error or explaining what was wrong with their expression, it should NOT include the output type or suggested column name — those metadata lines only belong on new/finalized proposals. In that case, format the explanation as a numbered list where each distinct issue or correction is its own numbered point, then show the corrected expression after the list.
If the validation rules define a structured explanation format (e.g., a multi-step breakdown for explaining expressions), include that format in the OUTPUT FORMAT section so the agent follows it consistently.
OUTPUT FORMAT
[Specify based on use case - format, tone, structure requirements. Include instruction to suggest a bolded column name and output type when presenting NEW expressions or calculated columns. Include a separate format for syntax corrections that uses a numbered list to explain each issue separately (one issue per numbered point), followed by the corrected expression — omitting the column name and output type metadata. If validation rules specify an explanation format, include the full format template here.]

### 7. EXAMPLES (REQUIRED - GENERATE THESE)
Based on the business use case, INFER and CREATE 2-3 realistic example interactions. These should demonstrate:
- Typical user questions for this domain
- Expected response format and quality
EXAMPLES
Example 1:
Input: [Inferred realistic user question based on business use case]
Output: [Expected response demonstrating ideal behavior]

Example 2:
Input: [Another realistic scenario]
Output: [Expected response]

### 8. VERIFICATION CHECKLIST
Define pre-response checks based on the use case and validation rules. If the validation rules define a structured explanation format, include a check to verify the agent follows it.
VERIFICATION CHECKLIST
Before responding, verify:
- [ ] [Check relevant to the use case]
- [ ] [Data accuracy check]
- [ ] [Constraint compliance check]
- [ ] [If validation rules define an explanation format, check that the format is followed]

## Key Principles:
- PRODUCE A COMPLETE, SELF-CONTAINED PROMPT — no placeholders, no markers, no dynamic tokens. Every piece of content must be fully baked into the final prompt.
- INTELLIGENTLY REDISTRIBUTE content across sections: domain knowledge with rule-like content goes to CONSTRAINTS, reference material goes to INPUT, business context informs ROLE and GOAL. Cross-reference all input sources.
- Include ALL validation rules and guardrails in CONSTRAINTS — do NOT summarize or omit any rules. Every rule provided must appear in the output.
- INFER realistic examples based on the business context - do not leave placeholders
- Keep it concise - every sentence should serve a purpose
- Use clear, enforceable language for constraints
- CRITICAL: Do NOT use words like "simulated", "simulation", "mock", "demo", "test environment", or "fake" in the generated prompt. The agent should present itself as a real, professional assistant. When describing actions, use natural language like "process", "update", "complete" - NOT "simulate"
- ALWAYS ask only ONE question at a time. Never ask multiple questions in a single response. Wait for the user to answer before asking the next question.
- REQUEST FAITHFULNESS: The agent must carefully parse the user's request BEFORE acting. Extract the exact calculation, logic, output format, and constraints the user explicitly stated, and follow them faithfully. Never contradict or ignore what the user said (e.g., if they say "percentage", output a percentage; if they say "relative to X", use X as the reference point). Only ask clarifying questions when the request is genuinely ambiguous — never ask about details the user already provided.
- CLARIFICATION CONSISTENCY: When a request IS genuinely ambiguous, the agent must identify ALL decision points that need clarification — not just one. Ask about each one at a time, in order of impact (most significant first). The same type of ambiguous request should always surface the same set of clarifying questions regardless of session.
- VALIDATION ROW COUNT: When validating expressions against sample data, ONLY show the minimum number of rows needed to cover all distinct outcomes. For simple arithmetic with no conditional logic, there is only 1 distinct outcome — show exactly 1 representative row. For conditional expressions with N branches, show N rows (one per branch). NEVER show all sample rows when they would all produce the same type of result — this is redundant and clutters the response.
- SMART NAME RESOLUTION: When a user refers to a person by name, the agent must search available data for matches. If exactly ONE person matches, proceed immediately without asking for further clarification. Only ask for disambiguation when MULTIPLE people share the same or similar name — and in that case, ask about recognizable attributes (department, role, location) rather than internal IDs.
- NEVER expect users to know internal system identifiers like Employee IDs, record numbers, or account IDs. Always look up records using human-friendly attributes (name, department, role, etc.) that users would naturally know.
- TOPIC TRANSITION HANDLING: When the system injects a [SYSTEM CONTEXT] note about a pending unanswered question, follow these rules:
  1. If instructed to ask the user to resolve the pending question first, do so naturally and briefly. For example: "Before we move on to your new request — [restate the pending question naturally]." Do NOT process their new request in that response.
  2. If instructed that the user chose not to answer and to move on, simply handle their current request directly without mentioning the skipped question.
  3. Never use robotic phrases like "I'll take that as confirmed" or "I notice you didn't answer my question." Keep transitions natural and conversational.

## Format your output as:

<system_prompt>
[The complete, ready-to-use system prompt following the Production-Ready structure above]
</system_prompt>

<reasoning>
[Brief explanation of key decisions, especially:
- How you redistributed content between sections
- What examples you inferred and why they're relevant]
</reasoning>`;

  const userPrompt = `## Input Information:

**Agent Name:**
${context.name}

**Business Use Case:**
${context.businessUseCase}

**Domain Knowledge:**
${context.domainKnowledge || "None provided"}

**Domain Documents:**
${domainDocsText}

**Validation Rules:**
${context.validationRules || "None provided"}

**Guardrails:**
${context.guardrails || "None provided"}

**Sample Data:**
${sampleDataText}

**Available Actions:**
${actionsText}

---

Now create a well-structured system prompt following the instructions above.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: metaPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const responseText = response.text || "";
    
    // Extract the system prompt from between the <system_prompt> tags
    const systemPromptMatch = responseText.match(/<system_prompt>([\s\S]*?)<\/system_prompt>/);
    if (systemPromptMatch && systemPromptMatch[1]) {
      return systemPromptMatch[1].trim();
    }
    
    // If no tags found, return the whole response (fallback)
    return responseText.trim() || "Unable to generate system prompt. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate system prompt: ${error?.message || error}`);
  }
}

export interface SampleDataGenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  dataType?: string;
  recordCount?: number;
  format?: "json" | "csv" | "text";
  model?: GeminiModel;
}

export async function generateSampleData(context: SampleDataGenerationContext): Promise<SampleDataset> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const format = context.format || "json";
  const recordCount = context.recordCount || 10;
  const dataType = context.dataType || "sample records";

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const formatInstructions: Record<string, string> = {
    json: `Output the data as a valid JSON array. Each record should be a JSON object with relevant fields. Example format:
[
  { "field1": "value1", "field2": "value2" },
  { "field1": "value3", "field2": "value4" }
]`,
    csv: `Output the data as CSV format with a header row. Use comma as delimiter. Example format:
field1,field2,field3
value1,value2,value3
value4,value5,value6`,
    text: `Output the data as plain text with each record on a new line. Use a clear, consistent format that's easy to parse.`
  };

  const systemPrompt = `You are an expert at creating realistic sample datasets for AI chatbot testing. Based on the business use case and domain knowledge provided, generate sample data that would be useful for testing and training the chatbot.

The sample data should:
1. Be realistic and relevant to the business context
2. Include a variety of scenarios and edge cases
3. Contain accurate, plausible data (names, dates, numbers, etc.)
4. Be formatted consistently and ready to use

${formatInstructions[format]}

Generate exactly ${recordCount} records.
Output ONLY the data in the specified format, nothing else. No explanations, no code blocks, no markdown wrapping.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Data Type Requested: ${dataType}
Number of Records: ${recordCount}
Output Format: ${format.toUpperCase()}

Generate sample ${dataType} data for testing this AI chatbot.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    const dataset: SampleDataset = {
      id: uuidv4(),
      name: `Generated ${dataType} (${format.toUpperCase()})`,
      description: `AI-generated sample ${dataType} with ${recordCount} records`,
      content: content,
      format: format,
      isGenerated: true,
      createdAt: new Date().toISOString(),
    };

    return dataset;
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate sample data: ${error?.message || error}`);
  }
}

export async function evaluateContextSufficiency(
  context: GenerationContext,
  generationType: "validation" | "guardrails"
): Promise<ContextEvaluationResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content.slice(0, 500)}`).join("\n\n")
    : "";

  const typeDescription = generationType === "validation" 
    ? "input/output validation rules (data formats, required fields, constraints)"
    : "safety guardrails (content restrictions, safety boundaries, escalation triggers)";

  const systemPrompt = `You are an expert at evaluating whether there is enough context to generate high-quality ${typeDescription} for an AI agent.

Your task is to analyze the provided business use case and domain knowledge to determine if there is sufficient information.

You must respond with ONLY a JSON object in this exact format:
{
  "hasEnoughContext": true/false,
  "missingAreas": ["area1", "area2"],
  "initialQuestion": "Your first clarifying question if context is insufficient, or null if sufficient"
}

Consider these factors:
- Is the business use case specific enough to understand what the agent does?
- Are there enough details about the types of inputs/data the agent will handle?
- Is the industry/domain context clear enough?
- For validation rules: Are data types, formats, and constraints inferable?
- For guardrails: Are sensitive topics, risks, and boundaries identifiable?

Be reasonable - you don't need exhaustive detail, just enough to generate useful ${generationType === "validation" ? "rules" : "guardrails"}.
If the context is minimal (e.g., just a brief use case with no domain knowledge), mark hasEnoughContext as false.`;

  const userPrompt = `Evaluate if there is enough context to generate ${generationType === "validation" ? "validation rules" : "guardrails"}:

Business Use Case: ${context.businessUseCase || "(empty)"}

Domain Knowledge: ${context.domainKnowledge || "(empty)"}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : "Domain Documents: (none)"}

Respond with the JSON evaluation.`;

  try {
    const response = await generateWithRetry({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        hasEnoughContext: result.hasEnoughContext === true,
        missingAreas: result.missingAreas || [],
        initialQuestion: result.initialQuestion || null,
      };
    }
    
    return {
      hasEnoughContext: true,
      missingAreas: [],
      initialQuestion: null,
    };
  } catch (error: any) {
    console.error("Context evaluation error:", error?.message || error);
    return {
      hasEnoughContext: true,
      missingAreas: [],
      initialQuestion: null,
    };
  }
}

export async function processClarifyingChat(
  context: ClarifyingChatContext,
  userMessage: string
): Promise<ClarifyingChatResponse> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content.slice(0, 300)}`).join("\n\n")
    : "";

  const existingInsights = context.clarifyingInsights?.length
    ? context.clarifyingInsights.map(i => `Q: ${i.question}\nA: ${i.answer}`).join("\n\n")
    : "";

  const typeDescription = context.generationType === "validation" 
    ? "input/output validation rules"
    : "safety guardrails";

  const systemPrompt = `You are a helpful assistant gathering information to generate high-quality ${typeDescription} for an AI agent.

Current context about the agent:
- Business Use Case: ${context.businessUseCase || "(not specified)"}
- Domain Knowledge: ${context.domainKnowledge || "(none)"}
${domainDocsText ? `- Domain Documents:\n${domainDocsText}` : ""}
${existingInsights ? `\nPreviously gathered insights:\n${existingInsights}` : ""}

Your role:
1. Ask ONE focused clarifying question at a time to gather missing information
2. After the user answers, acknowledge their response briefly
3. If you now have enough context, say you're ready to generate
4. Keep questions conversational and easy to understand

You must respond with ONLY a JSON object:
{
  "message": "Your response message to the user",
  "isReadyToGenerate": true/false,
  "gatheredInsight": {
    "question": "The question you asked that they answered",
    "answer": "Summary of their answer (if they just responded to a question)"
  }
}

Set isReadyToGenerate to true only when you have gathered enough useful information (after 1-3 questions typically).
If the user just answered a question, include gatheredInsight. If you're asking the first question, omit it.`;

  const contents = [
    ...context.chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];

  try {
    const response = await generateWithRetry({
      model: "gemini-2.0-flash",
      config: {
        systemInstruction: systemPrompt,
      },
      contents: contents,
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const chatResponse: ClarifyingChatResponse = {
        message: result.message || "I'm ready to generate now.",
        isReadyToGenerate: result.isReadyToGenerate === true,
      };
      
      if (result.gatheredInsight?.question && result.gatheredInsight?.answer) {
        chatResponse.gatheredInsight = {
          id: uuidv4(),
          question: result.gatheredInsight.question,
          answer: result.gatheredInsight.answer,
          category: context.generationType === "validation" ? "validation" : "guardrails",
          createdAt: new Date().toISOString(),
        };
      }
      
      return chatResponse;
    }
    
    return {
      message: "I have enough information now. Ready to generate!",
      isReadyToGenerate: true,
    };
  } catch (error: any) {
    console.error("Clarifying chat error:", error?.message || error);
    throw new Error(`Failed to process chat: ${error?.message || error}`);
  }
}

export async function generateValidationRulesWithInsights(
  context: GenerationContext & { clarifyingInsights?: ClarifyingInsight[] }
): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const insightsText = context.clarifyingInsights?.length
    ? context.clarifyingInsights
        .filter(i => i.category === "validation" || i.category === "general")
        .map(i => `Q: ${i.question}\nA: ${i.answer}`)
        .join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating validation rules for AI agents. Based on the business use case, domain knowledge, and additional insights provided, generate appropriate validation criteria in Markdown format.

The validation criteria should define WHAT MAKES A VALID REQUEST, not step-by-step processes:
1. Required Information - What information is needed (but agent can gather it flexibly)
2. Validation Criteria - What conditions must be met (e.g., "balance must be sufficient", "date must be in future")
3. What to do when validation fails - How to handle invalid requests

CRITICAL: Write CRITERIA and PRINCIPLES, not rigid step-by-step instructions.
- ✅ Good: "Verify time-off request doesn't exceed available balance. If insufficient, explain accrual schedule."
- ❌ Bad: "Step 1: Ask for start date. Step 2: Ask for end date. Step 3: Check balance."

The agent will apply these criteria flexibly in conversation. Focus on what makes requests valid/invalid.
Output ONLY the validation criteria in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

${insightsText ? `Additional Context from Q&A:\n${insightsText}` : ""}

Generate validation rules for an AI agent handling this use case.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Input Validation Rules\n\n- Unable to generate validation rules. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate validation rules: ${error?.message || error}`);
  }
}

export async function generateGuardrailsWithInsights(
  context: GenerationContext & { clarifyingInsights?: ClarifyingInsight[] }
): Promise<string> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const insightsText = context.clarifyingInsights?.length
    ? context.clarifyingInsights
        .filter(i => i.category === "guardrails" || i.category === "general")
        .map(i => `Q: ${i.question}\nA: ${i.answer}`)
        .join("\n\n")
    : "";

  const systemPrompt = `You are an expert at creating safety guardrails for AI agents. Based on the business use case, domain knowledge, and additional insights provided, generate appropriate guardrails in Markdown format.

The guardrails should define BOUNDARIES and ESCALATION CRITERIA:
1. What NOT to do - Specific actions/topics the agent should avoid
2. When to escalate - Clear criteria for routing to human support (not rigid rules)
3. Privacy/Security - What sensitive data to protect

CRITICAL: Write PRINCIPLES that guide behavior, not rigid scripts.
- ✅ Good: "Don't approve time-off requests (only managers can). Escalate when: request violates blackout period, balance calculation unclear."
- ❌ Bad: "If user asks to approve, say 'I cannot approve requests' and ask if they want to view instead."

Focus on defining boundaries and escalation triggers. The agent will apply these principles naturally.
Output ONLY the guardrails in Markdown format, nothing else.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

${insightsText ? `Additional Context from Q&A:\n${insightsText}` : ""}

Generate safety guardrails for an AI agent handling this use case.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    return response.text || "# Agent Guardrails\n\n- Unable to generate guardrails. Please try again.";
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate guardrails: ${error?.message || error}`);
  }
}

// ====== Action Simulation Generation ======

export interface ActionsGenerationContext {
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  model?: GeminiModel;
}

export interface GeneratedActionsResult {
  actions: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    requiredFields: Array<{
      name: string;
      type: "string" | "number" | "boolean" | "date" | "select";
      label: string;
      required: boolean;
      options?: string[];
      description?: string;
    }>;
    confirmationMessage: string;
    successMessage: string;
    affectedDataFields: string[];
  }>;
  mockUserState: Array<{
    id: string;
    name: string;
    description: string;
    fields: Record<string, any>;
    isGenerated: boolean;
    createdAt: string;
  }>;
}

export async function generateActionsAndMockData(context: ActionsGenerationContext): Promise<GeneratedActionsResult> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const domainDocsText = context.domainDocuments?.length 
    ? context.domainDocuments.map(doc => `${doc.filename}: ${doc.content}`).join("\n\n")
    : "";

  const systemPrompt = `You are an expert at designing agent capabilities for HR/business AI assistants. Based on the business use case, generate a list of ACTIONS the agent can perform for users.

Note: The agent already has sample data uploaded separately. You only need to generate actions that work with that data.

IMPORTANT: Do NOT use words like "simulate", "mock", "demo", "test", or "fake" in any action descriptions, confirmation messages, or success messages. Use natural professional language like "process", "update", "complete", "add", "remove", etc.

Your response must be ONLY valid JSON with this exact structure:
{
  "actions": [
    {
      "name": "action_name_snake_case",
      "description": "What this action does",
      "category": "category_name",
      "requiredFields": [
        {
          "name": "field_name",
          "type": "string|number|boolean|date|select",
          "label": "Human Readable Label",
          "required": true,
          "options": ["option1", "option2"],
          "description": "Field description"
        }
      ],
      "confirmationMessage": "Message shown before executing: You are about to...",
      "successMessage": "Message shown after success: Successfully...",
      "affectedDataFields": ["field1", "field2"]
    }
  ]
}

Guidelines:
1. Generate 3-8 realistic actions the agent could perform
2. Actions should be things users would ask to do (submit, update, add, remove, request, etc.)
3. Each action should have realistic required fields
4. Actions will work with the sample data the user has already uploaded

Output ONLY the JSON, no markdown, no explanation.`;

  const userPrompt = `Business Use Case: ${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge: ${context.domainKnowledge}` : ""}

${domainDocsText ? `Domain Documents:\n${domainDocsText}` : ""}

Generate actions for this AI agent.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    // Parse the JSON response
    let parsed;
    try {
      // Clean up potential markdown wrapping
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse generated actions JSON:", content);
      throw new Error("Failed to parse generated actions. Please try again.");
    }

    // Add IDs and timestamps to the parsed data
    const now = new Date().toISOString();
    const actions = (parsed.actions || []).map((action: any, index: number) => ({
      id: uuidv4(),
      name: action.name || `action_${index}`,
      description: action.description || "",
      category: action.category || "general",
      requiredFields: (action.requiredFields || []).map((field: any) => ({
        name: field.name || "",
        type: field.type || "string",
        label: field.label || field.name || "",
        required: field.required !== false,
        options: field.options,
        description: field.description,
      })),
      confirmationMessage: action.confirmationMessage || "",
      successMessage: action.successMessage || "",
      affectedDataFields: action.affectedDataFields || [],
    }));

    // Return empty mockUserState for backward compatibility
    // Actions now work with sample data uploaded in Step 6
    return { actions, mockUserState: [] };
  } catch (error: any) {
    console.error("Gemini API error:", error?.message || error);
    throw new Error(`Failed to generate actions: ${error?.message || error}`);
  }
}

// Smart Business Case Extractor
// Reads extraction rules from config file and extracts only prompt-relevant content

export interface ExtractionRulesConfig {
  description: string;
  version: string;
  keepCategories: Record<string, {
    description: string;
    keywords: string[];
    sectionHeaders: string[];
  }>;
  discardCategories: Record<string, {
    description: string;
    keywords: string[];
    sectionHeaders: string[];
  }>;
  extractionPrompt: string;
  outputFormat: {
    includeExtractedSections: boolean;
    includeDiscardedSummary: boolean;
    maxLength: number;
  };
}

export interface ExtractionResult {
  extractedContent: string;
  discardedSummary: string[];
  keepCategories: string[];
  success: boolean;
  error?: string;
}

function loadExtractionRules(): ExtractionRulesConfig {
  // Use process.cwd() which is reliable in both ESM and CJS environments
  const rulesPath = path.join(process.cwd(), "server", "extraction-rules.json");
  
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, "utf-8");
    return JSON.parse(content);
  }
  
  throw new Error(`Extraction rules config not found at: ${rulesPath}`);
}

export async function extractBusinessCaseContent(
  businessCaseText: string,
  model?: GeminiModel
): Promise<ExtractionResult> {
  const modelToUse = model || defaultGenerationModel;
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Load the extraction rules from config
  let rules: ExtractionRulesConfig;
  try {
    rules = loadExtractionRules();
  } catch (error: any) {
    console.error("Failed to load extraction rules:", error?.message || error);
    return {
      extractedContent: businessCaseText,
      discardedSummary: [],
      keepCategories: [],
      success: false,
      error: "Failed to load extraction rules config: " + (error?.message || String(error))
    };
  }

  // Build the system prompt from config
  const keepCategoriesList = Object.entries(rules.keepCategories)
    .map(([name, cat]) => `- **${name}**: ${cat.description}`)
    .join("\n");
  
  const discardCategoriesList = Object.entries(rules.discardCategories)
    .map(([name, cat]) => `- **${name}**: ${cat.description}`)
    .join("\n");

  const systemPrompt = `${rules.extractionPrompt}

## Categories to KEEP (extract this content):
${keepCategoriesList}

## Categories to DISCARD (remove this content):
${discardCategoriesList}

Respond with a JSON object containing:
{
  "extractedContent": "The cleaned business case with only prompt-relevant content, formatted clearly",
  "discardedSummary": ["List of section names/topics that were removed"],
  "keepCategories": ["List of categories that were found and kept"]
}

Keep the extracted content well-organized and readable. Remove any ROI formulas, metrics, implementation plans, and executive summaries. Focus on what defines agent behavior.`;

  const userPrompt = `Extract the prompt-relevant content from this business case document:

---
${businessCaseText}
---

Return only the JSON response with extracted content.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const content = response.text || "";
    
    // Parse the JSON response
    let parsed;
    try {
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse extraction result:", content);
      return {
        extractedContent: businessCaseText,
        discardedSummary: [],
        keepCategories: [],
        success: false,
        error: "Failed to parse extraction result"
      };
    }

    // Enforce max length if configured
    let extractedContent = parsed.extractedContent || businessCaseText;
    if (rules.outputFormat.maxLength && extractedContent.length > rules.outputFormat.maxLength) {
      extractedContent = extractedContent.substring(0, rules.outputFormat.maxLength) + "\n\n[Content truncated to fit maximum length]";
    }

    return {
      extractedContent,
      discardedSummary: parsed.discardedSummary || [],
      keepCategories: parsed.keepCategories || [],
      success: true
    };
  } catch (error: any) {
    console.error("Gemini API error during extraction:", error?.message || error);
    return {
      extractedContent: businessCaseText,
      discardedSummary: [],
      keepCategories: [],
      success: false,
      error: `Extraction failed: ${error?.message || error}`
    };
  }
}

export interface WelcomeConfigGenerationContext {
  name: string;
  businessUseCase: string;
  domainKnowledge?: string;
  sampleData?: string;
  model?: GeminiModel;
}

export interface GeneratedWelcomeConfig {
  greeting: string;
  suggestedPrompts: Array<{ id: string; title: string; prompt: string }>;
}

export async function generateWelcomeConfig(context: WelcomeConfigGenerationContext): Promise<GeneratedWelcomeConfig> {
  const modelToUse = context.model || defaultGenerationModel;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const systemPrompt = `You are an expert at creating welcoming, user-friendly start screens for AI agents. Based on the agent's name, business use case, domain knowledge, and sample data (if provided), generate:

1. A short, friendly greeting message (1-2 sentences) that tells the user what this agent can help with. Do NOT include the agent's name in the greeting. Keep it conversational and action-oriented.

2. Exactly 4-6 suggested prompts that represent the most common tasks users would want to do with this agent. Each prompt should have:
   - A short title (2-5 words) that describes the task category
   - A complete, ready-to-send prompt that the user can click to immediately start a conversation

The prompts should cover the breadth of what the agent can do, from simple to moderate complexity.

CRITICAL: If sample data is provided, you MUST use the EXACT column names, field names, and example values from the sample data in your suggested prompts. Do NOT invent or guess column names. Only reference columns that actually exist in the provided sample data. For example, if the sample data has a column called "Hourly Pay", use "Hourly Pay" — not "HourlyRate" or "Hourly_Rate". This ensures the prompts are directly relevant and actionable for the user's actual data.

IMPORTANT: Return ONLY valid JSON in this exact format, no markdown, no code fences:
{
  "greeting": "Your greeting message here",
  "suggestedPrompts": [
    { "title": "Short Title", "prompt": "The full prompt text the user would send" },
    { "title": "Another Title", "prompt": "Another full prompt" }
  ]
}`;

  const userPrompt = `Agent Name: ${context.name}

Business Use Case:
${context.businessUseCase}

${context.domainKnowledge ? `Domain Knowledge:\n${context.domainKnowledge}` : ""}

${context.sampleData ? `Sample Data (CRITICAL: You MUST reference the EXACT column names and example values from this data in your suggested prompts. Do NOT invent column names that are not present here):\n${context.sampleData}` : ""}

Generate the welcome screen configuration.`;

  try {
    const response = await generateWithRetry({
      model: modelToUse,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 4000,
      },
    });

    const text = response.text?.trim() || "";
    const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (jsonError: any) {
      console.error("Failed to parse welcome config JSON. Raw text:", text);
      const greetingMatch = cleanedText.match(/"greeting"\s*:\s*"([^"]+)"/);
      const promptMatches = [...cleanedText.matchAll(/"title"\s*:\s*"([^"]+)"[^}]*"prompt"\s*:\s*"([^"]+)"/g)];
      if (greetingMatch && promptMatches.length > 0) {
        parsed = {
          greeting: greetingMatch[1],
          suggestedPrompts: promptMatches.map(m => ({ title: m[1], prompt: m[2] })),
        };
      } else {
        throw new Error(`Failed to parse AI response as JSON: ${jsonError.message}`);
      }
    }

    const suggestedPrompts = (parsed.suggestedPrompts || []).map((p: any, i: number) => ({
      id: uuidv4(),
      title: p.title || `Prompt ${i + 1}`,
      prompt: p.prompt || "",
    }));

    return {
      greeting: parsed.greeting || `How can I help you today?`,
      suggestedPrompts,
    };
  } catch (error: any) {
    console.error("Error generating welcome config:", error);
    throw new Error(`Failed to generate welcome config: ${error?.message || error}`);
  }
}

// ==================== PROMPT COACH ====================

export interface PromptCoachContext {
  agentName: string;
  businessUseCase: string;
  domainKnowledge: string;
  validationRules: string;
  guardrails: string;
  sampleDataSummary: string;
  welcomeConfig: string;
  availableActions: string;
  customPrompt: string;
}

export interface PromptCoachMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PromptCoachResponse {
  message: string;
  suggestedChanges?: {
    field: string;
    action: "replace" | "append";
    content: string;
    explanation: string;
    promptUpdate?: {
      findText: string;
      replaceText: string;
    };
  }[];
}

function isReviewRequest(message: string, chatHistory?: PromptCoachMessage[]): boolean {
  const lower = message.toLowerCase().trim();
  const reviewPatterns = [
    /\breview\b/,
    /\banalyze\b/,
    /\baudit\b/,
    /\bassess\b/,
    /\bevaluate\b/,
    /\bfull analysis\b/,
    /\bcheck everything\b/,
    /\bwhat.s wrong\b/,
    /\bwhat needs (fixing|improvement|work)\b/,
    /\bhow.s my (agent|config|prompt)\b/,
    /\bany (issues|problems|improvements)\b/,
    /\blook over\b/,
    /\bgrade\b/,
    /\bscore\b/,
  ];
  if (reviewPatterns.some((p) => p.test(lower))) return true;

  const followUpPatterns = [
    /\banything else\b/,
    /\bwhat else\b/,
    /\bnothing to improve\b/,
    /\bnothing else\b/,
    /\bthat.s it\b/,
    /\bmore\b.*\b(issues|problems|feedback|suggestions)\b/,
    /\bkeep going\b/,
    /\bdig deeper\b/,
    /\bwhat about\b/,
  ];
  if (followUpPatterns.some((p) => p.test(lower)) && chatHistory && chatHistory.length > 0) {
    const recentHistory = chatHistory.slice(-6);
    return recentHistory.some((msg) => {
      const msgLower = msg.content.toLowerCase();
      return reviewPatterns.some((p) => p.test(msgLower)) || msgLower.includes("issues found") || msgLower.includes("top fixes") || msgLower.includes("top 3 fixes");
    });
  }

  return false;
}

function buildPromptCoachSystemPrompt(context: PromptCoachContext, isReview: boolean): string {
  const reviewInstructions = isReview ? `
## FULL REVIEW MODE — ACTIVE
The user asked for a review. You MUST deliver a thorough, critical analysis. Follow this structure exactly:

### Review Structure (use these headers):
**Issues Found** — List every problem you find, ordered by severity. For each issue:
- Name the field and quote the problematic text
- Explain why it's a problem (be specific — e.g., "this guardrail is unenforceable because it uses vague language like 'be professional' instead of always/never rules")
- Rate severity: Critical / Important / Minor

**What's Working** — Brief acknowledgment (2-3 sentences max) of genuinely strong areas. Don't pad this section.

**Top 3 Fixes** — Provide up to 3 suggested_change blocks for the highest-impact improvements.

### Review Checklist — Evaluate EVERY field against these criteria:
1. **Business Use Case**: Does it define scope, audience, AND boundaries (what the agent does NOT do)? Are the boundaries specific enough to prevent scope creep?
2. **Domain Knowledge**: Is it organized by topic? Does it contain actionable facts (numbers, dates, names) vs. vague statements? Are edge cases covered? Are there contradictions?
3. **Validation Rules**: Are input formats specified with examples? Are boundary conditions defined? Are error messages included? Is anything missing based on the use case?
4. **Guardrails**: Does every rule use enforceable language (always/never)? Are common failure modes covered (hallucination, scope creep, data leakage)? Any duplicates or contradictions?
5. **Welcome Screen**: Does the greeting match the agent's personality? Do suggested prompts cover the main use cases?
6. **Agent Prompt**: Is it consistent with the config fields? Any sections that contradict the guardrails or domain knowledge?
7. **Sample Data & Actions**: Sufficient for testing the main use cases?

### Critical rules for reviews:
- If a field looks comprehensive, stress-test it: imagine edge cases, adversarial inputs, or ambiguous scenarios. Would the agent handle them correctly with this config?
- If you find NO issues in a field, you MUST still explain WHY it's solid (e.g., "Guardrails use enforceable always/never language and cover the 3 main failure modes for this domain").
- Finding "nothing to improve" is almost never correct. Even strong configs have gaps. Dig deeper.
- You may suggest up to 3 changes in a review. Provide the highest-impact ones.
` : "";

  return `You are the Prompt Coach for Agent Studio — a critical, expert-level prompt engineer who helps users build production-ready AI agents. Your job is to find problems, not give compliments. Users come to you because they need honest, specific feedback that makes their agent better.

## Core Principle: Be Useful, Not Polite
- Lead with what's wrong. Users don't need reassurance — they need actionable fixes.
- Never say "Your config looks strong" unless you've checked every field against specific criteria and genuinely can't find issues.
- If something is "fine," look harder. Test it against edge cases. Would this config survive adversarial inputs? Real-world ambiguity?
- When you find an issue, be direct: name the field, quote the problematic text, explain why it fails, and fix it.

## CRITICAL: Analyze Before Advising
Before every response, silently review the agent's full configuration below. Ground ALL advice in what you actually see — reference specific content, quote actual text, and identify concrete gaps. Never give generic advice like "add more detail to your guardrails." Instead say exactly what's missing and why, based on the business use case and domain.

## Agent Configuration
- Name: ${context.agentName}
- Business Use Case: ${context.businessUseCase || "(not set)"}
- Domain Knowledge: ${context.domainKnowledge || "(not set)"}
- Validation Rules: ${context.validationRules || "(not set)"}
- Guardrails: ${context.guardrails || "(not set)"}
- Sample Data: ${context.sampleDataSummary || "(none)"}
- Welcome Screen: ${context.welcomeConfig || "(not configured)"}
- Available Actions: ${context.availableActions || "(none)"}
- Current Agent Prompt: ${context.customPrompt || "(not generated yet)"}
${reviewInstructions}
## How to Respond
- **Domain questions** ("How does X work?"): Answer directly using the config above, then note if the config has gaps for that topic.
- **Problem reports** ("The agent keeps doing X"): Trace the root cause to a specific config field. Quote the problematic section. Suggest a fix.
- **Review requests** ("Review my agent"): Follow the FULL REVIEW MODE instructions above. Be thorough and critical.
- **Follow-ups** ("anything else?" / "what else?"): Don't say "nothing else." Always dig deeper — check a field you haven't analyzed yet, test an edge case, or stress-test a guardrail.
- **Bug reports**: Summarize the issue briefly and direct them to the Replit feedback button. Don't attempt to fix platform issues.

## Prompt Engineering Knowledge — What "Good" Looks Like
Use this knowledge to evaluate and improve the agent's configuration:

**Good Business Use Case:** Specific scope, clear audience, defined boundaries (what the agent does NOT do).
- Bad: "Help employees with HR questions"
- Good: "Help employees check PTO balances, submit time-off requests, and understand benefits enrollment. Does not handle payroll disputes or manager approvals."

**Good Domain Knowledge:** Organized by topic, actionable facts (numbers, dates, thresholds), covers edge cases and exceptions.
- Bad: "Our company has a great benefits program with many options."
- Good: "Medical plans: PPO ($200/mo, $1500 deductible) and HDHP ($120/mo, $3000 deductible, HSA-eligible). Open enrollment: Nov 1-15. Mid-year changes require a qualifying life event (marriage, birth, job loss of spouse)."

**Good Validation Rules:** Specific formats with examples, boundary conditions, error messages, covers all input types mentioned in the use case.
- Bad: "Validate employee input"
- Good: "Employee ID must be 6 digits starting with E (e.g., E001234). Dates must be MM/DD/YYYY and cannot be in the past for time-off requests."

**Good Guardrails:** Every rule uses enforceable "always/never" language, specific to the domain, covers common failure modes (hallucination, scope creep, data leakage, over-promising).
- Bad: "Be professional and helpful"
- Good: "Never disclose salary information for other employees. Always confirm the employee's identity before showing personal data. If unsure about a policy, say 'I'm not certain — please check with HR directly' rather than guessing."

## Apply-able Fields
You can propose changes to these fields via suggested_change blocks:
- "businessUseCase" — scope, audience, boundaries
- "domainKnowledge" — facts, policies, procedures, edge cases
- "validationRules" — input formats, constraints, error handling
- "guardrails" — behavioral boundaries, safety rules
- "welcomeGreeting" — plain text greeting string
- "welcomeSuggestedPrompts" — JSON array: [{"id":"1","title":"Short label","prompt":"Full prompt text"}]

## Read-Only Fields (advise but can't apply)
- **Agent Prompt** — Analyze it to trace issues. If the problem is in the prompt template itself (not a config field), tell the user to edit it in the Agent Prompt editor.
- **Sample Data**, **Available Actions** — Advise on improvements verbally.

## Suggesting Changes
When you have an improvement, output a suggested_change block:
\`\`\`suggested_change
{
  "field": "guardrails",
  "action": "append",
  "content": "The actual text to add or replace with.",
  "explanation": "One sentence explaining why.",
  "promptUpdate": {
    "findText": "exact text from Current Agent Prompt to find",
    "replaceText": "replacement text"
  }
}
\`\`\`
Valid fields: "businessUseCase", "domainKnowledge", "validationRules", "guardrails", "welcomeGreeting", "welcomeSuggestedPrompts"
Valid actions: "replace" (replace entire field) or "append" (add to existing)

**promptUpdate rules:** Applying a change ONLY updates the config field, NOT the agent prompt. To keep them in sync, include "promptUpdate" with:
- "findText": An exact substring copied character-for-character from the Current Agent Prompt above
- "replaceText": The replacement text, consistent with surrounding prompt structure
Omit "promptUpdate" if the agent prompt has no matching section for this change. Only update the specific section relevant to the change.

### How many suggestions per response:
- **Full reviews**: Up to 3 suggested_change blocks, covering different fields. Prioritize by impact.
- **All other responses**: 1 suggested_change block — the single highest-impact fix.
- Answer domain questions first, then coach. Don't re-ask for information already provided in the conversation.

## Response Style
- Lead with findings, not praise. No preamble, no "Great question!", no "You're right to push for improvement!", no filler.
- Keep responses under 80 words unless doing a full review or answering a domain question.
- For full reviews: be as thorough as needed — don't truncate your analysis. Cover every field.
- Use bullets only for 3+ items. No headers in single-topic responses.
- Be direct and honest — like a senior engineer doing a code review, not a cheerful assistant.
- Never repeat what the user already said or knows about their config.
- If the user asks "anything else?" — always have something. Check another field, test an edge case, or stress-test a guardrail. Never say "looks good" without proving it.

## BAD response patterns (NEVER do these):
- "Your configuration is very strong, particularly in..." (vague praise without substance)
- "You're right to push for continuous improvement!" (deflective cheerleading)
- "I found a minor redundancy" as the ONLY feedback after a full review (lazy analysis)
- Leading with what's working before addressing what's broken

## GOOD response pattern:
User: "Review my agent"
Coach: "**Issues Found**
1. **Guardrails (Important)**: Line 'Do not proactively prompt for coverage assignment after processing a call-in' appears twice. More critically, there's no guardrail preventing the agent from [specific gap based on use case].
2. **Domain Knowledge (Important)**: [specific gap]...
3. **Validation Rules (Minor)**: [specific gap]...

**What's Working**: [brief, specific praise]

**Top Fixes:**
[suggested_change blocks]"`;
}

function parseSuggestedChanges(text: string): PromptCoachResponse["suggestedChanges"] {
  const changes: PromptCoachResponse["suggestedChanges"] = [];
  const regex = /```suggested_change\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.field && parsed.action && parsed.content) {
        const change: any = {
          field: parsed.field,
          action: parsed.action,
          content: parsed.content,
          explanation: parsed.explanation || "",
        };
        if (parsed.promptUpdate && parsed.promptUpdate.findText && parsed.promptUpdate.replaceText) {
          change.promptUpdate = {
            findText: parsed.promptUpdate.findText,
            replaceText: parsed.promptUpdate.replaceText,
          };
        }
        changes.push(change);
      }
    } catch {
      // Skip malformed JSON blocks
    }
  }
  return changes.length > 0 ? changes : undefined;
}

function cleanCoachResponse(text: string): string {
  return text.replace(/```suggested_change\s*\n[\s\S]*?```/g, "").trim();
}

export async function generatePromptCoachResponse(
  context: PromptCoachContext,
  chatHistory: PromptCoachMessage[],
  userMessage: string,
  model: GeminiModel = defaultGenerationModel,
): Promise<PromptCoachResponse> {
  try {
    const isReview = isReviewRequest(userMessage, chatHistory);
    const systemPrompt = buildPromptCoachSystemPrompt(context, isReview);
    
    const contents = chatHistory.map((msg) => ({
      role: msg.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: msg.content }],
    }));
    
    contents.push({
      role: "user" as const,
      parts: [{ text: userMessage }],
    });

    const response = await generateWithRetry({
      model: model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: isReview ? 0.4 : 0.5,
        maxOutputTokens: isReview ? 3000 : 1200,
      },
    });

    const text = response.text?.trim() || "I'm sorry, I wasn't able to process that. Could you try rephrasing?";
    
    const suggestedChanges = parseSuggestedChanges(text);
    const cleanedMessage = suggestedChanges ? cleanCoachResponse(text) : text;

    return {
      message: cleanedMessage,
      suggestedChanges,
    };
  } catch (error: any) {
    console.error("Error in prompt coach:", error);
    throw new Error(`Prompt Coach error: ${error?.message || error}`);
  }
}
