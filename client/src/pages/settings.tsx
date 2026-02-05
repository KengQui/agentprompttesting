import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2, Bot, Briefcase, Shield, AlertTriangle, Loader2, BookOpen, Upload, X, FileText, Code, Pencil, RotateCcw, HelpCircle, ExternalLink, Info, Sparkles, ChevronDown, ChevronUp, Database, Check, Settings, Activity, FlaskConical, Zap, User, Eye, Filter, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import type { Agent, UpdateAgent, AgentStatus, DomainDocument, SampleDataset, GeminiModel, AgentAction, MockUserState, MockMode, ActionField, ClarifyingInsight } from "@shared/schema";
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
  { id: 8, name: "Prompt Configuration", icon: Code, description: "Customize the system prompt" },
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
  const progress = (completedSteps.size / settingsSteps.length) * 100;

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
        <div className="text-xs text-muted-foreground mb-2">Completion</div>
        <Progress value={progress} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1">{Math.round(progress)}% complete</div>
      </div>
    </div>
  );
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

  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");

  const [isGeneratingValidation, setIsGeneratingValidation] = useState(false);
  const [isGeneratingGuardrails, setIsGeneratingGuardrails] = useState(false);
  const [isGeneratingSampleData, setIsGeneratingSampleData] = useState(false);
  const [isGeneratingActions, setIsGeneratingActions] = useState(false);
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
    return completed;
  };

  useEffect(() => {
    if (agent && !formData) {
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
        clarifyingInsights: agent.clarifyingInsights || [],
        availableActions: agent.availableActions || [],
        mockUserState: agent.mockUserState || [],
        mockMode: agent.mockMode || "full",
        status: agent.status,
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

  const handleSave = () => {
    if (formData) {
      updateMutation.mutate(formData);
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
                          toast({
                            title: "Template loaded",
                            description: "Fill in the bracketed placeholders with your specific details.",
                          });
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

      case 8:
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                Prompt Configuration
                {formData.customPrompt && (
                  <Badge variant="secondary">Customized</Badge>
                )}
              </CardTitle>
              <CardDescription>
                View and optionally customize the system prompt. The prompt is automatically generated using AI-powered prompt engineering based on your agent's configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      AI-Powered Prompt Generation
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Your system prompt is intelligently crafted based on your agent's name, business use case, domain knowledge, validation rules, guardrails, sample data, and available actions. The AI curates and organizes this information following prompt engineering best practices.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>System Prompt</Label>
                  <div className="flex gap-2">
                    {formData.customPrompt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateFormDataAndTrackCompletion({ customPrompt: "" });
                          setEditedPrompt("");
                          setIsEditingPrompt(false);
                        }}
                        className="gap-1 h-7"
                        data-testid="settings-button-reset-prompt"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset to Auto
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (isEditingPrompt) {
                          updateFormDataAndTrackCompletion({ customPrompt: editedPrompt });
                        } else {
                          setEditedPrompt(formData.customPrompt || "");
                        }
                        setIsEditingPrompt(!isEditingPrompt);
                      }}
                      className="gap-1 h-7"
                      data-testid="settings-button-edit-prompt"
                    >
                      <Pencil className="h-3 w-3" />
                      {isEditingPrompt ? "Save" : "Customize"}
                    </Button>
                  </div>
                </div>
                
                {isEditingPrompt && (
                  <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">
                      Available Placeholders
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                      Use these placeholders and they will be replaced with your agent's configuration:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {["{{name}}", "{{businessUseCase}}", "{{domainKnowledge}}", "{{validationRules}}", "{{guardrails}}", "{{sampleDatasets}}", "{{currentDate}}"].map((placeholder) => (
                        <code 
                          key={placeholder}
                          className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded text-xs cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-800"
                          onClick={() => {
                            setEditedPrompt((prev) => prev + placeholder);
                          }}
                          title="Click to insert"
                          data-testid={`placeholder-${placeholder.replace(/[{}]/g, '')}`}
                        >
                          {placeholder}
                        </code>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 italic">
                      If no placeholders are used, domain knowledge and guardrails will be automatically appended to your custom prompt.
                    </p>
                  </div>
                )}
                
                {isEditingPrompt ? (
                  <Textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="min-h-[270px] resize-y font-mono text-xs"
                    placeholder="Enter a custom system prompt..."
                    data-testid="settings-textarea-edit-prompt"
                  />
                ) : (
                  <div 
                    className="rounded-md bg-muted/50 p-4 text-xs font-mono max-h-[300px] overflow-y-auto whitespace-pre-wrap"
                    data-testid="settings-prompt-preview"
                  >
                    {formData.customPrompt || (
                      <div className="text-muted-foreground italic">
                        The system prompt will be automatically generated when you save. It will incorporate your agent's configuration using AI-powered prompt engineering best practices.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

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
    </div>
  );
}
