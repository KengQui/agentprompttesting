import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2, Bot, Briefcase, Shield, AlertTriangle, Loader2, BookOpen, Upload, X, FileText, Code, Pencil, RotateCcw, HelpCircle, ExternalLink, Info, Sparkles, ChevronDown, ChevronUp, Database, Check, Settings, Activity, FlaskConical, Zap, User, Eye, Filter, Plus, ArrowRight, CheckSquare, CheckCircle2, XCircle, AlertCircle, MessageSquare, CloudDownload, Copy, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { v4 as uuidv4 } from "uuid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { businessUseCaseTemplate, validationRulesTemplate, guardrailsTemplate } from "@/lib/config-templates";
import { TracingDashboard, SimulationPanel, ConfigHistoryPanel } from "@/components/tracing-dashboard";
import type { Agent, UpdateAgent, AgentStatus, DomainDocument, SampleDataset, GeminiModel, AgentAction, MockUserState, MockMode, ActionField, ClarifyingInsight, WelcomeConfig, WelcomePrompt, SavedPrompt, DataColumnsCard } from "@shared/schema";
import { geminiModelDisplayNames, defaultGenerationModel, mockModeDescriptions } from "@shared/schema";
import { ClarifyingChatDialog } from "@/components/clarifying-chat-dialog";

interface ExtractionResult {
  extractedContent: string;
  discardedSummary: string[];
  keepCategories: string[];
  success: boolean;
  error?: string;
}

interface GuardrailConflict {
  type: string;
  severity: 'error' | 'warning' | 'info';
  guardrailRule: string;
  recoveryRule: string;
  suggestion: string;
  topic?: string;
}

interface ConflictCheckResult {
  conflicts: GuardrailConflict[];
  hasErrors: boolean;
  hasWarnings: boolean;
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

const actionCategories = ["general", "create", "read", "update", "delete", "search", "export", "import", "notify"];
const fieldTypes = ["string", "number", "boolean", "date", "select"] as const;

function extractFieldsFromSampleData(datasets: SampleDataset[]): { name: string; type: string; source: string }[] {
  const fields: { name: string; type: string; source: string }[] = [];
  
  for (const dataset of datasets) {
    if (dataset.format === "json") {
      try {
        const parsed = JSON.parse(dataset.content);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        if (items.length > 0 && typeof items[0] === "object") {
          for (const key of Object.keys(items[0])) {
            const value = items[0][key];
            let type = "string";
            if (typeof value === "number") type = "number";
            else if (typeof value === "boolean") type = "boolean";
            else if (typeof value === "string" && !isNaN(Date.parse(value)) && value.includes("-")) type = "date";
            
            if (!fields.find(f => f.name === key)) {
              fields.push({ name: key, type, source: dataset.name });
            }
          }
        }
      } catch {}
    } else if (dataset.format === "csv") {
      const lines = dataset.content.split("\n");
      if (lines.length > 0) {
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        for (const header of headers) {
          if (header && !fields.find(f => f.name === header)) {
            fields.push({ name: header, type: "string", source: dataset.name });
          }
        }
      }
    }
  }
  
  return fields;
}

const settingsSteps = [
  { id: 1, name: "General", icon: Bot, description: "Name and status" },
  { id: 2, name: "Business Use Case", icon: Briefcase, description: "Define the problem this agent solves" },
  { id: 3, name: "Domain Knowledge", icon: BookOpen, description: "Add knowledge and documents" },
  { id: 4, name: "Validation Rules", icon: Shield, description: "Set input/output validation rules" },
  { id: 5, name: "Guardrails", icon: AlertTriangle, description: "Define safety boundaries" },
  { id: 6, name: "Sample Data", icon: Database, description: "Upload or generate sample data" },
  { id: 7, name: "Available Actions", icon: Zap, description: "Define actions agent can simulate" },
  { id: 8, name: "Validation Checklist", icon: CheckSquare, description: "Review configuration quality" },
  { id: 9, name: "Prompt Configuration", icon: Code, description: "Customize the system prompt" },
  { id: 10, name: "Welcome Screen", icon: MessageSquare, description: "Configure the chat welcome screen" },
];

function SettingsStepIndicator({ 
  currentStep, 
  onStepClick,
  completedSteps 
}: { 
  currentStep: number; 
  onStepClick: (step: number) => void;
  completedSteps: Set<number>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col gap-4">
        {settingsSteps.map((step) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = currentStep === step.id;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              onClick={() => onStepClick(step.id)}
              className="flex flex-col gap-0.5 text-left hover:opacity-80 transition-opacity"
              data-testid={`settings-step-indicator-${step.id}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground hidden lg:block ml-7">
                {step.description}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-6 pt-4 border-t">
        <div className="text-xs text-muted-foreground">{settingsSteps.length} steps total</div>
      </div>
    </div>
  );
}

type SettingsCheckStatus = 'pass' | 'fail' | 'unable_to_verify';
type SettingsCheckResult = {
  id: string;
  category: 'separation' | 'completeness' | 'clarity' | 'compatibility';
  label: string;
  status: SettingsCheckStatus;
  detail: string;
};

function runSettingsValidationChecklist(formData: UpdateAgent): SettingsCheckResult[] {
  const results: SettingsCheckResult[] = [];
  const techKeywords = ["API", "endpoint", "database", "SQL", "function", "class", "JSON", "schema", "HTTP", "REST", "GraphQL", "SDK", "middleware", "backend", "frontend", "server", "deploy"];
  const imperativePatterns = /^(Must|Never|Always|Do not|Ensure|Verify|Reject|Deny)\b/;
  const guardrailLanguage = /\b(Never|Always|Under no circumstances|Absolutely)\b/i;
  const conditionalPatterns = /^(if|when|check that|validate|verify that|ensure that)\b/i;
  const crossRefPhrases = ["as mentioned above", "see above", "as noted in", "refer to", "as described in", "mentioned earlier"];
  const metaPhrases = ["this agent", "the agent should", "our agent", "my agent will"];

  const buc = formData.businessUseCase || "";
  const dk = formData.domainKnowledge || "";
  const vr = formData.validationRules || "";
  const gr = formData.guardrails || "";

  const textFields: { key: string; value: string }[] = [
    { key: "Business Use Case", value: buc },
    { key: "Domain Knowledge", value: dk },
    { key: "Validation Rules", value: vr },
    { key: "Guardrails", value: gr },
  ];

  // 1. Business Use Case - no technical details
  if (!buc.trim()) {
    results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "unable_to_verify", detail: "Business Use Case not provided" });
  } else {
    const foundTech = techKeywords.filter(kw => buc.toLowerCase().includes(kw.toLowerCase()));
    if (foundTech.length > 0) {
      results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "fail", detail: `Found technical terms: ${foundTech.join(", ")}` });
    } else {
      results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "pass", detail: "No technical details found" });
    }
  }

  // 2. Domain Knowledge - only facts, no rules
  if (!dk.trim()) {
    results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "unable_to_verify", detail: "Domain Knowledge not provided" });
  } else {
    const lines = dk.split("\n").filter(l => l.trim());
    const ruleLines = lines.filter(l => imperativePatterns.test(l.trim()));
    if (ruleLines.length > 0) {
      results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "fail", detail: `Found ${ruleLines.length} rule-like line(s): "${ruleLines[0].trim().substring(0, 50)}..."` });
    } else {
      results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "pass", detail: "No rule-like patterns found" });
    }
  }

  // 3. Validation Rules - no guardrail language
  if (!vr.trim()) {
    results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "unable_to_verify", detail: "Validation Rules not provided" });
  } else {
    if (guardrailLanguage.test(vr)) {
      results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "fail", detail: "Contains guardrail-like language that belongs in Guardrails" });
    } else {
      results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "pass", detail: "No guardrail-like language found" });
    }
  }

  // 4. Guardrails - no conditional logic
  if (!gr.trim()) {
    results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "unable_to_verify", detail: "Guardrails not provided" });
  } else {
    const gLines = gr.split("\n").filter(l => l.trim());
    const conditionalLines = gLines.filter(l => conditionalPatterns.test(l.trim()));
    if (conditionalLines.length > 0) {
      results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "fail", detail: "Contains conditional logic that belongs in Validation Rules" });
    } else {
      results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "pass", detail: "No conditional logic found" });
    }
  }

  // 5. Sample Data - no comments
  if (!formData.sampleDatasets || formData.sampleDatasets.length === 0) {
    results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "unable_to_verify", detail: "No sample data provided" });
  } else {
    const jsonDatasets = formData.sampleDatasets.filter(d => d.format === "json");
    const hasComments = jsonDatasets.some(d => /\/\/|\/\*|\*\//.test(d.content));
    if (hasComments) {
      results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "fail", detail: "JSON data contains comments (// or /* */)" });
    } else {
      results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "pass", detail: "No comments found in sample data" });
    }
  }

  // 6. Available Actions formatting
  if (!formData.availableActions || formData.availableActions.length === 0) {
    results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "unable_to_verify", detail: "No actions defined" });
  } else {
    const badActions = formData.availableActions.filter(a => !a.name || !a.description);
    if (badActions.length > 0) {
      results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "fail", detail: `${badActions.length} action(s) missing name or description` });
    } else {
      results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "pass", detail: "All actions have name and description" });
    }
  }

  // 7. Completeness - validation rules reference actions
  if (!vr.trim() || !formData.availableActions || formData.availableActions.length === 0) {
    results.push({ id: "comp-1", category: "completeness", label: "All validation rules reference available actions", status: "unable_to_verify", detail: "Validation Rules or Available Actions not provided" });
  } else {
    results.push({ id: "comp-1", category: "completeness", label: "All validation rules reference available actions", status: "pass", detail: "Both validation rules and actions are defined" });
  }

  // 8. Guardrails don't contradict validation rules
  if (!gr.trim() || !vr.trim()) {
    results.push({ id: "comp-2", category: "completeness", label: "Guardrails don't contradict Validation Rules", status: "unable_to_verify", detail: "Guardrails or Validation Rules not provided" });
  } else {
    results.push({ id: "comp-2", category: "completeness", label: "Guardrails don't contradict Validation Rules", status: "pass", detail: "Both fields are filled; no obvious contradictions detected" });
  }

  // 9. Sample Data covers domain terms
  if (!formData.sampleDatasets || formData.sampleDatasets.length === 0 || !dk.trim()) {
    results.push({ id: "comp-3", category: "completeness", label: "Sample Data covers key domain terms", status: "unable_to_verify", detail: "Sample Data or Domain Knowledge not provided" });
  } else {
    results.push({ id: "comp-3", category: "completeness", label: "Sample Data covers key domain terms", status: "pass", detail: "Both sample data and domain knowledge are present" });
  }

  // 10. No duplicate information
  const filledFields = textFields.filter(f => f.value.trim());
  if (filledFields.length < 2) {
    results.push({ id: "clar-1", category: "clarity", label: "No duplicate information across fields", status: "unable_to_verify", detail: "Fewer than 2 text fields are filled" });
  } else {
    let duplicateFound = "";
    outer: for (let i = 0; i < filledFields.length; i++) {
      const lines = filledFields[i].value.split("\n").map(l => l.trim()).filter(l => l.length > 20);
      for (let j = i + 1; j < filledFields.length; j++) {
        for (const line of lines) {
          if (filledFields[j].value.includes(line)) {
            duplicateFound = `"${line.substring(0, 40)}..." appears in both ${filledFields[i].key} and ${filledFields[j].key}`;
            break outer;
          }
        }
      }
    }
    if (duplicateFound) {
      results.push({ id: "clar-1", category: "clarity", label: "No duplicate information across fields", status: "fail", detail: duplicateFound });
    } else {
      results.push({ id: "clar-1", category: "clarity", label: "No duplicate information across fields", status: "pass", detail: "No duplicate lines detected" });
    }
  }

  // 11. Technical terms defined in Domain Knowledge
  if (!dk.trim()) {
    results.push({ id: "clar-2", category: "clarity", label: "Technical terms defined in Domain Knowledge before use elsewhere", status: "unable_to_verify", detail: "Domain Knowledge not provided" });
  } else {
    results.push({ id: "clar-2", category: "clarity", label: "Technical terms defined in Domain Knowledge before use elsewhere", status: "pass", detail: "Domain Knowledge is present" });
  }

  // 12. Action names clear
  if (!formData.availableActions || formData.availableActions.length === 0) {
    results.push({ id: "clar-3", category: "clarity", label: "Action names are clear and self-explanatory", status: "unable_to_verify", detail: "No actions defined" });
  } else {
    const unclear = formData.availableActions.filter(a => !a.name || a.name.length < 2 || !a.description);
    if (unclear.length > 0) {
      results.push({ id: "clar-3", category: "clarity", label: "Action names are clear and self-explanatory", status: "fail", detail: `${unclear.length} action(s) have short names or missing descriptions` });
    } else {
      results.push({ id: "clar-3", category: "clarity", label: "Action names are clear and self-explanatory", status: "pass", detail: "All action names are descriptive" });
    }
  }

  // 13. Each field understood on its own
  if (filledFields.length < 3) {
    results.push({ id: "compat-1", category: "compatibility", label: "Each field can be understood on its own", status: "unable_to_verify", detail: "Fewer than 3 fields are filled" });
  } else {
    results.push({ id: "compat-1", category: "compatibility", label: "Each field can be understood on its own", status: "pass", detail: "Sufficient fields are filled" });
  }

  // 14. No cross-references
  let crossRefField = "";
  for (const field of textFields) {
    if (!field.value.trim()) continue;
    const lower = field.value.toLowerCase();
    const found = crossRefPhrases.find(p => lower.includes(p));
    if (found) {
      crossRefField = `${field.key} contains "${found}"`;
      break;
    }
  }
  if (crossRefField) {
    results.push({ id: "compat-2", category: "compatibility", label: "No cross-references between fields", status: "fail", detail: crossRefField });
  } else {
    results.push({ id: "compat-2", category: "compatibility", label: "No cross-references between fields", status: "pass", detail: "No cross-references found" });
  }

  // 15. Consistent terminology
  if (filledFields.length < 2) {
    results.push({ id: "compat-3", category: "compatibility", label: "Consistent terminology across all fields", status: "unable_to_verify", detail: "Fewer than 2 text fields are filled" });
  } else {
    results.push({ id: "compat-3", category: "compatibility", label: "Consistent terminology across all fields", status: "pass", detail: "Multiple fields present for consistency" });
  }

  // 16. No meta-comments
  let metaField = "";
  for (const field of textFields) {
    if (!field.value.trim()) continue;
    const lower = field.value.toLowerCase();
    const found = metaPhrases.find(p => lower.includes(p));
    if (found) {
      metaField = `${field.key} contains "${found}"`;
      break;
    }
  }
  if (metaField) {
    results.push({ id: "compat-4", category: "compatibility", label: "No meta-comments about the agent itself", status: "fail", detail: metaField });
  } else {
    results.push({ id: "compat-4", category: "compatibility", label: "No meta-comments about the agent itself", status: "pass", detail: "No meta-comments found" });
  }

  return results;
}

function computeClientConfigHash(data: Partial<UpdateAgent>): string {
  const content = [
    data.businessUseCase || "",
    data.domainKnowledge || "",
    data.validationRules || "",
    data.guardrails || "",
  ].join("|||");
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function migrateLegacyPrompt(agent: Agent): SavedPrompt[] {
  const existing = agent.savedPrompts || [];
  if (existing.length > 0) return existing;
  if (!agent.customPrompt || !agent.customPrompt.trim()) return [];
  const clientHash = computeClientConfigHash({
    businessUseCase: agent.businessUseCase,
    domainKnowledge: agent.domainKnowledge,
    validationRules: agent.validationRules,
    guardrails: agent.guardrails,
  });
  return [{
    id: uuidv4(),
    name: "Initial Prompt",
    content: agent.customPrompt,
    isActive: true,
    source: agent.promptLastRevisedBy === "ai-generate" ? "ai" as const : "manual" as const,
    configHash: clientHash,
    createdAt: agent.promptGeneratedAt || agent.createdAt,
  }];
}

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<UpdateAgent | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"configuration" | "tracing" | "simulator">("configuration");

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", params.id],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleDataInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingSampleData, setIsUploadingSampleData] = useState(false);

  const [settingsCheckResults, setSettingsCheckResults] = useState<SettingsCheckResult[]>([]);
  const [showSettingsMistakesModal, setShowSettingsMistakesModal] = useState(false);

  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptName, setEditingPromptName] = useState("");
  const [showStalePromptDialog, setShowStalePromptDialog] = useState(false);
  const [pendingEnablePromptId, setPendingEnablePromptId] = useState<string | null>(null);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [viewingPrompt, setViewingPrompt] = useState<SavedPrompt | null>(null);
  const [inlineEditingNameId, setInlineEditingNameId] = useState<string | null>(null);
  const [inlineEditingNameValue, setInlineEditingNameValue] = useState("");

  const [isGeneratingValidation, setIsGeneratingValidation] = useState(false);
  const [isGeneratingGuardrails, setIsGeneratingGuardrails] = useState(false);
  const [isGeneratingSampleData, setIsGeneratingSampleData] = useState(false);
  const [isGeneratingActions, setIsGeneratingActions] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingWelcome, setIsGeneratingWelcome] = useState(false);
  const [sampleDataType, setSampleDataType] = useState("customer records");
  const [sampleRecordCount, setSampleRecordCount] = useState(10);
  const [sampleFormat, setSampleFormat] = useState<"json" | "csv" | "text">("json");
  const [viewingAction, setViewingAction] = useState<AgentAction | null>(null);
  const [viewingMockState, setViewingMockState] = useState<MockUserState | null>(null);
  const [viewingDataset, setViewingDataset] = useState<SampleDataset | null>(null);

  // Business Use Case extraction state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [showExtractionDetails, setShowExtractionDetails] = useState(false);

  // Guardrails conflict checking state
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<GuardrailConflict[]>([]);
  const [conflictSummary, setConflictSummary] = useState<ConflictCheckResult['summary'] | null>(null);
  const conflictCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Prompt outdated dialog state
  const [showPromptOutdatedDialog, setShowPromptOutdatedDialog] = useState(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<UpdateAgent | null>(null);

  // Sync from production state
  const [showSyncFromProdDialog, setShowSyncFromProdDialog] = useState(false);
  const [isSyncingFromProd, setIsSyncingFromProd] = useState(false);
  const [isLoadingSyncPreview, setIsLoadingSyncPreview] = useState(false);
  const [syncDifferences, setSyncDifferences] = useState<Array<{ field: string; label: string; devValue: string; prodValue: string }> | null>(null);

  // Push to production queue state
  const [isQueueingPush, setIsQueueingPush] = useState(false);

  // Regeneration safeguard state
  const [showRegenerationWarning, setShowRegenerationWarning] = useState(false);
  const [pendingRegenerateModel, setPendingRegenerateModel] = useState<GeminiModel | null>(null);

  // Clarifying chat dialog state
  const [showValidationChatDialog, setShowValidationChatDialog] = useState(false);
  const [showGuardrailsChatDialog, setShowGuardrailsChatDialog] = useState(false);
  const [isEvaluatingValidation, setIsEvaluatingValidation] = useState(false);
  const [isEvaluatingGuardrails, setIsEvaluatingGuardrails] = useState(false);
  const [validationInitialQuestion, setValidationInitialQuestion] = useState("");
  const [guardrailsInitialQuestion, setGuardrailsInitialQuestion] = useState("");

  // Actions editing state
  const [isAddActionDialogOpen, setIsAddActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null);
  const [showAvailableFields, setShowAvailableFields] = useState(false);
  const [actionFormData, setActionFormData] = useState<{
    name: string;
    description: string;
    category: string;
    confirmationMessage: string;
    successMessage: string;
    requiredFields: ActionField[];
  }>({
    name: "",
    description: "",
    category: "general",
    confirmationMessage: "",
    successMessage: "",
    requiredFields: [],
  });

  const computeCompletedSteps = (data: Partial<UpdateAgent>): Set<number> => {
    const completed = new Set<number>();
    if (data.name) completed.add(1);
    if (data.businessUseCase) completed.add(2);
    if (data.domainKnowledge || (data.domainDocuments && data.domainDocuments.length > 0)) completed.add(3);
    if (data.validationRules) completed.add(4);
    if (data.guardrails) completed.add(5);
    if (data.sampleDatasets && data.sampleDatasets.length > 0) completed.add(6);
    if (data.availableActions && data.availableActions.length > 0) completed.add(7);
    // Step 8 (Prompt) is auto-completed since prompt is AI-generated based on other steps
    if (data.businessUseCase) completed.add(8);
    if (data.customPrompt || (data.savedPrompts && data.savedPrompts.some(p => p.isActive))) completed.add(9);
    if (data.welcomeConfig?.enabled && data.welcomeConfig.greeting) completed.add(10);
    return completed;
  };

  useEffect(() => {
    if (agent && !formData) {
      const migratedSavedPrompts = migrateLegacyPrompt(agent);
      setFormData({
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
        sampleDatasets: agent.sampleDatasets || [],
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
        savedPrompts: migratedSavedPrompts,
        clarifyingInsights: agent.clarifyingInsights || [],
        availableActions: agent.availableActions || [],
        mockUserState: agent.mockUserState || [],
        mockMode: agent.mockMode || "full",
        status: agent.status,
        welcomeConfig: agent.welcomeConfig,
      });
      setEditedPrompt(agent.customPrompt || "");
      
      setCompletedSteps(computeCompletedSteps({
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
        sampleDatasets: agent.sampleDatasets || [],
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
        availableActions: agent.availableActions || [],
        welcomeConfig: agent.welcomeConfig,
      }));
    }
  }, [agent, formData]);

  const updateFormDataAndTrackCompletion = (updates: Partial<UpdateAgent>) => {
    setFormData((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      
      setCompletedSteps(computeCompletedSteps(updated));
      
      return updated;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formDataObj = new FormData();
        formDataObj.append('file', file);

        const response = await fetch('/api/upload-document', {
          method: 'POST',
          body: formDataObj,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to upload file');
        }

        const document: DomainDocument = await response.json();
        const currentDocs = formData?.domainDocuments || [];
        updateFormDataAndTrackCompletion({ domainDocuments: [...currentDocs, document] });

        toast({
          title: "Document uploaded",
          description: `${file.name} has been added to domain knowledge.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeDocument = (id: string) => {
    const currentDocs = formData?.domainDocuments || [];
    updateFormDataAndTrackCompletion({ domainDocuments: currentDocs.filter(doc => doc.id !== id) });
  };

  const handleUseValidationTemplate = () => {
    updateFormDataAndTrackCompletion({ validationRules: validationRulesTemplate });
  };

  const handleUseGuardrailsTemplate = () => {
    updateFormDataAndTrackCompletion({ guardrails: guardrailsTemplate });
  };

  const handleGenerateValidationRules = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please add a business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingValidation(true);
    try {
      const response = await apiRequest("POST", "/api/generate/validation-rules", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        model,
      });
      const result = await response.json();
      updateFormDataAndTrackCompletion({ validationRules: result.validationRules });
      toast({
        title: "Validation rules generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate validation rules.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingValidation(false);
    }
  };

  const handleGenerateGuardrails = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please add a business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingGuardrails(true);
    try {
      const response = await apiRequest("POST", "/api/generate/guardrails", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        model,
      });
      const result = await response.json();
      updateFormDataAndTrackCompletion({ guardrails: result.guardrails });
      toast({
        title: "Guardrails generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate guardrails.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingGuardrails(false);
    }
  };

  const handleSampleDataUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingSampleData(true);
    try {
      for (const file of Array.from(files)) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', file);

        const response = await fetch('/api/upload-sample-data', {
          method: 'POST',
          body: uploadFormData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to upload file');
        }

        const dataset: SampleDataset = await response.json();
        const currentDatasets = formData?.sampleDatasets || [];
        updateFormDataAndTrackCompletion({ sampleDatasets: [...currentDatasets, dataset] });
        toast({
          title: "File uploaded",
          description: `${file.name} has been added to sample datasets.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setIsUploadingSampleData(false);
      if (sampleDataInputRef.current) {
        sampleDataInputRef.current.value = '';
      }
    }
  };

  const removeSampleDataset = (id: string) => {
    const currentDatasets = formData?.sampleDatasets || [];
    updateFormDataAndTrackCompletion({ sampleDatasets: currentDatasets.filter(d => d.id !== id) });
  };

  const handleGenerateSampleData = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please add a business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSampleData(true);
    try {
      const response = await apiRequest("POST", "/api/generate/sample-data", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        dataType: sampleDataType,
        recordCount: sampleRecordCount,
        format: sampleFormat,
        model,
      });
      const dataset: SampleDataset = await response.json();
      const currentDatasets = formData?.sampleDatasets || [];
      updateFormDataAndTrackCompletion({ sampleDatasets: [...currentDatasets, dataset] });
      toast({
        title: "Sample data generated",
        description: `Generated ${sampleRecordCount} ${sampleDataType} records using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate sample data.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSampleData(false);
    }
  };

  const handleGenerateActions = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Missing information",
        description: "Please complete the Business Use Case step first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingActions(true);
    try {
      const response = await fetch('/api/generate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessUseCase: formData.businessUseCase,
          domainKnowledge: formData.domainKnowledge,
          domainDocuments: formData.domainDocuments,
          model,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate actions');
      }

      const result = await response.json();
      updateFormDataAndTrackCompletion({
        availableActions: result.actions,
        mockUserState: result.mockUserState,
      });

      toast({
        title: "Actions generated",
        description: `Generated ${result.actions.length} actions and ${result.mockUserState.length} mock profiles.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate actions",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingActions(false);
    }
  };

  const handleGeneratePromptWithSafeguard = (model: GeminiModel) => {
    if (!formData?.name || !formData?.businessUseCase?.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in the agent name and business use case before generating a prompt.",
        variant: "destructive",
      });
      return;
    }
    handleGeneratePrompt(model);
  };

  const handleGeneratePrompt = async (model: GeminiModel) => {
    if (!formData?.name || !formData?.businessUseCase?.trim()) {
      return;
    }
    setIsGeneratingPrompt(true);
    try {
      const response = await apiRequest("POST", "/api/generate/system-prompt", {
        name: formData.name,
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        validationRules: formData.validationRules,
        guardrails: formData.guardrails,
        sampleDatasets: formData.sampleDatasets,
        availableActions: formData.availableActions,
        model,
      });
      const result = await response.json();
      const currentHash = computeClientConfigHash(formData);
      const existingPrompts = formData.savedPrompts || [];
      const promptNumber = existingPrompts.filter(p => p.source === "ai").length + 1;
      const newPrompt: SavedPrompt = {
        id: uuidv4(),
        name: `AI Prompt #${promptNumber} (${geminiModelDisplayNames[model]})`,
        content: result.systemPrompt,
        isActive: existingPrompts.length === 0,
        source: "ai",
        model,
        configHash: currentHash,
        createdAt: new Date().toISOString(),
      };
      const updatedPrompts = existingPrompts.length === 0
        ? [newPrompt]
        : [...existingPrompts, newPrompt];
      const activePrompt = updatedPrompts.find(p => p.isActive);
      updateFormDataAndTrackCompletion({
        savedPrompts: updatedPrompts,
        customPrompt: activePrompt?.content || formData.customPrompt,
      });
      setEditedPrompt("");
      setIsEditingPrompt(false);
      setEditingPromptId(null);
      toast({
        title: "Prompt generated",
        description: `Created "${newPrompt.name}". ${existingPrompts.length === 0 ? "It has been set as the active prompt." : "You can enable it from the prompt library."}`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate prompt. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleEnablePrompt = (promptId: string) => {
    if (!formData) return;
    const prompts = formData.savedPrompts || [];
    const targetPrompt = prompts.find(p => p.id === promptId);
    if (!targetPrompt) return;
    const currentHash = computeClientConfigHash(formData);
    if (targetPrompt.configHash && targetPrompt.configHash !== currentHash && !targetPrompt.isActive) {
      setPendingEnablePromptId(promptId);
      setShowStalePromptDialog(true);
      return;
    }
    activatePrompt(promptId);
  };

  const activatePrompt = (promptId: string) => {
    if (!formData) return;
    const prompts = formData.savedPrompts || [];
    const updatedPrompts = prompts.map(p => ({
      ...p,
      isActive: p.id === promptId,
    }));
    const activePrompt = updatedPrompts.find(p => p.isActive);
    updateFormDataAndTrackCompletion({
      savedPrompts: updatedPrompts,
      customPrompt: activePrompt?.content || "",
    });
    toast({
      title: "Prompt enabled",
      description: `"${activePrompt?.name}" is now the active prompt.`,
    });
  };

  const handleDeletePrompt = (promptId: string) => {
    if (!formData) return;
    const prompts = formData.savedPrompts || [];
    const target = prompts.find(p => p.id === promptId);
    if (target?.isActive) {
      toast({
        title: "Cannot delete active prompt",
        description: "Please enable a different prompt first.",
        variant: "destructive",
      });
      return;
    }
    const updatedPrompts = prompts.filter(p => p.id !== promptId);
    updateFormDataAndTrackCompletion({ savedPrompts: updatedPrompts });
  };

  const handleStartEditPrompt = (prompt: SavedPrompt) => {
    setEditingPromptId(prompt.id);
    setEditedPrompt(prompt.content);
    setEditingPromptName(prompt.name);
    setIsEditingPrompt(true);
  };

  const handleSaveEditPrompt = () => {
    if (!formData || !editingPromptId) return;
    const prompts = formData.savedPrompts || [];
    const currentHash = computeClientConfigHash(formData);
    const updatedPrompts = prompts.map(p =>
      p.id === editingPromptId
        ? { ...p, content: editedPrompt, name: editingPromptName, configHash: currentHash, updatedAt: new Date().toISOString(), source: "manual" as const }
        : p
    );
    const activePrompt = updatedPrompts.find(p => p.isActive);
    updateFormDataAndTrackCompletion({
      savedPrompts: updatedPrompts,
      customPrompt: activePrompt?.content || formData.customPrompt,
    });
    setIsEditingPrompt(false);
    setEditingPromptId(null);
    setEditedPrompt("");
    toast({ title: "Prompt updated" });
  };

  const handleSaveAsNewPrompt = () => {
    if (!formData || !editingPromptId || !saveAsName.trim()) return;
    const currentHash = computeClientConfigHash(formData);
    const newPrompt: SavedPrompt = {
      id: uuidv4(),
      name: saveAsName.trim(),
      content: editedPrompt,
      isActive: false,
      source: "manual",
      configHash: currentHash,
      createdAt: new Date().toISOString(),
    };
    const prompts = formData.savedPrompts || [];
    updateFormDataAndTrackCompletion({
      savedPrompts: [...prompts, newPrompt],
    });
    setShowSaveAsDialog(false);
    setSaveAsName("");
    setIsEditingPrompt(false);
    setEditingPromptId(null);
    setEditedPrompt("");
    toast({ title: "Prompt saved", description: `"${newPrompt.name}" has been added to your prompt library.` });
  };

  const handleDuplicatePrompt = (prompt: SavedPrompt) => {
    if (!formData) return;
    const newPrompt: SavedPrompt = {
      id: uuidv4(),
      name: prompt.name + " (Copy)",
      content: prompt.content,
      isActive: false,
      source: prompt.source,
      model: prompt.model,
      configHash: prompt.configHash,
      createdAt: new Date().toISOString(),
    };
    const prompts = formData.savedPrompts || [];
    updateFormDataAndTrackCompletion({ savedPrompts: [...prompts, newPrompt] });
    toast({ title: "Prompt duplicated", description: `"${newPrompt.name}" has been added.` });
  };

  const handleInlineNameSave = (promptId: string) => {
    if (!formData || !inlineEditingNameValue.trim()) {
      setInlineEditingNameId(null);
      return;
    }
    const prompts = formData.savedPrompts || [];
    const updatedPrompts = prompts.map(p =>
      p.id === promptId ? { ...p, name: inlineEditingNameValue.trim() } : p
    );
    updateFormDataAndTrackCompletion({ savedPrompts: updatedPrompts });
    setInlineEditingNameId(null);
    setInlineEditingNameValue("");
  };

  const handleRemoveAction = (id: string) => {
    const current = formData?.availableActions || [];
    updateFormDataAndTrackCompletion({ availableActions: current.filter(a => a.id !== id) });
  };

  const handleRemoveMockState = (id: string) => {
    const current = formData?.mockUserState || [];
    updateFormDataAndTrackCompletion({ mockUserState: current.filter(s => s.id !== id) });
  };

  // Business Use Case extraction handler
  const handleExtractBusinessCase = async () => {
    if (!formData?.businessUseCase?.trim()) {
      toast({
        title: "Nothing to extract",
        description: "Please enter a business case first.",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    try {
      const response = await apiRequest("POST", "/api/extract-business-case", {
        businessCaseText: formData.businessUseCase,
      });
      const result: ExtractionResult = await response.json();
      
      if (result.success) {
        setExtractionResult(result);
        updateFormDataAndTrackCompletion({ businessUseCase: result.extractedContent });
        toast({
          title: "Content extracted",
          description: `Kept ${result.keepCategories.length} categories, removed ${result.discardedSummary.length} sections.`,
        });
      } else {
        toast({
          title: "Extraction failed",
          description: result.error || "Could not extract content.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Extraction failed",
        description: error?.message || "Failed to extract business case content.",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Guardrails conflict checking
  const checkForConflicts = async (guardrailsContent: string) => {
    if (!guardrailsContent || guardrailsContent.trim().length < 20) {
      setConflicts([]);
      setConflictSummary(null);
      return;
    }

    setIsCheckingConflicts(true);
    try {
      const response = await apiRequest("POST", "/api/validate/guardrail-conflicts", {
        guardrails: guardrailsContent,
      });
      const result: ConflictCheckResult = await response.json();
      setConflicts(result.conflicts);
      setConflictSummary(result.summary);
    } catch (error) {
      console.error("Failed to check conflicts:", error);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handleGuardrailsChange = (value: string) => {
    updateFormDataAndTrackCompletion({ guardrails: value });
    
    if (conflictCheckTimeoutRef.current) {
      clearTimeout(conflictCheckTimeoutRef.current);
    }
    conflictCheckTimeoutRef.current = setTimeout(() => {
      checkForConflicts(value);
    }, 1000);
  };

  // Update generation handlers to use clarifying chat
  const handleGenerateValidationRulesWithEval = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please add a business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsEvaluatingValidation(true);
    
    try {
      const evalResponse = await apiRequest("POST", "/api/generate/evaluate-context", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        generationType: "validation",
      });
      const evalResult = await evalResponse.json();

      if (!evalResult.hasEnoughContext && evalResult.initialQuestion) {
        setValidationInitialQuestion(evalResult.initialQuestion);
        setShowValidationChatDialog(true);
        setIsEvaluatingValidation(false);
        return;
      }

      setIsEvaluatingValidation(false);
      setIsGeneratingValidation(true);
      
      const response = await apiRequest("POST", "/api/generate/validation-rules", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        model,
      });
      const result = await response.json();
      updateFormDataAndTrackCompletion({ validationRules: result.validationRules });
      toast({
        title: "Validation rules generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate validation rules.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingValidation(false);
      setIsEvaluatingValidation(false);
    }
  };

  const handleValidationChatComplete = (insights: ClarifyingInsight[], generatedContent: string) => {
    const updatedInsights = [
      ...(formData?.clarifyingInsights || []),
      ...insights,
    ];
    updateFormDataAndTrackCompletion({ 
      validationRules: generatedContent,
      clarifyingInsights: updatedInsights,
    });
    toast({
      title: "Validation rules generated",
      description: "Generated with your additional context.",
    });
  };

  const handleGenerateGuardrailsWithEval = async (model: GeminiModel) => {
    if (!formData?.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please add a business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsEvaluatingGuardrails(true);

    try {
      const evalResponse = await apiRequest("POST", "/api/generate/evaluate-context", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        generationType: "guardrails",
      });
      const evalResult = await evalResponse.json();

      if (!evalResult.hasEnoughContext && evalResult.initialQuestion) {
        setGuardrailsInitialQuestion(evalResult.initialQuestion);
        setShowGuardrailsChatDialog(true);
        setIsEvaluatingGuardrails(false);
        return;
      }

      setIsEvaluatingGuardrails(false);
      setIsGeneratingGuardrails(true);

      const response = await apiRequest("POST", "/api/generate/guardrails", {
        businessUseCase: formData.businessUseCase,
        domainKnowledge: formData.domainKnowledge,
        domainDocuments: formData.domainDocuments,
        model,
      });
      const result = await response.json();
      updateFormDataAndTrackCompletion({ guardrails: result.guardrails });
      toast({
        title: "Guardrails generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
      setTimeout(() => checkForConflicts(result.guardrails), 100);
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate guardrails.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingGuardrails(false);
      setIsEvaluatingGuardrails(false);
    }
  };

  const handleGuardrailsChatComplete = (insights: ClarifyingInsight[], generatedContent: string) => {
    const updatedInsights = [
      ...(formData?.clarifyingInsights || []),
      ...insights,
    ];
    updateFormDataAndTrackCompletion({ 
      guardrails: generatedContent,
      clarifyingInsights: updatedInsights,
    });
    toast({
      title: "Guardrails generated",
      description: "Generated with your additional context.",
    });
    setTimeout(() => checkForConflicts(generatedContent), 100);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Warning</Badge>;
      default:
        return <Badge variant="secondary">Info</Badge>;
    }
  };

  // Action editing handlers
  const availableFields = extractFieldsFromSampleData(formData?.sampleDatasets || []);

  const resetActionForm = () => {
    setActionFormData({
      name: "",
      description: "",
      category: "general",
      confirmationMessage: "",
      successMessage: "",
      requiredFields: [],
    });
  };

  const openAddActionDialog = () => {
    resetActionForm();
    setEditingAction(null);
    setIsAddActionDialogOpen(true);
  };

  const openEditActionDialog = (action: AgentAction) => {
    setActionFormData({
      name: action.name,
      description: action.description,
      category: action.category,
      confirmationMessage: action.confirmationMessage || "",
      successMessage: action.successMessage || "",
      requiredFields: [...action.requiredFields],
    });
    setEditingAction(action);
    setIsAddActionDialogOpen(true);
  };

  const handleSaveAction = () => {
    if (!actionFormData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Action name is required",
        variant: "destructive",
      });
      return;
    }

    const invalidFields = actionFormData.requiredFields.filter(f => !f.name.trim() || !f.label.trim());
    if (invalidFields.length > 0) {
      toast({
        title: "Validation error",
        description: "All fields must have a name and label",
        variant: "destructive",
      });
      return;
    }

    const validatedFields = actionFormData.requiredFields.map(f => ({
      ...f,
      name: f.name.trim(),
      label: f.label.trim(),
    }));

    const current = formData?.availableActions || [];
    
    if (editingAction) {
      const updated = current.map(a => 
        a.id === editingAction.id 
          ? { 
              ...a, 
              name: actionFormData.name.trim(),
              description: actionFormData.description,
              category: actionFormData.category,
              confirmationMessage: actionFormData.confirmationMessage,
              successMessage: actionFormData.successMessage,
              requiredFields: validatedFields, 
              affectedDataFields: validatedFields.map(f => f.name) 
            }
          : a
      );
      updateFormDataAndTrackCompletion({ availableActions: updated });
      toast({ title: "Action updated", description: `"${actionFormData.name}" has been updated.` });
    } else {
      const newAction: AgentAction = {
        id: `action_${Date.now()}`,
        name: actionFormData.name.trim(),
        description: actionFormData.description,
        category: actionFormData.category,
        requiredFields: validatedFields,
        confirmationMessage: actionFormData.confirmationMessage,
        successMessage: actionFormData.successMessage,
        affectedDataFields: validatedFields.map(f => f.name),
      };
      updateFormDataAndTrackCompletion({ availableActions: [...current, newAction] });
      toast({ title: "Action added", description: `"${actionFormData.name}" has been added.` });
    }
    
    setIsAddActionDialogOpen(false);
    resetActionForm();
    setEditingAction(null);
  };

  const addActionField = () => {
    setActionFormData(prev => ({
      ...prev,
      requiredFields: [
        ...prev.requiredFields,
        { name: "", type: "string", label: "", required: true },
      ],
    }));
  };

  const updateActionField = (index: number, updates: Partial<ActionField>) => {
    setActionFormData(prev => ({
      ...prev,
      requiredFields: prev.requiredFields.map((f, i) => 
        i === index ? { ...f, ...updates } : f
      ),
    }));
  };

  const removeActionField = (index: number) => {
    setActionFormData(prev => ({
      ...prev,
      requiredFields: prev.requiredFields.filter((_, i) => i !== index),
    }));
  };

  const addFieldFromSampleData = (field: { name: string; type: string }) => {
    const existingField = actionFormData.requiredFields.find(f => f.name === field.name);
    if (existingField) {
      toast({
        title: "Field already exists",
        description: `"${field.name}" is already added to the action.`,
        variant: "destructive",
      });
      return;
    }
    
    setActionFormData(prev => ({
      ...prev,
      requiredFields: [
        ...prev.requiredFields,
        { 
          name: field.name, 
          type: field.type as ActionField["type"], 
          label: field.name.charAt(0).toUpperCase() + field.name.slice(1).replace(/([A-Z])/g, ' $1'),
          required: true 
        },
      ],
    }));
  };

  // Check for conflicts when guardrails are loaded
  useEffect(() => {
    if (formData?.guardrails && formData.guardrails.trim().length >= 20) {
      checkForConflicts(formData.guardrails);
    }
    return () => {
      if (conflictCheckTimeoutRef.current) {
        clearTimeout(conflictCheckTimeoutRef.current);
      }
    };
  }, [formData?.guardrails ? 'loaded' : 'none']);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateAgent) => {
      const response = await apiRequest("PATCH", `/api/agents/${params.id}`, data);
      return await response.json() as Agent;
    },
    onSuccess: (updatedAgent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id] });
      toast({
        title: "Settings saved",
        description: `${updatedAgent.name} has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/agents/${params.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Agent deleted",
        description: "The agent has been permanently deleted.",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete agent",
        variant: "destructive",
      });
    },
  });

  const configFields = ['businessUseCase', 'domainKnowledge', 'domainDocuments', 'validationRules', 'guardrails', 'sampleDatasets', 'availableActions', 'mockUserState'];

  const hasConfigChanged = (data: UpdateAgent): boolean => {
    if (!agent) return false;
    return configFields.some(field => {
      const newVal = (data as any)[field];
      const oldVal = (agent as any)[field];
      if (newVal === undefined) return false;
      return JSON.stringify(newVal) !== JSON.stringify(oldVal);
    });
  };

  const handleSave = () => {
    if (!formData) return;
    
    if (agent?.customPrompt && hasConfigChanged(formData)) {
      setPendingSaveData(formData);
      setShowPromptOutdatedDialog(true);
    } else {
      updateMutation.mutate(formData);
    }
  };

  const handleQueuePushToProd = async () => {
    if (!params.id || !agent) return;
    setIsQueueingPush(true);
    try {
      const response = await apiRequest("POST", "/api/admin/pending-sync", {
        type: "update",
        agentId: params.id,
        agentName: agent.name,
        updates: {
          name: agent.name,
          description: agent.description,
          status: agent.status,
          promptStyle: agent.promptStyle,
          mockMode: agent.mockMode,
          configurationStep: agent.configurationStep,
          businessUseCase: agent.businessUseCase,
          domainKnowledge: agent.domainKnowledge,
          validationRules: agent.validationRules,
          guardrails: agent.guardrails,
          customPrompt: agent.customPrompt,
          domainDocuments: agent.domainDocuments,
          sampleDatasets: agent.sampleDatasets,
          clarifyingInsights: agent.clarifyingInsights,
          availableActions: agent.availableActions,
          mockUserState: agent.mockUserState,
          welcomeConfig: agent.welcomeConfig,
        },
      });
      const result = await response.json();
      if (result.success) {
        toast({
          title: "Queued for production",
          description: `"${agent.name}" will be pushed to production on next publish. (${result.totalPending} pending)`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Queue failed",
        description: error.message || "Could not queue push to production.",
        variant: "destructive",
      });
    } finally {
      setIsQueueingPush(false);
    }
  };

  const handleSyncPreview = async () => {
    if (!params.id) return;
    setIsLoadingSyncPreview(true);
    setSyncDifferences(null);
    try {
      const response = await apiRequest("POST", "/api/admin/sync-preview", {
        agentId: params.id,
      });
      const result = await response.json();

      if (result.success) {
        setSyncDifferences(result.differences);
        setShowSyncFromProdDialog(true);
      }
    } catch (error: any) {
      toast({
        title: "Preview failed",
        description: error.message || "Could not compare with production. Make sure the production app is reachable.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSyncPreview(false);
    }
  };

  const handleSyncFromProd = async () => {
    if (!params.id) return;
    setIsSyncingFromProd(true);
    try {
      const response = await apiRequest("POST", "/api/admin/sync-from-prod", {
        agentId: params.id,
      });
      const result = await response.json();

      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id] });
        toast({
          title: "Synced from production",
          description: `"${result.agentName}" has been updated with the latest production settings.`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Sync failed",
        description: error.message || "Could not sync from production. Make sure the production app has the sync endpoint deployed.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingFromProd(false);
      setShowSyncFromProdDialog(false);
      setSyncDifferences(null);
    }
  };

  const handleSaveWithoutRegenerate = async () => {
    if (pendingSaveData) {
      try {
        await updateMutation.mutateAsync(pendingSaveData);
      } catch (e) {
      }
    }
    setShowPromptOutdatedDialog(false);
    setPendingSaveData(null);
  };

  const handleSaveAndRegenerate = async () => {
    if (!pendingSaveData) return;
    
    setIsRegeneratingPrompt(true);
    try {
      await updateMutation.mutateAsync(pendingSaveData);
      
      const mergedData = { ...agent, ...pendingSaveData };
      const response = await apiRequest("POST", "/api/generate/system-prompt", {
        name: mergedData.name,
        businessUseCase: mergedData.businessUseCase,
        domainKnowledge: mergedData.domainKnowledge,
        domainDocuments: mergedData.domainDocuments,
        validationRules: mergedData.validationRules,
        guardrails: mergedData.guardrails,
        sampleDatasets: mergedData.sampleDatasets,
        availableActions: mergedData.availableActions,
      });
      const result = await response.json();
      
      await apiRequest("PATCH", `/api/agents/${params.id}`, { customPrompt: result.systemPrompt });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id] });
      
      if (formData) {
        setFormData({ ...formData, customPrompt: result.systemPrompt });
      }
      setEditedPrompt(result.systemPrompt);
      
      toast({
        title: "Prompt regenerated",
        description: "The system prompt has been updated with your latest configuration changes.",
      });
    } catch (error: any) {
      toast({
        title: "Prompt regeneration failed",
        description: "Your settings were saved, but the prompt could not be regenerated. You can regenerate it manually in the Prompt section.",
        variant: "destructive",
      });
    } finally {
      setIsRegeneratingPrompt(false);
      setShowPromptOutdatedDialog(false);
      setPendingSaveData(null);
    }
  };

  const handleNextStep = () => {
    if (currentStep < settingsSteps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background p-4">
          <div className="container mx-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="flex gap-8">
            <div className="w-64 shrink-0">
              <Skeleton className="h-80 w-full" />
            </div>
            <div className="flex-1">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-60" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!agent || !formData) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-semibold mb-2">Agent not found</h2>
        <p className="text-muted-foreground mb-4">The agent you're looking for doesn't exist.</p>
        <Button onClick={() => navigate("/")} data-testid="button-go-home">
          Go Home
        </Button>
      </div>
    );
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                General
              </CardTitle>
              <CardDescription>
                Basic agent information and status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  value={formData.name || ""}
                  onChange={(e) => updateFormDataAndTrackCompletion({ name: e.target.value })}
                  className="mt-2"
                  data-testid="input-name"
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => updateFormDataAndTrackCompletion({ status: value as AgentStatus })}
                >
                  <SelectTrigger className="mt-2" data-testid="select-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="configured">Configured</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t">
                <Label>Production Sync</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Sync agent configuration between dev and production environments.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncPreview}
                    disabled={isSyncingFromProd || isLoadingSyncPreview}
                    data-testid="button-sync-from-prod"
                  >
                    {isLoadingSyncPreview ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CloudDownload className="h-4 w-4 mr-2" />
                    )}
                    {isLoadingSyncPreview ? "Comparing..." : "Pull from Prod"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleQueuePushToProd}
                    disabled={isQueueingPush}
                    data-testid="button-queue-push-to-prod"
                  >
                    {isQueueingPush ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    {isQueueingPush ? "Queuing..." : "Queue Push to Prod"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 2:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Business Use Case
              </CardTitle>
              <CardDescription>
                Define the problem this agent solves. Be specific about the use case and target users.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <Label htmlFor="businessUseCase">What problem does this agent solve?</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          updateFormDataAndTrackCompletion({ businessUseCase: businessUseCaseTemplate });
                          setExtractionResult(null);
                        }}
                        data-testid="settings-button-use-template-usecase"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExtractBusinessCase}
                        disabled={isExtracting || !formData.businessUseCase?.trim()}
                        data-testid="settings-button-extract-content"
                      >
                        {isExtracting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          <>
                            <Filter className="h-4 w-4 mr-2" />
                            Extract Key Info
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="businessUseCase"
                    value={formData.businessUseCase || ""}
                    onChange={(e) => {
                      updateFormDataAndTrackCompletion({ businessUseCase: e.target.value });
                      setExtractionResult(null);
                    }}
                    className="min-h-[270px] resize-y"
                    placeholder="e.g., This agent helps customer support teams quickly answer product-related questions by accessing our knowledge base and providing accurate, helpful responses..."
                    data-testid="textarea-business-usecase"
                  />
                  
                  {extractionResult && extractionResult.success && (
                    <div className="mt-3 p-3 bg-muted rounded-md border">
                      <button
                        onClick={() => setShowExtractionDetails(!showExtractionDetails)}
                        className="flex items-center gap-2 text-sm font-medium w-full text-left"
                        data-testid="settings-button-toggle-extraction-details"
                      >
                        {showExtractionDetails ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        Extraction Summary
                        <Badge variant="secondary" className="ml-auto">
                          {extractionResult.discardedSummary.length} removed
                        </Badge>
                      </button>
                      
                      {showExtractionDetails && (
                        <div className="mt-3 space-y-3 text-sm">
                          {extractionResult.keepCategories.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Kept:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extractionResult.keepCategories.map((cat, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {cat}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {extractionResult.discardedSummary.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Removed:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {extractionResult.discardedSummary.map((item, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {item}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground">
                  Tip: If you paste a full business case document, click "Extract Key Info" to automatically 
                  remove ROI calculations, metrics, and implementation details - keeping only what's needed 
                  for the agent's behavior.
                </p>
              </div>
            </CardContent>
          </Card>
        );

      case 3:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Domain Knowledge
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Knowledge base and reference documents for the agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="domainKnowledge">Knowledge Base</Label>
                <Textarea
                  id="domainKnowledge"
                  value={formData.domainKnowledge || ""}
                  onChange={(e) => updateFormDataAndTrackCompletion({ domainKnowledge: e.target.value })}
                  className="mt-2 min-h-[270px] resize-y"
                  placeholder="Add domain knowledge..."
                  data-testid="textarea-domain-knowledge"
                />
              </div>

              <div className="border-t pt-4">
                <Label>Uploaded Documents</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Upload text files (.txt, .md, .csv, .json) up to 5MB each
                </p>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2"
                  data-testid="button-upload-document"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading ? "Uploading..." : "Choose Files"}
                </Button>

                {formData.domainDocuments && formData.domainDocuments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {formData.domainDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2"
                        data-testid={`document-${doc.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <span className="text-sm truncate">{doc.filename}</span>
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(doc.content.length / 1000)}k chars
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDocument(doc.id)}
                          className="h-7 w-7 flex-shrink-0"
                          data-testid={`button-remove-document-${doc.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 4:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Validation Rules
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Define input/output validation requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">What are validation rules?</p>
                    <p className="text-sm text-muted-foreground">
                      Validation rules help ensure your agent processes data correctly and provides accurate responses. Define rules for input formats, required fields, and response constraints.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Label htmlFor="validationRules">Validation Configuration</Label>
                      <span className="text-xs text-muted-foreground" data-testid="settings-validation-model-info">
                        AI model used: {geminiModelDisplayNames[defaultGenerationModel]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseValidationTemplate}
                        className="text-sm text-primary hover:underline"
                        data-testid="settings-button-use-template-validation"
                      >
                        Use Template
                      </button>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isGeneratingValidation}
                              data-testid="settings-button-generate-validation"
                            >
                              {isGeneratingValidation ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1" />
                              )}
                              Generate
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                              <DropdownMenuItem
                                key={model}
                                onClick={() => handleGenerateValidationRules(model)}
                                data-testid={`settings-menu-item-validation-model-${model}`}
                              >
                                {geminiModelDisplayNames[model]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <Textarea
                    id="validationRules"
                    value={formData.validationRules || ""}
                    onChange={(e) => updateFormDataAndTrackCompletion({ validationRules: e.target.value })}
                    className="min-h-[270px] resize-y font-mono text-sm"
                    placeholder="Add validation rules to ensure data quality (Markdown or YAML format)..."
                    data-testid="textarea-validation-rules"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional: Add validation rules to ensure data quality (Markdown or YAML format)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      case 5:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Guardrails
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Set safety boundaries and content restrictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Why are guardrails important?</p>
                    <p className="text-sm text-muted-foreground">
                      Guardrails protect your brand by preventing inappropriate responses, ensuring compliance, and maintaining consistent behavior even in edge cases.
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Label htmlFor="guardrails">Guardrails Configuration</Label>
                      <span className="text-xs text-muted-foreground" data-testid="settings-guardrails-model-info">
                        AI model used: {geminiModelDisplayNames[defaultGenerationModel]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseGuardrailsTemplate}
                        className="text-sm text-primary hover:underline"
                        data-testid="settings-button-use-template-guardrails"
                      >
                        Use Template
                      </button>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isGeneratingGuardrails || isEvaluatingGuardrails}
                              data-testid="settings-button-generate-guardrails"
                            >
                              {isGeneratingGuardrails || isEvaluatingGuardrails ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4 mr-1" />
                              )}
                              Generate
                              <ChevronDown className="h-3 w-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                              <DropdownMenuItem
                                key={model}
                                onClick={() => handleGenerateGuardrailsWithEval(model)}
                                data-testid={`settings-menu-item-guardrails-model-${model}`}
                              >
                                {geminiModelDisplayNames[model]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                  <Textarea
                    id="guardrails"
                    value={formData.guardrails || ""}
                    onChange={(e) => handleGuardrailsChange(e.target.value)}
                    className="min-h-[270px] resize-y font-mono text-sm"
                    placeholder="Define what your agent should NOT do (Markdown or YAML format)..."
                    data-testid="textarea-guardrails"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional: Define what your agent should NOT do (Markdown or YAML format)
                  </p>
                </div>
                
                {(isCheckingConflicts || conflicts.length > 0) && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Conflict Analysis</span>
                      {isCheckingConflicts && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                      {conflictSummary && !isCheckingConflicts && (
                        <div className="flex gap-2 ml-auto">
                          {conflictSummary.errors > 0 && (
                            <Badge variant="destructive">{conflictSummary.errors} errors</Badge>
                          )}
                          {conflictSummary.warnings > 0 && (
                            <Badge className="bg-yellow-500">{conflictSummary.warnings} warnings</Badge>
                          )}
                          {conflictSummary.info > 0 && (
                            <Badge variant="secondary">{conflictSummary.info} info</Badge>
                          )}
                          {conflictSummary.errors === 0 && conflictSummary.warnings === 0 && conflictSummary.info === 0 && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <Check className="h-3 w-3 mr-1" />
                              No conflicts
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {conflicts.length > 0 && (
                      <div className="space-y-2">
                        {conflicts.map((conflict, index) => (
                          <div
                            key={index}
                            className="p-3 rounded-md border bg-muted/30 space-y-2"
                            data-testid={`settings-conflict-item-${index}`}
                          >
                            <div className="flex items-start gap-2">
                              {getSeverityIcon(conflict.severity)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getSeverityBadge(conflict.severity)}
                                  <span className="text-sm font-medium">{conflict.type}</span>
                                  {conflict.topic && (
                                    <Badge variant="outline" className="text-xs">{conflict.topic}</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {conflict.suggestion}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="p-2 bg-background rounded border">
                                <span className="text-muted-foreground">Guardrail:</span>
                                <p className="mt-0.5">{conflict.guardrailRule}</p>
                              </div>
                              <div className="p-2 bg-background rounded border">
                                <span className="text-muted-foreground">Related rule:</span>
                                <p className="mt-0.5">{conflict.recoveryRule}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 6:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Sample Data
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Upload or generate sample data for your chatbot to reference
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">What is sample data?</p>
                    <p className="text-sm text-muted-foreground">
                      Sample data helps your chatbot understand the structure and format of data it might encounter.
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Upload Sample Data</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Upload CSV, JSON, or text files
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          ref={sampleDataInputRef}
                          type="file"
                          accept=".csv,.json,.txt"
                          onChange={handleSampleDataUpload}
                          className="hidden"
                          multiple
                          data-testid="settings-input-upload-sample-data"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => sampleDataInputRef.current?.click()}
                          disabled={isUploadingSampleData}
                          className="w-full"
                          data-testid="settings-button-upload-sample-data"
                        >
                          {isUploadingSampleData ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          {isUploadingSampleData ? "Uploading..." : "Upload File"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Generate with AI</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Let Gemini create sample data based on your use case
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="settings-dataDescription" className="text-xs">Describe the data you need</Label>
                      <Textarea
                        id="settings-dataDescription"
                        value={sampleDataType}
                        onChange={(e) => setSampleDataType(e.target.value)}
                        placeholder="Describe the sample data you need, e.g.: Generate 10 customer records with names, emails, order IDs, products, and order status. Include a mix of delivered, shipped, and processing orders."
                        className="mt-1 min-h-[120px] resize-y"
                        data-testid="settings-textarea-data-description"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="settings-recordCount" className="text-xs">Records</Label>
                        <Input
                          id="settings-recordCount"
                          type="number"
                          min={1}
                          max={100}
                          value={sampleRecordCount}
                          onChange={(e) => setSampleRecordCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))}
                          className="mt-1"
                          data-testid="settings-input-record-count"
                        />
                      </div>
                      <div>
                        <Label htmlFor="settings-format" className="text-xs">Format</Label>
                        <select
                          id="settings-format"
                          value={sampleFormat}
                          onChange={(e) => setSampleFormat(e.target.value as "json" | "csv" | "text")}
                          className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                          data-testid="settings-select-format"
                        >
                          <option value="json">JSON</option>
                          <option value="csv">CSV</option>
                          <option value="text">Text</option>
                        </select>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="default"
                          disabled={isGeneratingSampleData}
                          className="w-full"
                          data-testid="settings-button-generate-sample-data"
                        >
                          {isGeneratingSampleData ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          {isGeneratingSampleData ? "Generating..." : "Generate Sample Data"}
                          <ChevronDown className="h-3 w-3 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                          <DropdownMenuItem
                            key={model}
                            onClick={() => handleGenerateSampleData(model)}
                            data-testid={`settings-menu-item-sample-data-model-${model}`}
                          >
                            {geminiModelDisplayNames[model]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {(formData.sampleDatasets?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Uploaded Datasets ({formData.sampleDatasets?.length})</Label>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {formData.sampleDatasets?.map((dataset) => (
                        <div
                          key={dataset.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                          data-testid={`settings-sample-dataset-${dataset.id}`}
                        >
                          <FileText className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{dataset.name}</p>
                              <Badge variant="outline" className="text-xs">
                                {dataset.format.toUpperCase()}
                              </Badge>
                              {dataset.isGenerated && (
                                <Badge variant="secondary" className="text-xs">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {dataset.description || `Added ${new Date(dataset.createdAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setViewingDataset(dataset)}
                              className="h-8 w-8"
                              data-testid={`settings-button-view-dataset-${dataset.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeSampleDataset(dataset.id)}
                              className="h-8 w-8"
                              data-testid={`settings-button-remove-dataset-${dataset.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <Dialog open={viewingDataset !== null} onOpenChange={(open) => !open && setViewingDataset(null)}>
                  <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="settings-dialog-dataset-viewer">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {viewingDataset?.name}
                        <Badge variant="outline">{viewingDataset?.format.toUpperCase()}</Badge>
                        {viewingDataset?.isGenerated && (
                          <Badge variant="secondary">
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Generated
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        {viewingDataset?.description || "Sample data content"}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="overflow-auto max-h-[60vh] rounded-lg border bg-muted/30">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                        {viewingDataset?.content}
                      </pre>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        );

      case 7:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Available Actions
              </CardTitle>
              <CardDescription>
                Define what actions your agent can simulate. These allow the agent to "fake" performing actions like updating policies, adding dependents, or submitting requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  Generate actions based on your business use case
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openAddActionDialog}
                    data-testid="settings-button-add-action"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Action
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="default"
                        disabled={isGeneratingActions}
                        data-testid="settings-button-generate-actions"
                      >
                        {isGeneratingActions ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        {isGeneratingActions ? "Generating..." : "Generate Actions"}
                        <ChevronDown className="h-3 w-3 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => handleGenerateActions(model)}
                          data-testid={`settings-menu-item-actions-model-${model}`}
                        >
                          {geminiModelDisplayNames[model]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Mock Mode
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {mockModeDescriptions[formData.mockMode || "full"]}
                    </p>
                  </div>
                  <RadioGroup
                    value={formData.mockMode || "full"}
                    onValueChange={(value: MockMode) => updateFormDataAndTrackCompletion({ mockMode: value })}
                    className="flex gap-2"
                    data-testid="settings-radio-mock-mode"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="full" id="settings-mock-full" data-testid="settings-radio-mock-full" />
                      <Label htmlFor="settings-mock-full" className="text-sm cursor-pointer">Full Mock</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="read_only" id="settings-mock-readonly" data-testid="settings-radio-mock-readonly" />
                      <Label htmlFor="settings-mock-readonly" className="text-sm cursor-pointer">Read-Only</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="disabled" id="settings-mock-disabled" data-testid="settings-radio-mock-disabled" />
                      <Label htmlFor="settings-mock-disabled" className="text-sm cursor-pointer">Disabled</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Full Mock:</strong> Agent simulates all actions locally using mock data. No API calls are made.</p>
                  <p><strong>Read-Only:</strong> Agent can read real data but simulates write operations locally.</p>
                  <p><strong>Disabled:</strong> Agent uses real API calls (requires actual backend integration).</p>
                </div>
              </div>

              {(formData.availableActions?.length || 0) > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Actions ({formData.availableActions?.length})
                  </Label>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {formData.availableActions?.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        data-testid={`settings-action-item-${action.id}`}
                      >
                        <Zap className="h-4 w-4 mt-1 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{action.name}</p>
                            <Badge variant="outline" className="text-xs">
                              {action.category}
                            </Badge>
                            {action.requiredFields.length > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {action.requiredFields.length} fields
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {action.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingAction(action)}
                            data-testid={`settings-button-view-action-${action.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditActionDialog(action)}
                            data-testid={`settings-button-edit-action-${action.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAction(action.id)}
                            data-testid={`settings-button-remove-action-${action.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(formData.mockUserState?.length || 0) > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Mock User Profiles ({formData.mockUserState?.length})
                  </Label>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {formData.mockUserState?.map((state) => (
                      <div
                        key={state.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        data-testid={`settings-mock-state-item-${state.id}`}
                      >
                        <User className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{state.name}</p>
                            {state.isGenerated && (
                              <Badge variant="secondary" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI Generated
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {Object.keys(state.fields).length} fields
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingMockState(state)}
                            data-testid={`settings-button-view-mock-state-${state.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveMockState(state.id)}
                            data-testid={`settings-button-remove-mock-state-${state.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(formData.availableActions?.length || 0) === 0 && (formData.mockUserState?.length || 0) === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No actions defined yet</p>
                  <p className="text-xs mt-1">Click "Generate Actions" to create actions based on your use case</p>
                </div>
              )}

              <Dialog open={viewingAction !== null} onOpenChange={(open) => !open && setViewingAction(null)}>
                <DialogContent className="max-w-2xl" data-testid="settings-dialog-action-viewer">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2" data-testid="settings-text-action-name">
                      <Zap className="h-5 w-5 text-primary" />
                      {viewingAction?.name}
                      <Badge variant="outline" className="ml-2">
                        {viewingAction?.category}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription data-testid="settings-text-action-description">
                      {viewingAction?.description}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {viewingAction?.requiredFields && viewingAction.requiredFields.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium">Required Fields</Label>
                        <div className="mt-2 space-y-2">
                          {viewingAction.requiredFields.map((field, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                              <Badge variant="outline">{field.type}</Badge>
                              <span className="font-medium">{field.label}</span>
                              {field.required && <Badge variant="secondary">Required</Badge>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {viewingAction?.confirmationMessage && (
                      <div>
                        <Label className="text-sm font-medium">Confirmation Message</Label>
                        <p className="text-sm text-muted-foreground mt-1">{viewingAction.confirmationMessage}</p>
                      </div>
                    )}
                    {viewingAction?.successMessage && (
                      <div>
                        <Label className="text-sm font-medium">Success Message</Label>
                        <p className="text-sm text-muted-foreground mt-1">{viewingAction.successMessage}</p>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={viewingMockState !== null} onOpenChange={(open) => !open && setViewingMockState(null)}>
                <DialogContent className="max-w-2xl" data-testid="settings-dialog-mock-state-viewer">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2" data-testid="settings-text-mock-state-name">
                      <User className="h-5 w-5" />
                      {viewingMockState?.name}
                    </DialogTitle>
                    <DialogDescription data-testid="settings-text-mock-state-description">
                      {viewingMockState?.description}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="overflow-auto max-h-[400px]">
                    <pre className="p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(viewingMockState?.fields || {}, null, 2)}
                    </pre>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        );

      case 8: {
        const techKw = ["API", "endpoint", "database", "SQL", "function", "class", "JSON", "schema", "HTTP", "REST", "GraphQL", "SDK", "middleware", "backend", "frontend", "server", "deploy"];
        const imperPat = /^(Must|Never|Always|Do not|Ensure|Verify|Reject|Deny)\b/;
        const guardrailLangRe = /\b(Never|Always|Under no circumstances|Absolutely)\b/i;
        const condPat = /^(if|when|check that|validate|verify that|ensure that)\b/i;
        const crossRefPh = ["as mentioned above", "see above", "as noted in", "refer to", "as described in", "mentioned earlier"];
        const metaPh = ["this agent", "the agent should", "our agent", "my agent will"];

        const runChecks = () => {
          setSettingsCheckResults(runSettingsValidationChecklist(formData));
        };

        if (settingsCheckResults.length === 0) {
          setTimeout(() => setSettingsCheckResults(runSettingsValidationChecklist(formData)), 0);
        }

        const sFail = settingsCheckResults.filter(r => r.status === "fail").length;
        const sPass = settingsCheckResults.filter(r => r.status === "pass").length;
        const sUnverified = settingsCheckResults.filter(r => r.status === "unable_to_verify").length;
        const sAllPass = sFail === 0 && sUnverified === 0 && sPass > 0;
        const sAllUnverified = sPass === 0 && sFail === 0 && sUnverified > 0;

        const handleSettingsAutoFix = () => {
          const updates: Partial<UpdateAgent> = {};
          const buc = formData.businessUseCase || "";
          const dk = formData.domainKnowledge || "";
          const vrVal = formData.validationRules || "";
          const grVal = formData.guardrails || "";

          if (buc.trim()) {
            const lines = buc.split("\n");
            const filtered = lines.filter(line => {
              const lower = line.toLowerCase();
              return !techKw.some(kw => lower.includes(kw.toLowerCase()));
            });
            if (filtered.length !== lines.length) {
              updates.businessUseCase = filtered.join("\n");
            }
          }

          if (dk.trim()) {
            const lines = dk.split("\n");
            const ruleLines: string[] = [];
            const kept: string[] = [];
            for (const line of lines) {
              if (imperPat.test(line.trim())) {
                ruleLines.push(line);
              } else {
                kept.push(line);
              }
            }
            if (ruleLines.length > 0) {
              updates.domainKnowledge = kept.join("\n");
              updates.validationRules = (vrVal ? vrVal + "\n" : "") + ruleLines.join("\n");
            }
          }

          const currentVR = updates.validationRules ?? vrVal;
          if (currentVR.trim()) {
            const lines = currentVR.split("\n");
            const guardrailLines: string[] = [];
            const kept: string[] = [];
            for (const line of lines) {
              if (guardrailLangRe.test(line.trim())) {
                guardrailLines.push(line);
              } else {
                kept.push(line);
              }
            }
            if (guardrailLines.length > 0) {
              updates.validationRules = kept.join("\n");
              updates.guardrails = (grVal ? grVal + "\n" : "") + guardrailLines.join("\n");
            }
          }

          const currentGR = updates.guardrails ?? grVal;
          if (currentGR.trim()) {
            const lines = currentGR.split("\n");
            const condLines: string[] = [];
            const kept: string[] = [];
            for (const line of lines) {
              if (condPat.test(line.trim())) {
                condLines.push(line);
              } else {
                kept.push(line);
              }
            }
            if (condLines.length > 0) {
              updates.guardrails = kept.join("\n");
              const vr2 = updates.validationRules ?? vrVal;
              updates.validationRules = (vr2 ? vr2 + "\n" : "") + condLines.join("\n");
            }
          }

          const allTextKeys: (keyof UpdateAgent)[] = ["businessUseCase", "domainKnowledge", "validationRules", "guardrails"];
          for (const key of allTextKeys) {
            let val = (updates[key] as string) ?? (formData[key] as string) ?? "";
            if (!val.trim()) continue;
            let changed = false;
            for (const phrase of crossRefPh) {
              const re = new RegExp(phrase, "gi");
              if (re.test(val)) {
                val = val.replace(re, "");
                changed = true;
              }
            }
            if (changed) {
              (updates as any)[key] = val;
            }
          }

          for (const key of allTextKeys) {
            let val = (updates[key] as string) ?? (formData[key] as string) ?? "";
            if (!val.trim()) continue;
            const lines = val.split("\n");
            const filtered = lines.filter(line => {
              const lower = line.toLowerCase();
              return !metaPh.some(p => lower.includes(p));
            });
            if (filtered.length !== lines.length) {
              (updates as any)[key] = filtered.join("\n");
            }
          }

          if (Object.keys(updates).length > 0) {
            updateFormDataAndTrackCompletion(updates);
            toast({
              title: "Auto-fix applied!",
              description: "Review the changes in previous steps.",
            });
          }

          setTimeout(() => {
            setSettingsCheckResults(runSettingsValidationChecklist({ ...formData, ...updates }));
          }, 100);
        };

        const sCategoryLabels: Record<string, string> = {
          separation: "Separation of Concerns",
          completeness: "Completeness",
          clarity: "Clarity",
          compatibility: "Wizard Compatibility",
        };

        const sCategories: Array<'separation' | 'completeness' | 'clarity' | 'compatibility'> = ["separation", "completeness", "clarity", "compatibility"];

        const getSettingsStatusIcon = (status: SettingsCheckStatus) => {
          switch (status) {
            case "pass":
              return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />;
            case "fail":
              return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />;
            case "unable_to_verify":
              return <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />;
          }
        };

        return (
          <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-primary" />
                    Validation Checklist
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Review the quality and consistency of your agent configuration before finalizing.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowSettingsMistakesModal(true)} data-testid="settings-button-common-mistakes">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Common Mistakes to Avoid
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {sAllPass && (
                  <div className="flex items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3" data-testid="settings-alert-all-pass">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-300">All checks passed!</span>
                  </div>
                )}
                {sFail > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3" data-testid="settings-alert-issues-found">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{sFail} issue{sFail !== 1 ? "s" : ""} found. Would you like to try to fix these automatically?</span>
                      <div>
                        <Button size="sm" variant="outline" onClick={handleSettingsAutoFix} data-testid="settings-button-auto-fix">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Auto-Fix Issues
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {sAllUnverified && (
                  <div className="flex items-center gap-2 rounded-md border p-3" data-testid="settings-alert-all-unverified">
                    <Info className="h-5 w-5 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">Fill in more fields in the previous steps for validation checks to work.</span>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={runChecks} data-testid="settings-button-rerun-checks">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Re-run Checks
                  </Button>
                </div>

                {sCategories.map(cat => {
                  const catResults = settingsCheckResults.filter(r => r.category === cat);
                  if (catResults.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-2">
                      <h3 className="text-sm font-semibold">{sCategoryLabels[cat]}</h3>
                      <div className="space-y-1.5">
                        {catResults.map(result => (
                          <div key={result.id} className="flex items-start gap-2 text-sm py-1" data-testid={`settings-check-result-${result.id}`}>
                            {getSettingsStatusIcon(result.status)}
                            <div className="min-w-0">
                              <span className={result.status === "fail" ? "font-medium" : ""}>{result.label}</span>
                              {result.status === "unable_to_verify" && (
                                <Badge variant="secondary" className="ml-2 text-xs">Unable to verify</Badge>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">{result.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Dialog open={showSettingsMistakesModal} onOpenChange={setShowSettingsMistakesModal}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Common Mistakes to Avoid
                </DialogTitle>
                <DialogDescription>
                  Learn how to structure your agent configuration correctly by avoiding these common pitfalls.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 mt-4 text-sm">
                <div className="space-y-3">
                  <h3 className="font-semibold text-destructive">Mistake 1: Mixing Strategy with Function</h3>
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Bad (in Business Use Case):</p>
                      <p className="text-xs text-muted-foreground italic">"This agent is valuable as a proof point for our platform. It demonstrates multi-system orchestration."</p>
                    </div>
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Good:</p>
                      <p className="text-xs text-muted-foreground italic">"Help frontline managers handle employee call-ins through coordinated updates across scheduling, payroll, and accrual systems."</p>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why:</span> Users care about what the agent does, not why you built it.</p>
                  </div>
                </div>

                <hr />

                <div className="space-y-3">
                  <h3 className="font-semibold text-destructive">Mistake 2: Putting Rules in Domain Knowledge</h3>
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Bad (in Domain Knowledge):</p>
                      <p className="text-xs text-muted-foreground italic">"Accrual balances can never go negative without manager approval."</p>
                    </div>
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Good (in Guardrails):</p>
                      <p className="text-xs text-muted-foreground italic"><span className="font-medium">Never:</span> Overdraft accrual balances without explicit manager confirmation</p>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why:</span> Domain Knowledge explains concepts; Guardrails set boundaries.</p>
                  </div>
                </div>

                <hr />

                <div className="space-y-3">
                  <h3 className="font-semibold text-destructive">Mistake 3: Putting Definitions in Validation Rules</h3>
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Bad (in Validation Rules):</p>
                      <p className="text-xs text-muted-foreground italic">"Employees have PTO and sick leave balances tracked separately."</p>
                    </div>
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Good (in Domain Knowledge):</p>
                      <p className="text-xs text-muted-foreground italic">"PTO and sick leave are tracked separately with independent balances."</p>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why:</span> Validation Rules check conditions; Domain Knowledge explains how things work.</p>
                  </div>
                </div>

                <hr />

                <div className="space-y-3">
                  <h3 className="font-semibold text-destructive">Mistake 4: Conditional Logic in Guardrails</h3>
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Bad (in Guardrails):</p>
                      <p className="text-xs text-muted-foreground italic">"If the employee name is ambiguous, ask a clarifying question."</p>
                    </div>
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Good (in Validation Rules):</p>
                      <p className="text-xs text-muted-foreground italic"><span className="font-medium">Employee Identity Verification:</span> If the employee name provided does not exactly match one employee record, ask a clarifying question...</p>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why:</span> Guardrails are absolute rules; Validation Rules handle conditional logic.</p>
                  </div>
                </div>

                <hr />

                <div className="space-y-3">
                  <h3 className="font-semibold text-destructive">Mistake 5: Comments in Sample Data</h3>
                  <div className="space-y-2">
                    <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Bad:</p>
                      <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap font-mono">{`{
  "employees": [
    // This employee has low PTO
    {"employee_id": "12345", "pto_hours": 2.0}
  ]
}`}</pre>
                    </div>
                    <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Good:</p>
                      <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap font-mono">{`{
  "employees": [
    {"employee_id": "12345", "pto_hours": 2.0, "sick_hours": 16.5}
  ]
}`}</pre>
                    </div>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">Why:</span> Sample data should be clean JSON without comments.</p>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </>
        );
      }

      case 9: {
        const savedPrompts = formData.savedPrompts || [];
        const currentConfigHash = computeClientConfigHash(formData);
        const activePrompt = savedPrompts.find(p => p.isActive);

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                Prompt Configuration
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Generate and manage system prompts for your agent to use
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
                  <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">What is the prompt library?</p>
                    <p className="text-sm text-muted-foreground">
                      Generate multiple system prompts using AI and keep them versioned. Only one prompt can be active at a time. Prompts that were created with different settings will show a warning.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Generate with AI</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Create a system prompt based on your agent's current configuration
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="default"
                        disabled={isGeneratingPrompt}
                        className="w-full"
                        data-testid="settings-button-generate-prompt"
                      >
                        {isGeneratingPrompt ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        {isGeneratingPrompt ? "Generating..." : "Generate Prompt"}
                        <ChevronDown className="h-3 w-3 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => handleGeneratePromptWithSafeguard(model)}
                          data-testid={`settings-generate-prompt-${model}`}
                        >
                          {geminiModelDisplayNames[model]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {isEditingPrompt && editingPromptId && (
                  <div className="space-y-3 rounded-lg border border-primary p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Pencil className="h-4 w-4 text-primary shrink-0" />
                        <Input
                          value={editingPromptName}
                          onChange={(e) => setEditingPromptName(e.target.value)}
                          className="text-sm font-medium"
                          data-testid="input-edit-prompt-name"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsEditingPrompt(false);
                            setEditingPromptId(null);
                            setEditedPrompt("");
                          }}
                          data-testid="button-cancel-edit-prompt"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSaveAsName(editingPromptName + " (copy)");
                            setShowSaveAsDialog(true);
                          }}
                          data-testid="button-save-as-new-prompt"
                        >
                          Save As New
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveEditPrompt}
                          data-testid="button-save-edit-prompt"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      className="min-h-[270px] resize-y font-mono text-xs"
                      placeholder="Enter a custom system prompt..."
                      data-testid="settings-textarea-edit-prompt"
                    />
                  </div>
                )}

                {(savedPrompts.length || 0) > 0 && !isEditingPrompt && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Saved Prompts ({savedPrompts.length})</Label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {savedPrompts.map((prompt) => {
                        const isStale = prompt.configHash && prompt.configHash !== currentConfigHash;
                        return (
                          <div
                            key={prompt.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border bg-card ${prompt.isActive ? "border-primary" : ""}`}
                            data-testid={`card-prompt-${prompt.id}`}
                          >
                            <FileText className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {inlineEditingNameId === prompt.id ? (
                                  <Input
                                    value={inlineEditingNameValue}
                                    onChange={(e) => setInlineEditingNameValue(e.target.value)}
                                    onBlur={() => handleInlineNameSave(prompt.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleInlineNameSave(prompt.id);
                                      if (e.key === "Escape") setInlineEditingNameId(null);
                                    }}
                                    className="text-sm font-medium w-48"
                                    autoFocus
                                    data-testid={`input-inline-name-${prompt.id}`}
                                  />
                                ) : (
                                  <p
                                    className="text-sm font-medium truncate cursor-pointer hover:underline"
                                    onClick={() => {
                                      setInlineEditingNameId(prompt.id);
                                      setInlineEditingNameValue(prompt.name);
                                    }}
                                    title="Click to rename"
                                    data-testid={`text-prompt-name-${prompt.id}`}
                                  >
                                    {prompt.name}
                                  </p>
                                )}
                                {prompt.isActive && (
                                  <Badge variant="default" className="shrink-0" data-testid={`badge-active-${prompt.id}`}>
                                    Active
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {prompt.source === "ai" ? "AI" : prompt.source === "coach" ? "Coach" : "Manual"}
                                </Badge>
                                {isStale && (
                                  <Badge variant="destructive" className="shrink-0 gap-1" data-testid={`badge-stale-${prompt.id}`}>
                                    <AlertTriangle className="h-3 w-3" />
                                    Config Changed
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                Created {new Date(prompt.createdAt).toLocaleDateString()}
                                {prompt.model && ` · ${prompt.model}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setViewingPrompt(prompt)}
                                title="View prompt"
                                data-testid={`button-view-prompt-${prompt.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEditPrompt(prompt)}
                                title="Edit prompt"
                                data-testid={`button-edit-prompt-${prompt.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDuplicatePrompt(prompt)}
                                title="Duplicate prompt"
                                data-testid={`button-duplicate-prompt-${prompt.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {!prompt.isActive ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEnablePrompt(prompt.id)}
                                  title="Enable this prompt"
                                  data-testid={`button-enable-prompt-${prompt.id}`}
                                >
                                  <Power className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled
                                  title="Currently active"
                                  data-testid={`button-enable-prompt-${prompt.id}`}
                                >
                                  <Check className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                              {!prompt.isActive && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeletePrompt(prompt.id)}
                                  title="Delete prompt"
                                  data-testid={`button-delete-prompt-${prompt.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {savedPrompts.length === 0 && !isEditingPrompt && (
                  <div className="rounded-md bg-muted/50 p-8 text-center">
                    <Code className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No prompts saved yet. Use "Generate Prompt" above to create your first prompt, or the system will auto-generate one when you save.
                    </p>
                  </div>
                )}

                <Dialog open={viewingPrompt !== null} onOpenChange={(open) => !open && setViewingPrompt(null)}>
                  <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-prompt-viewer">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        {viewingPrompt?.name}
                        <Badge variant="outline">
                          {viewingPrompt?.source === "ai" ? "AI" : viewingPrompt?.source === "coach" ? "Coach" : "Manual"}
                        </Badge>
                        {viewingPrompt?.isActive && (
                          <Badge variant="default">Active</Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        Created {viewingPrompt ? new Date(viewingPrompt.createdAt).toLocaleDateString() : ""}
                        {viewingPrompt?.model && ` · Model: ${viewingPrompt.model}`}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="overflow-auto max-h-[60vh] rounded-lg border bg-muted/30">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                        {viewingPrompt?.content}
                      </pre>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        );
      }

      case 10: {
        const welcomeConfig: WelcomeConfig = formData.welcomeConfig || {
          enabled: true,
          greeting: "",
          suggestedPrompts: [],
        };

        const updateWelcomeConfig = (updates: Partial<WelcomeConfig>) => {
          updateFormDataAndTrackCompletion({ welcomeConfig: { ...welcomeConfig, ...updates } });
        };

        const generateWelcomeConfigFn = async () => {
          if (!formData.businessUseCase?.trim()) {
            toast({
              title: "Missing business use case",
              description: "Please provide a business use case first to auto-generate the welcome screen.",
              variant: "destructive",
            });
            return;
          }

          setIsGeneratingWelcome(true);
          try {
            const sampleDataString = formData.sampleDatasets?.length
              ? formData.sampleDatasets.map((s: any) => `${s.name || "Sample"}:\n${typeof s.content === 'string' ? s.content : JSON.stringify(s.content)}`).join("\n\n")
              : undefined;
            const response = await apiRequest("POST", "/api/generate/welcome-config", {
              name: formData.name,
              businessUseCase: formData.businessUseCase,
              domainKnowledge: formData.domainKnowledge,
              sampleData: sampleDataString,
            });
            const result = await response.json();
            updateFormDataAndTrackCompletion({
              welcomeConfig: {
                enabled: true,
                greeting: result.greeting || "",
                suggestedPrompts: (result.suggestedPrompts || []).map((p: any) => ({
                  id: uuidv4(),
                  title: p.title || "",
                  prompt: p.prompt || "",
                })),
              },
            });
            toast({
              title: "Welcome screen generated",
              description: "Your welcome screen has been configured using AI.",
            });
          } catch (error: any) {
            toast({
              title: "Generation failed",
              description: error.message || "Failed to generate welcome config.",
              variant: "destructive",
            });
          } finally {
            setIsGeneratingWelcome(false);
          }
        };

        const addWelcomePrompt = () => {
          const newPrompt: WelcomePrompt = {
            id: uuidv4(),
            title: "",
            prompt: "",
          };
          updateWelcomeConfig({
            suggestedPrompts: [...welcomeConfig.suggestedPrompts, newPrompt],
          });
        };

        const removeWelcomePrompt = (id: string) => {
          updateWelcomeConfig({
            suggestedPrompts: welcomeConfig.suggestedPrompts.filter((p) => p.id !== id),
          });
        };

        const updateWelcomePrompt = (id: string, updates: Partial<WelcomePrompt>) => {
          updateWelcomeConfig({
            suggestedPrompts: welcomeConfig.suggestedPrompts.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          });
        };

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <MessageSquare className="h-5 w-5 text-primary" />
                Welcome Screen
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Configure the greeting and suggested prompts that users see when they start a new chat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="settings-welcome-enabled">Enable Welcome Screen</Label>
                    <p className="text-sm text-muted-foreground">
                      Show a greeting and suggested prompts when users open the chat
                    </p>
                  </div>
                  <Switch
                    id="settings-welcome-enabled"
                    checked={welcomeConfig.enabled}
                    onCheckedChange={(checked) => updateWelcomeConfig({ enabled: checked })}
                    data-testid="settings-switch-welcome-enabled"
                  />
                </div>

                {welcomeConfig.enabled && (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label htmlFor="settings-data-columns-card">Show Data Columns Card</Label>
                        <p className="text-sm text-muted-foreground">
                          Display a card showing the count of available data columns from your datasets
                        </p>
                      </div>
                      <Switch
                        id="settings-data-columns-card"
                        checked={welcomeConfig.dataColumnsCard?.enabled || false}
                        onCheckedChange={(checked) => updateWelcomeConfig({
                          dataColumnsCard: {
                            enabled: checked,
                            title: welcomeConfig.dataColumnsCard?.title || "View Existing Data Columns",
                          },
                        })}
                        data-testid="settings-switch-data-columns-card"
                      />
                    </div>

                    {welcomeConfig.dataColumnsCard?.enabled && (
                      <div>
                        <Label htmlFor="settings-data-columns-title">Data Columns Card Title</Label>
                        <Input
                          id="settings-data-columns-title"
                          placeholder="View Existing Data Columns"
                          value={welcomeConfig.dataColumnsCard?.title || ""}
                          onChange={(e) => updateWelcomeConfig({
                            dataColumnsCard: {
                              enabled: true,
                              title: e.target.value,
                            },
                          })}
                          className="mt-1"
                          data-testid="settings-input-data-columns-title"
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <Label htmlFor="settings-greeting">Greeting Message</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateWelcomeConfigFn}
                          disabled={isGeneratingWelcome}
                          data-testid="settings-button-regenerate-welcome"
                        >
                          {isGeneratingWelcome ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Regenerate
                            </>
                          )}
                        </Button>
                      </div>
                      <Textarea
                        id="settings-greeting"
                        placeholder="e.g., Hi there! I'm your assistant. How can I help you today?"
                        value={welcomeConfig.greeting}
                        onChange={(e) => updateWelcomeConfig({ greeting: e.target.value })}
                        className="resize-none"
                        rows={3}
                        data-testid="settings-textarea-welcome-greeting"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <Label>Suggested Prompts</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addWelcomePrompt}
                          data-testid="settings-button-add-prompt"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Prompt
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Quick-start prompts that users can click to begin a conversation.
                      </p>

                      {isGeneratingWelcome ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          <span className="ml-2 text-muted-foreground">Generating welcome config...</span>
                        </div>
                      ) : welcomeConfig.suggestedPrompts.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground border rounded-md">
                          No suggested prompts yet. Click "Add Prompt" or "Regenerate" to get started.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {welcomeConfig.suggestedPrompts.map((prompt) => (
                            <Card key={prompt.id} data-testid={`settings-card-prompt-${prompt.id}`}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 space-y-2">
                                    <Input
                                      placeholder="Prompt title (e.g., Check my order status)"
                                      value={prompt.title}
                                      onChange={(e) => updateWelcomePrompt(prompt.id, { title: e.target.value })}
                                      data-testid={`settings-input-prompt-title-${prompt.id}`}
                                    />
                                    <Textarea
                                      placeholder="Full prompt text (e.g., I'd like to check the status of my recent order)"
                                      value={prompt.prompt}
                                      onChange={(e) => updateWelcomePrompt(prompt.id, { prompt: e.target.value })}
                                      className="resize-none"
                                      rows={2}
                                      data-testid={`settings-textarea-prompt-text-${prompt.id}`}
                                    />
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeWelcomePrompt(prompt.id)}
                                    data-testid={`settings-button-remove-prompt-${prompt.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4">
                      <Label className="mb-3 block">Preview</Label>
                      <Card className="bg-muted/50">
                        <CardContent className="p-6">
                          <div className="flex flex-col items-center text-center space-y-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                              <Bot className="h-6 w-6 text-primary" />
                            </div>
                            <p className="text-foreground" data-testid="settings-text-preview-greeting">
                              {welcomeConfig.greeting || "Hi there! How can I help you today?"}
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-2">
                              {welcomeConfig.dataColumnsCard?.enabled && (
                                <Badge
                                  variant="secondary"
                                  className="gap-1"
                                  data-testid="settings-badge-preview-data-columns"
                                >
                                  <Database className="h-3 w-3" />
                                  {welcomeConfig.dataColumnsCard.title || "View Existing Data Columns"} ({extractFieldsFromSampleData(formData.sampleDatasets || []).length})
                                </Badge>
                              )}
                              {welcomeConfig.suggestedPrompts.map((prompt) => (
                                <Badge
                                  key={prompt.id}
                                  variant="outline"
                                  data-testid={`settings-badge-preview-prompt-${prompt.id}`}
                                >
                                  {prompt.title || "Untitled prompt"}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-semibold">Settings</h1>
                  <p className="text-xs text-muted-foreground">{agent.name}</p>
                </div>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="gap-2"
              data-testid="button-save"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "configuration" | "tracing" | "simulator")}>
          <TabsList className="mb-6">
            <TabsTrigger value="configuration" className="gap-2" data-testid="tab-configuration">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="tracing" className="gap-2" data-testid="tab-tracing">
              <Activity className="h-4 w-4" />
              Tracing
            </TabsTrigger>
            <TabsTrigger value="simulator" className="gap-2" data-testid="tab-simulator">
              <FlaskConical className="h-4 w-4" />
              Simulator
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="configuration">
            <div className="flex gap-8">
              <aside className="w-64 shrink-0 hidden md:block">
                <div className="sticky top-24">
                  <SettingsStepIndicator 
                    currentStep={currentStep} 
                    onStepClick={setCurrentStep}
                    completedSteps={completedSteps}
                  />
                </div>
              </aside>

              <div className="flex-1 max-w-2xl space-y-6">
                {renderCurrentStep()}

            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={currentStep === 1}
                data-testid="button-prev-step"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              
              <div className="flex items-center gap-2 md:hidden">
                <span className="text-sm text-muted-foreground">
                  Step {currentStep} of {settingsSteps.length}
                </span>
              </div>

              {currentStep < settingsSteps.length ? (
                <Button
                  onClick={handleNextStep}
                  data-testid="button-next-step"
                >
                  Next
                  <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
                </Button>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-final"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              )}
            </div>

            <Card className="border-destructive/50 mt-8">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible actions for this agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="gap-2"
                      data-testid="button-delete"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Agent
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the agent
                        and all associated chat history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-delete"
                      >
                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>
      
      <TabsContent value="tracing">
        <TracingDashboard agentId={params.id!} agent={agent} />
      </TabsContent>

      <TabsContent value="simulator">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Config Simulator</h2>
            <p className="text-sm text-muted-foreground">
              Test configuration changes before applying them to your agent
            </p>
          </div>

          <Card data-testid="card-current-configuration">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4 text-primary" />
                Current Configuration
              </CardTitle>
              <CardDescription>
                All settings that affect agent behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Identity & Knowledge
                </h4>
                {agent.description && (
                  <div className="mb-3">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <div className="p-3 rounded-lg bg-muted text-xs max-h-16 overflow-auto mt-1" data-testid="text-description">
                      <p className="whitespace-pre-wrap">{agent.description.substring(0, 200)}{agent.description.length > 200 ? '...' : ''}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Business Use Case</Label>
                    <div className="p-3 rounded-lg bg-muted text-xs max-h-24 overflow-auto" data-testid="text-business-use-case">
                      {agent.businessUseCase ? (
                        <p className="whitespace-pre-wrap">{agent.businessUseCase.substring(0, 300)}{agent.businessUseCase.length > 300 ? '...' : ''}</p>
                      ) : (
                        <span className="text-muted-foreground italic">No business use case defined</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Domain Knowledge</Label>
                    <div className="p-3 rounded-lg bg-muted text-xs max-h-24 overflow-auto" data-testid="text-domain-knowledge">
                      {agent.domainKnowledge ? (
                        <p className="whitespace-pre-wrap">{agent.domainKnowledge.substring(0, 300)}{agent.domainKnowledge.length > 300 ? '...' : ''}</p>
                      ) : (
                        <span className="text-muted-foreground italic">No domain knowledge configured</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <p className="text-lg font-semibold" data-testid="count-domain-documents">{agent.domainDocuments?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Domain Documents</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <p className="text-lg font-semibold" data-testid="count-sample-datasets">{agent.sampleDatasets?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Sample Datasets</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <p className="text-lg font-semibold" data-testid="text-prompt-style">
                      {agent.customPrompt ? 'Custom' : 'AI Generated'}
                    </p>
                    <p className="text-xs text-muted-foreground">Prompt Type</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 text-center">
                    <div className="text-lg font-semibold" data-testid="text-agent-status">
                      <Badge variant={agent.status === 'active' ? 'default' : agent.status === 'configured' ? 'secondary' : 'outline'}>
                        {agent.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Status</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Rules & Guardrails
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Validation Rules</Label>
                    <div className="p-3 rounded-lg bg-muted text-xs font-mono max-h-32 overflow-auto" data-testid="text-validation-rules">
                      {agent.validationRules ? (
                        <pre className="whitespace-pre-wrap">{agent.validationRules.substring(0, 500)}{agent.validationRules.length > 500 ? '...' : ''}</pre>
                      ) : (
                        <span className="text-muted-foreground italic">No validation rules configured</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Guardrails</Label>
                    <div className="p-3 rounded-lg bg-muted text-xs font-mono max-h-32 overflow-auto" data-testid="text-guardrails">
                      {agent.guardrails ? (
                        <pre className="whitespace-pre-wrap">{agent.guardrails.substring(0, 500)}{agent.guardrails.length > 500 ? '...' : ''}</pre>
                      ) : (
                        <span className="text-muted-foreground italic">No guardrails configured</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  System Prompt
                </h4>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">System Prompt</Label>
                  <div className="p-3 rounded-lg bg-muted text-xs font-mono max-h-40 overflow-auto" data-testid="text-system-prompt">
                    {agent.customPrompt ? (
                      <pre className="whitespace-pre-wrap">{agent.customPrompt.substring(0, 800)}{agent.customPrompt.length > 800 ? '...' : ''}</pre>
                    ) : (
                      <span className="text-muted-foreground italic">System prompt will be AI-generated based on your configuration</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SimulationPanel agentId={params.id!} agent={agent} />
            <ConfigHistoryPanel agentId={params.id!} agent={agent} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
      </main>

      {/* Add/Edit Action Dialog */}
      <Dialog open={isAddActionDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddActionDialogOpen(false);
          resetActionForm();
          setEditingAction(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="settings-dialog-add-action">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {editingAction ? "Edit Action" : "Add New Action"}
            </DialogTitle>
            <DialogDescription>
              {editingAction 
                ? "Modify the action configuration below." 
                : "Define a new action that your agent can simulate."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="action-name">Action Name *</Label>
                <Input
                  id="action-name"
                  value={actionFormData.name}
                  onChange={(e) => setActionFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Update Address"
                  data-testid="settings-input-action-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-category">Category</Label>
                <Select
                  value={actionFormData.category}
                  onValueChange={(value) => setActionFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger data-testid="settings-select-action-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {actionCategories.map(cat => (
                      <SelectItem key={cat} value={cat} data-testid={`settings-select-category-${cat}`}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="action-description">Description</Label>
              <Textarea
                id="action-description"
                value={actionFormData.description}
                onChange={(e) => setActionFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What does this action do?"
                className="min-h-[80px]"
                data-testid="settings-textarea-action-description"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="action-confirmation">Confirmation Message</Label>
                <Input
                  id="action-confirmation"
                  value={actionFormData.confirmationMessage}
                  onChange={(e) => setActionFormData(prev => ({ ...prev, confirmationMessage: e.target.value }))}
                  placeholder="Are you sure you want to..."
                  data-testid="settings-input-action-confirmation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-success">Success Message</Label>
                <Input
                  id="action-success"
                  value={actionFormData.successMessage}
                  onChange={(e) => setActionFormData(prev => ({ ...prev, successMessage: e.target.value }))}
                  placeholder="Successfully completed..."
                  data-testid="settings-input-action-success"
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Required Fields ({actionFormData.requiredFields.length})</Label>
                <div className="flex items-center gap-2">
                  {availableFields.length > 0 && (
                    <DropdownMenu open={showAvailableFields} onOpenChange={setShowAvailableFields}>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="settings-button-from-data">
                          <Database className="h-4 w-4 mr-1" />
                          From Data
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                        {availableFields.map((field, idx) => (
                          <DropdownMenuItem 
                            key={idx} 
                            onClick={() => addFieldFromSampleData(field)}
                            data-testid={`settings-menu-item-field-${field.name}`}
                          >
                            <span className="font-medium">{field.name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">{field.type}</Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="outline" size="sm" onClick={addActionField} data-testid="settings-button-add-field">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Field
                  </Button>
                </div>
              </div>
              
              {actionFormData.requiredFields.length > 0 && (
                <div className="space-y-2 border rounded-lg p-3">
                  {actionFormData.requiredFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2" data-testid={`settings-action-field-${index}`}>
                      <Input
                        value={field.name}
                        onChange={(e) => updateActionField(index, { name: e.target.value })}
                        placeholder="Field name"
                        className="flex-1"
                        data-testid={`settings-input-field-name-${index}`}
                      />
                      <Input
                        value={field.label}
                        onChange={(e) => updateActionField(index, { label: e.target.value })}
                        placeholder="Label"
                        className="flex-1"
                        data-testid={`settings-input-field-label-${index}`}
                      />
                      <Select
                        value={field.type}
                        onValueChange={(value) => updateActionField(index, { type: value as ActionField["type"] })}
                      >
                        <SelectTrigger className="w-28" data-testid={`settings-select-field-type-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldTypes.map(type => (
                            <SelectItem key={type} value={type} data-testid={`settings-select-fieldtype-${type}`}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeActionField(index)}
                        data-testid={`settings-button-remove-field-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddActionDialogOpen(false)} data-testid="settings-button-cancel-action">
              Cancel
            </Button>
            <Button onClick={handleSaveAction} data-testid="settings-button-save-action">
              {editingAction ? "Update Action" : "Add Action"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clarifying Chat Dialogs */}
      <ClarifyingChatDialog
        open={showValidationChatDialog}
        onOpenChange={setShowValidationChatDialog}
        generationType="validation"
        businessUseCase={formData?.businessUseCase || ""}
        domainKnowledge={formData?.domainKnowledge}
        domainDocuments={formData?.domainDocuments}
        existingInsights={formData?.clarifyingInsights || []}
        initialQuestion={validationInitialQuestion}
        onComplete={handleValidationChatComplete}
      />

      <ClarifyingChatDialog
        open={showGuardrailsChatDialog}
        onOpenChange={setShowGuardrailsChatDialog}
        generationType="guardrails"
        businessUseCase={formData?.businessUseCase || ""}
        domainKnowledge={formData?.domainKnowledge}
        domainDocuments={formData?.domainDocuments}
        existingInsights={formData?.clarifyingInsights || []}
        initialQuestion={guardrailsInitialQuestion}
        onComplete={handleGuardrailsChatComplete}
      />

      <AlertDialog open={showRegenerationWarning} onOpenChange={setShowRegenerationWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Overwrite Existing Prompt?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This agent already has a customized prompt. Regenerating will completely replace it with a new AI-generated prompt based on your current configuration settings.
              <span className="block mt-2 font-medium text-foreground">
                Any manual edits or refinements you've made to the current prompt will be lost.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowRegenerationWarning(false);
                setPendingRegenerateModel(null);
              }}
              data-testid="button-regenerate-cancel"
            >
              Keep Current Prompt
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setShowRegenerationWarning(false);
                if (pendingRegenerateModel) {
                  handleGeneratePrompt(pendingRegenerateModel);
                  setPendingRegenerateModel(null);
                }
              }}
              data-testid="button-regenerate-confirm"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Regenerate Prompt
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showStalePromptDialog} onOpenChange={setShowStalePromptDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Outdated Prompt Configuration
            </AlertDialogTitle>
            <AlertDialogDescription>
              This prompt was created with different agent configuration settings (business use case, domain knowledge, validation rules, or guardrails have changed since). Enabling it may cause your agent to behave inconsistently with your current settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowStalePromptDialog(false);
                setPendingEnablePromptId(null);
              }}
              data-testid="button-stale-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setShowStalePromptDialog(false);
                if (pendingEnablePromptId) {
                  activatePrompt(pendingEnablePromptId);
                  setPendingEnablePromptId(null);
                }
              }}
              data-testid="button-stale-enable-anyway"
            >
              Enable Anyway
            </Button>
            <Button
              onClick={() => {
                setShowStalePromptDialog(false);
                setPendingEnablePromptId(null);
                handleGeneratePromptWithSafeguard(defaultGenerationModel);
              }}
              data-testid="button-stale-regenerate"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Regenerate New
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSaveAsDialog} onOpenChange={setShowSaveAsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As New Prompt</DialogTitle>
            <DialogDescription>
              Give your new prompt a name. It will be saved as a separate entry in your prompt library.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="Enter prompt name..."
              data-testid="input-save-as-name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveAsDialog(false)} data-testid="button-save-as-cancel">
              Cancel
            </Button>
            <Button onClick={handleSaveAsNewPrompt} disabled={!saveAsName.trim()} data-testid="button-save-as-confirm">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showSyncFromProdDialog} onOpenChange={(open) => { if (!open && isSyncingFromProd) return; setShowSyncFromProdDialog(open); if (!open) setSyncDifferences(null); }}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Sync from Production
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {syncDifferences && syncDifferences.length === 0 ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    Dev and production are already in sync. No changes needed.
                  </span>
                ) : (
                  <>
                    <span>The following fields differ between dev and production:</span>
                    <div className="mt-3 space-y-2 overflow-y-auto max-h-[40vh] pr-1">
                      {syncDifferences?.map((diff) => (
                        <div key={diff.field} className="rounded-md border p-3 text-sm">
                          <div className="font-medium text-foreground mb-1">{diff.label}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-xs text-muted-foreground block mb-0.5">Dev (current)</span>
                              <span className="text-xs break-words block bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-1">{diff.devValue}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground block mb-0.5">Production (incoming)</span>
                              <span className="text-xs break-words block bg-green-50 dark:bg-green-950/30 rounded px-1.5 py-1">{diff.prodValue}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <span className="block mt-3 font-medium text-foreground">
                      Syncing will overwrite your dev values with the production versions above. This cannot be undone.
                    </span>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isSyncingFromProd}
              data-testid="button-sync-cancel"
            >
              {syncDifferences?.length === 0 ? "Close" : "Cancel"}
            </AlertDialogCancel>
            {syncDifferences && syncDifferences.length > 0 && (
              <Button
                onClick={handleSyncFromProd}
                disabled={isSyncingFromProd}
                data-testid="button-sync-confirm"
              >
                {isSyncingFromProd ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <CloudDownload className="h-4 w-4 mr-2" />
                    Yes, Sync {syncDifferences.length} {syncDifferences.length === 1 ? 'Field' : 'Fields'}
                  </>
                )}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPromptOutdatedDialog} onOpenChange={(open) => { if (!open && isRegeneratingPrompt) return; }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Configuration Changed — Prompt Update Required
            </AlertDialogTitle>
            <AlertDialogDescription>
              You've made changes to your agent's configuration that aren't reflected in the current system prompt. The prompt controls how your agent behaves during conversations.
              <span className="block mt-2 font-medium text-foreground">
                Regenerating the prompt ensures your agent uses the latest configuration. You can skip this, but the prompt may be out of sync.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel
              onClick={handleSaveWithoutRegenerate}
              disabled={isRegeneratingPrompt}
              data-testid="button-save-without-regenerate"
            >
              Save Without Updating
            </AlertDialogCancel>
            <Button
              onClick={handleSaveAndRegenerate}
              disabled={isRegeneratingPrompt}
              data-testid="button-save-and-regenerate"
            >
              {isRegeneratingPrompt ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Save & Regenerate Prompt
                </>
              )}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
