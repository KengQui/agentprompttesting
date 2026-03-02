import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Briefcase, Shield, AlertTriangle, Eye, Bot, BookOpen, Upload, X, FileText, Code, Pencil, RotateCcw, HelpCircle, ExternalLink, Info, Sparkles, Loader2, ChevronDown, Database, Zap, Plus, Trash2, User, ChevronUp, Save, CheckSquare, CheckCircle2, XCircle, AlertCircle, MessageSquare } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { generatePromptPreview } from "@/lib/prompt-preview";
import { businessUseCaseTemplate, domainKnowledgeTemplate, validationRulesTemplate, guardrailsTemplate, sampleDataTemplate } from "@/lib/config-templates";
import type { WizardStepData, Agent, DomainDocument, SampleDataset, PromptStyle, GeminiModel, ClarifyingInsight, AgentAction, MockUserState, ActionField, MockMode, WelcomeConfig, WelcomePrompt } from "@shared/schema";
import { geminiModelDisplayNames, defaultGenerationModel, mockModeDescriptions } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ClarifyingChatDialog } from "@/components/clarifying-chat-dialog";

const steps = [
  { id: 1, name: "Business Use Case", icon: Briefcase, description: "Define the problem this agent solves" },
  { id: 2, name: "Agent Name", icon: Bot, description: "Name your agent" },
  { id: 3, name: "Domain Knowledge", icon: BookOpen, description: "Add knowledge and documents" },
  { id: 4, name: "Validation Rules", icon: Shield, description: "Set input/output validation rules" },
  { id: 5, name: "Guardrails", icon: AlertTriangle, description: "Define safety boundaries" },
  { id: 6, name: "Sample Data", icon: Database, description: "Upload or generate sample data" },
  { id: 7, name: "Available Actions", icon: Zap, description: "Define actions agent can simulate" },
  { id: 8, name: "Validation Checklist", icon: CheckSquare, description: "Review configuration quality" },
  { id: 9, name: "Agent Prompt", icon: Eye, description: "Define your agent's prompt" },
  { id: 10, name: "Welcome Screen", icon: MessageSquare, description: "Configure the chat welcome screen" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col gap-4">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className="flex flex-col gap-0.5"
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
                  data-testid={`step-indicator-${step.id}`}
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
              <span className="text-xs text-muted-foreground hidden lg:block">
                {step.description}
              </span>
              {index !== steps.length - 1 && (
                <div className="absolute left-5 mt-12 h-4 w-0.5 bg-muted" style={{ display: 'none' }} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 pt-4 border-t">
        <div className="text-xs text-muted-foreground">{steps.length} steps total</div>
      </div>
    </div>
  );
}


function Step1BusinessUseCase({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const handleUseTemplate = () => {
    onUpdate({ businessUseCase: businessUseCaseTemplate });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Business Use Case
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">
          Describe what problem this agent will solve. Be specific about the use case and target users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label htmlFor="businessUseCase">What problem does this agent solve?</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseTemplate}
                  className="text-sm text-primary hover:underline"
                  data-testid="button-use-template-usecase"
                >
                  Use Template
                </button>
              </div>
            </div>
            <Textarea
              id="businessUseCase"
              placeholder="e.g., This agent helps customer support teams quickly answer product-related questions by accessing our knowledge base and providing accurate, helpful responses..."
              value={data.businessUseCase}
              onChange={(e) => onUpdate({ businessUseCase: e.target.value })}
              className="mt-2 min-h-[270px] resize-y"
              data-testid="textarea-business-usecase"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step2AgentName({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Agent Name
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">
          Give your agent a name that describes its purpose.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Agent Name</Label>
            <Input
              id="name"
              placeholder="e.g., Support Assistant, Sales Helper, Code Reviewer..."
              value={data.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="mt-2"
              data-testid="input-agent-name"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step3DomainKnowledge({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload-document', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to upload file');
        }

        const document: DomainDocument = await response.json();
        onUpdate({ 
          domainDocuments: [...(data.domainDocuments || []), document] 
        });

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
    onUpdate({
      domainDocuments: (data.domainDocuments || []).filter(doc => doc.id !== id)
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          Domain Knowledge
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">
          Add knowledge that your agent should know about. You can type it in or upload documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label htmlFor="domainKnowledge">Knowledge Base (Type here)</Label>
              <button
                type="button"
                onClick={() => onUpdate({ domainKnowledge: domainKnowledgeTemplate })}
                className="text-sm text-primary hover:underline"
                data-testid="button-use-template-domain-knowledge"
              >
                Use Template
              </button>
            </div>
            <Textarea
              id="domainKnowledge"
              placeholder="e.g., 
- Our company was founded in 2020
- We offer three subscription tiers: Basic, Pro, and Enterprise
- Our support hours are 9 AM - 6 PM EST
- Product returns are accepted within 30 days..."
              value={data.domainKnowledge}
              onChange={(e) => onUpdate({ domainKnowledge: e.target.value })}
              className="min-h-[270px] resize-y"
              data-testid="textarea-domain-knowledge"
            />
          </div>

          <div className="border-t pt-4">
            <Label>Upload Documents</Label>
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

            {data.domainDocuments && data.domainDocuments.length > 0 && (
              <div className="mt-4 space-y-2">
                <Label className="text-sm">Uploaded Documents</Label>
                {data.domainDocuments.map((doc) => (
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
        </div>
      </CardContent>
    </Card>
  );
}

function Step4ValidationRules({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState("");
  const { toast } = useToast();

  const handleUseTemplate = () => {
    onUpdate({ validationRules: validationRulesTemplate });
  };

  const handleGenerate = async (model: GeminiModel) => {
    if (!data.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please complete Step 1 with your business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsEvaluating(true);
    setSelectedModel(model);
    
    try {
      const evalResponse = await apiRequest("POST", "/api/generate/evaluate-context", {
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        generationType: "validation",
      });
      const evalResult = await evalResponse.json();

      if (!evalResult.hasEnoughContext && evalResult.initialQuestion) {
        setInitialQuestion(evalResult.initialQuestion);
        setShowChatDialog(true);
        setIsEvaluating(false);
        return;
      }

      setIsEvaluating(false);
      setIsGenerating(true);
      
      const response = await apiRequest("POST", "/api/generate/validation-rules", {
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        model,
      });
      const result = await response.json();
      onUpdate({ validationRules: result.validationRules });
      toast({
        title: "Validation rules generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate validation rules. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setIsEvaluating(false);
    }
  };

  const handleChatComplete = (insights: ClarifyingInsight[], generatedContent: string) => {
    const updatedInsights = [
      ...(data.clarifyingInsights || []),
      ...insights,
    ];
    onUpdate({ 
      validationRules: generatedContent,
      clarifyingInsights: updatedInsights,
    });
    toast({
      title: "Validation rules generated",
      description: "Generated with your additional context.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Validation Rules
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">Validation rules help ensure your agent processes data correctly and provides accurate responses. Define rules for input formats, required fields, and response constraints.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Label htmlFor="validationRules">Validation Configuration</Label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseTemplate}
                  className="text-sm text-primary hover:underline"
                  data-testid="button-use-template-validation"
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
                        disabled={isGenerating || isEvaluating}
                        data-testid="button-generate-validation"
                      >
                        {isGenerating || isEvaluating ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        {isEvaluating ? "Checking..." : "Generate"}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => {
                            setSelectedModel(model);
                            handleGenerate(model);
                          }}
                          data-testid={`menu-item-model-${model}`}
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
              placeholder="Add validation rules to ensure data quality (Markdown or YAML format)..."
              value={data.validationRules}
              onChange={(e) => onUpdate({ validationRules: e.target.value })}
              className="min-h-[270px] resize-y font-mono text-sm"
              data-testid="textarea-validation-rules"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional: Add validation rules to ensure data quality (Markdown or YAML format)
            </p>
          </div>
        </div>
      </CardContent>
      <ClarifyingChatDialog
        open={showChatDialog}
        onOpenChange={setShowChatDialog}
        generationType="validation"
        businessUseCase={data.businessUseCase}
        domainKnowledge={data.domainKnowledge}
        domainDocuments={data.domainDocuments}
        existingInsights={data.clarifyingInsights || []}
        initialQuestion={initialQuestion}
        onComplete={handleChatComplete}
      />
    </Card>
  );
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

function Step5Guardrails({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<GuardrailConflict[]>([]);
  const [conflictSummary, setConflictSummary] = useState<ConflictCheckResult['summary'] | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState("");
  const { toast } = useToast();
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    onUpdate({ guardrails: value });
    
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
    checkTimeoutRef.current = setTimeout(() => {
      checkForConflicts(value);
    }, 1000);
  };

  useEffect(() => {
    if (data.guardrails && data.guardrails.trim().length >= 20) {
      checkForConflicts(data.guardrails);
    }
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  const handleUseTemplate = () => {
    onUpdate({ guardrails: guardrailsTemplate });
    setTimeout(() => checkForConflicts(guardrailsTemplate), 100);
  };

  const handleGenerate = async (model: GeminiModel) => {
    if (!data.businessUseCase) {
      toast({
        title: "Business use case required",
        description: "Please complete Step 1 with your business use case before generating.",
        variant: "destructive",
      });
      return;
    }

    setIsEvaluating(true);
    setSelectedModel(model);

    try {
      const evalResponse = await apiRequest("POST", "/api/generate/evaluate-context", {
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        generationType: "guardrails",
      });
      const evalResult = await evalResponse.json();

      if (!evalResult.hasEnoughContext && evalResult.initialQuestion) {
        setInitialQuestion(evalResult.initialQuestion);
        setShowChatDialog(true);
        setIsEvaluating(false);
        return;
      }

      setIsEvaluating(false);
      setIsGenerating(true);

      const response = await apiRequest("POST", "/api/generate/guardrails", {
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        model,
      });
      const result = await response.json();
      onUpdate({ guardrails: result.guardrails });
      toast({
        title: "Guardrails generated",
        description: `Generated using ${geminiModelDisplayNames[model]}.`,
      });
      setTimeout(() => checkForConflicts(result.guardrails), 100);
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate guardrails. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setIsEvaluating(false);
    }
  };

  const handleChatComplete = (insights: ClarifyingInsight[], generatedContent: string) => {
    const updatedInsights = [
      ...(data.clarifyingInsights || []),
      ...insights,
    ];
    onUpdate({ 
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          Guardrails
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">Guardrails protect your brand by preventing inappropriate responses, ensuring compliance, and maintaining consistent behavior even in edge cases.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4" data-testid="guardrail-conflicts-alert">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                <span className="font-medium text-yellow-800 dark:text-yellow-400">
                  Recovery Manager Conflicts Detected
                </span>
                {conflictSummary && (
                  <div className="flex gap-2 ml-auto">
                    {conflictSummary.errors > 0 && (
                      <Badge variant="destructive">{conflictSummary.errors} errors</Badge>
                    )}
                    {conflictSummary.warnings > 0 && (
                      <Badge className="bg-yellow-500 hover:bg-yellow-600">{conflictSummary.warnings} warnings</Badge>
                    )}
                    {conflictSummary.info > 0 && (
                      <Badge variant="secondary">{conflictSummary.info} info</Badge>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                The following conflicts were found between your guardrails and the recovery manager's escalation rules:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {conflicts.map((conflict, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-2 text-sm bg-white dark:bg-background rounded p-2 border"
                    data-testid={`conflict-item-${index}`}
                  >
                    {getSeverityIcon(conflict.severity)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getSeverityBadge(conflict.severity)}
                        {conflict.topic && (
                          <Badge variant="outline" className="text-xs">{conflict.topic}</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs break-words">
                        <strong>Guardrail:</strong> {conflict.guardrailRule}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <strong>Issue:</strong> {conflict.recoveryRule}
                      </p>
                      <p className="text-primary text-xs mt-1">
                        <strong>Suggestion:</strong> {conflict.suggestion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Label htmlFor="guardrails">Guardrails Configuration</Label>
                {isCheckingConflicts && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseTemplate}
                  className="text-sm text-primary hover:underline"
                  data-testid="button-use-template-guardrails"
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
                        disabled={isGenerating || isEvaluating}
                        data-testid="button-generate-guardrails"
                      >
                        {isGenerating || isEvaluating ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        {isEvaluating ? "Checking..." : "Generate"}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => {
                            setSelectedModel(model);
                            handleGenerate(model);
                          }}
                          data-testid={`menu-item-guardrails-model-${model}`}
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
              placeholder="Define what your agent should NOT do (Markdown or YAML format)..."
              value={data.guardrails}
              onChange={(e) => handleGuardrailsChange(e.target.value)}
              className="min-h-[270px] resize-y font-mono text-sm"
              data-testid="textarea-guardrails"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional: Define what your agent should NOT do (Markdown or YAML format)
            </p>
          </div>
        </div>
      </CardContent>
      <ClarifyingChatDialog
        open={showChatDialog}
        onOpenChange={setShowChatDialog}
        generationType="guardrails"
        businessUseCase={data.businessUseCase}
        domainKnowledge={data.domainKnowledge}
        domainDocuments={data.domainDocuments}
        existingInsights={data.clarifyingInsights || []}
        initialQuestion={initialQuestion}
        onComplete={handleChatComplete}
      />
    </Card>
  );
}

function Step6SampleData({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dataType, setDataType] = useState("customer records");
  const [recordCount, setRecordCount] = useState(10);
  const [format, setFormat] = useState<"json" | "csv" | "text">("json");
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);
  const [viewingDataset, setViewingDataset] = useState<SampleDataset | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload-sample-data', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to upload file');
        }

        const dataset: SampleDataset = await response.json();
        const currentDatasets = data.sampleDatasets || [];
        onUpdate({ sampleDatasets: [...currentDatasets, dataset] });
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
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveDataset = (id: string) => {
    const currentDatasets = data.sampleDatasets || [];
    onUpdate({ sampleDatasets: currentDatasets.filter(d => d.id !== id) });
  };

  const handleGenerate = async (model: GeminiModel) => {
    if (!data.businessUseCase) {
      toast({
        title: "Missing information",
        description: "Please complete the Business Use Case step first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/generate/sample-data", {
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        dataType,
        recordCount,
        format,
        model,
      });
      const dataset: SampleDataset = await response.json();
      const currentDatasets = data.sampleDatasets || [];
      onUpdate({ sampleDatasets: [...currentDatasets, dataset] });
      toast({
        title: "Sample data generated",
        description: `Generated ${recordCount} ${dataType} records using ${geminiModelDisplayNames[model]}.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error?.message || "Failed to generate sample data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Sample Data
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[12px]">Upload or generate sample data for your chatbot to reference. Sample data helps your chatbot understand the structure and format of data it might encounter. This can include customer records, product catalogs, order details, or any other relevant data.
</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">What is sample data?</p>
              <p className="text-sm text-muted-foreground">
                Sample data helps your chatbot understand the structure and format of data it might encounter. This can include customer records, product catalogs, order details, or any other relevant data.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Upload Sample Data</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload CSV, JSON, or text files containing sample data
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                    data-testid="input-upload-sample-data"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full"
                    data-testid="button-upload-sample-data"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {isUploading ? "Uploading..." : "Upload File"}
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label htmlFor="dataDescription" className="text-xs">Describe the data you need</Label>
                  <button
                    type="button"
                    onClick={() => setDataType(sampleDataTemplate)}
                    className="text-sm text-primary hover:underline"
                    data-testid="button-use-template-sample-data"
                  >
                    Use Template
                  </button>
                </div>
                <Textarea
                  id="dataDescription"
                  value={dataType}
                  onChange={(e) => setDataType(e.target.value)}
                  placeholder="Describe the sample data you need, e.g.: Generate 10 customer records with names, emails, order IDs, products, and order status. Include a mix of delivered, shipped, and processing orders."
                  className="mt-1 min-h-[270px] resize-y"
                  data-testid="textarea-data-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="recordCount" className="text-xs">Records</Label>
                  <Input
                    id="recordCount"
                    type="number"
                    min={1}
                    max={100}
                    value={recordCount}
                    onChange={(e) => setRecordCount(Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))}
                    className="mt-1"
                    data-testid="input-record-count"
                  />
                </div>
                <div>
                  <Label htmlFor="format" className="text-xs">Format</Label>
                  <select
                    id="format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as "json" | "csv" | "text")}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    data-testid="select-format"
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
                    disabled={isGenerating}
                    className="w-full"
                    data-testid="button-generate-sample-data"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {isGenerating ? "Generating..." : "Generate Sample Data"}
                    <ChevronDown className="h-3 w-3 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                    <DropdownMenuItem
                      key={model}
                      onClick={() => {
                        setSelectedModel(model);
                        handleGenerate(model);
                      }}
                      data-testid={`menu-item-sample-data-model-${model}`}
                    >
                      {geminiModelDisplayNames[model]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {(data.sampleDatasets?.length || 0) > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Uploaded Datasets ({data.sampleDatasets?.length})</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {data.sampleDatasets?.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    data-testid={`sample-dataset-${dataset.id}`}
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
                            AI Generated
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
                        data-testid={`button-view-dataset-${dataset.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveDataset(dataset.id)}
                        data-testid={`button-remove-dataset-${dataset.id}`}
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
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col" data-testid="dialog-dataset-viewer">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2" data-testid="text-dataset-name">
                  <FileText className="h-5 w-5" />
                  {viewingDataset?.name}
                  <Badge variant="outline" className="ml-2">
                    {viewingDataset?.format.toUpperCase()}
                  </Badge>
                  {viewingDataset?.isGenerated && (
                    <Badge variant="secondary">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Generated
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription data-testid="text-dataset-description">
                  {viewingDataset?.description || `Created ${viewingDataset?.createdAt ? new Date(viewingDataset.createdAt).toLocaleDateString() : ''}`}
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0">
                <pre 
                  className="p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap break-words overflow-x-auto"
                  data-testid={`text-dataset-content-${viewingDataset?.id}`}
                >
                  {viewingDataset?.format === 'json' 
                    ? (() => {
                        try {
                          return JSON.stringify(JSON.parse(viewingDataset.content), null, 2);
                        } catch {
                          return viewingDataset.content;
                        }
                      })()
                    : viewingDataset?.content}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
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

function Step7AvailableActions({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);
  const [viewingAction, setViewingAction] = useState<AgentAction | null>(null);
  const [editingAction, setEditingAction] = useState<AgentAction | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showAvailableFields, setShowAvailableFields] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState<{
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

  const availableFields = extractFieldsFromSampleData(data.sampleDatasets || []);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "general",
      confirmationMessage: "",
      successMessage: "",
      requiredFields: [],
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingAction(null);
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (action: AgentAction) => {
    setFormData({
      name: action.name,
      description: action.description,
      category: action.category,
      confirmationMessage: action.confirmationMessage || "",
      successMessage: action.successMessage || "",
      requiredFields: [...action.requiredFields],
    });
    setEditingAction(action);
    setIsAddDialogOpen(true);
  };

  const handleSaveAction = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation error",
        description: "Action name is required",
        variant: "destructive",
      });
      return;
    }

    const invalidFields = formData.requiredFields.filter(f => !f.name.trim() || !f.label.trim());
    if (invalidFields.length > 0) {
      toast({
        title: "Validation error",
        description: "All fields must have a name and label",
        variant: "destructive",
      });
      return;
    }

    const validatedFields = formData.requiredFields.map(f => ({
      ...f,
      name: f.name.trim(),
      label: f.label.trim(),
    }));

    const current = data.availableActions || [];
    
    if (editingAction) {
      const updated = current.map(a => 
        a.id === editingAction.id 
          ? { 
              ...a, 
              name: formData.name.trim(),
              description: formData.description,
              category: formData.category,
              confirmationMessage: formData.confirmationMessage,
              successMessage: formData.successMessage,
              requiredFields: validatedFields, 
              affectedDataFields: validatedFields.map(f => f.name) 
            }
          : a
      );
      onUpdate({ availableActions: updated });
      toast({ title: "Action updated", description: `"${formData.name}" has been updated.` });
    } else {
      const newAction: AgentAction = {
        id: `action_${Date.now()}`,
        name: formData.name.trim(),
        description: formData.description,
        category: formData.category,
        requiredFields: validatedFields,
        confirmationMessage: formData.confirmationMessage,
        successMessage: formData.successMessage,
        affectedDataFields: validatedFields.map(f => f.name),
      };
      onUpdate({ availableActions: [...current, newAction] });
      toast({ title: "Action added", description: `"${formData.name}" has been added.` });
    }
    
    setIsAddDialogOpen(false);
    resetForm();
    setEditingAction(null);
  };

  const addField = () => {
    setFormData(prev => ({
      ...prev,
      requiredFields: [
        ...prev.requiredFields,
        { name: "", type: "string", label: "", required: true },
      ],
    }));
  };

  const updateField = (index: number, updates: Partial<ActionField>) => {
    setFormData(prev => ({
      ...prev,
      requiredFields: prev.requiredFields.map((f, i) => 
        i === index ? { ...f, ...updates } : f
      ),
    }));
  };

  const removeField = (index: number) => {
    setFormData(prev => ({
      ...prev,
      requiredFields: prev.requiredFields.filter((_, i) => i !== index),
    }));
  };

  const addFieldFromSampleData = (field: { name: string; type: string }) => {
    const existingField = formData.requiredFields.find(f => f.name === field.name);
    if (existingField) {
      toast({
        title: "Field already exists",
        description: `"${field.name}" is already added to the action.`,
        variant: "destructive",
      });
      return;
    }
    
    setFormData(prev => ({
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

  const handleGenerate = async (model: GeminiModel) => {
    if (!data.businessUseCase) {
      toast({
        title: "Missing information",
        description: "Please complete the Business Use Case step first.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessUseCase: data.businessUseCase,
          domainKnowledge: data.domainKnowledge,
          domainDocuments: data.domainDocuments,
          model,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate actions');
      }

      const result = await response.json();
      onUpdate({
        availableActions: result.actions,
      });

      toast({
        title: "Actions generated",
        description: `Generated ${result.actions.length} actions based on your sample data.`,
      });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate actions",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveAction = (id: string) => {
    const current = data.availableActions || [];
    onUpdate({ availableActions: current.filter(a => a.id !== id) });
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Available Actions
        </CardTitle>
        <CardDescription>
          Define what actions your agent can simulate. Actions use your sample data to perform operations like updating records, adding entries, or making changes. Make sure to add sample data in Step 6 first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openAddDialog}
              data-testid="button-add-action"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Action
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  disabled={isGenerating}
                  data-testid="button-generate-actions"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {isGenerating ? "Generating..." : "Generate Actions"}
                  <ChevronDown className="h-3 w-3 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => {
                      setSelectedModel(model);
                      handleGenerate(model);
                    }}
                    data-testid={`menu-item-actions-model-${model}`}
                  >
                    {geminiModelDisplayNames[model]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {availableFields.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAvailableFields(!showAvailableFields)}
              data-testid="button-toggle-available-fields"
            >
              <Database className="h-4 w-4 mr-2" />
              {showAvailableFields ? "Hide" : "View"} Available Fields
              {showAvailableFields ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          )}
        </div>

        {showAvailableFields && availableFields.length > 0 && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Fields from Sample Data ({availableFields.length})
            </Label>
            <div className="flex flex-wrap gap-2">
              {availableFields.map((field, idx) => (
                <div
                  key={`${field.name}-${idx}`}
                  className="flex items-center gap-2 p-2 rounded-lg border bg-card text-sm"
                  data-testid={`available-field-${field.name}`}
                >
                  <Badge variant="outline" className="text-xs">{field.type}</Badge>
                  <span className="font-medium">{field.name}</span>
                  <span className="text-xs text-muted-foreground">({field.source})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-4 rounded-lg border bg-muted/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Mock Mode
              </Label>
              <p className="text-xs text-muted-foreground">
                {mockModeDescriptions[data.mockMode || "full"]}
              </p>
            </div>
            <RadioGroup
              value={data.mockMode || "full"}
              onValueChange={(value: MockMode) => onUpdate({ mockMode: value })}
              className="flex gap-2"
              data-testid="radio-mock-mode"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="mock-full" data-testid="radio-mock-full" />
                <Label htmlFor="mock-full" className="text-sm cursor-pointer">Full Mock</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="read_only" id="mock-readonly" data-testid="radio-mock-readonly" />
                <Label htmlFor="mock-readonly" className="text-sm cursor-pointer">Read-Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="disabled" id="mock-disabled" data-testid="radio-mock-disabled" />
                <Label htmlFor="mock-disabled" className="text-sm cursor-pointer">Disabled</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Full Mock:</strong> Agent simulates all actions locally using mock data. No API calls are made.</p>
            <p><strong>Read-Only:</strong> Agent can read real data but simulates write operations locally.</p>
            <p><strong>Disabled:</strong> Agent uses real API calls (requires actual backend integration).</p>
          </div>
        </div>

        {(data.availableActions?.length || 0) > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Actions ({data.availableActions?.length})
            </Label>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {data.availableActions?.map((action) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  data-testid={`action-item-${action.id}`}
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
                      data-testid={`button-view-action-${action.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(action)}
                      data-testid={`button-edit-action-${action.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAction(action.id)}
                      data-testid={`button-remove-action-${action.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(data.availableActions?.length || 0) === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No actions defined yet</p>
            <p className="text-xs mt-1">Click "Add Action" or "Generate Actions" to create actions</p>
          </div>
        )}

        <Dialog open={viewingAction !== null} onOpenChange={(open) => !open && setViewingAction(null)}>
          <DialogContent className="max-w-2xl" data-testid="dialog-action-viewer">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" data-testid="text-action-name">
                <Zap className="h-5 w-5 text-primary" />
                {viewingAction?.name}
                <Badge variant="outline" className="ml-2">
                  {viewingAction?.category}
                </Badge>
              </DialogTitle>
              <DialogDescription data-testid="text-action-description">
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

        <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) { setIsAddDialogOpen(false); setEditingAction(null); resetForm(); } }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="dialog-action-form">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                {editingAction ? "Edit Action" : "Add New Action"}
              </DialogTitle>
              <DialogDescription>
                {editingAction ? "Modify the action details below." : "Define a new action for your agent."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="action-name">Action Name *</Label>
                  <Input
                    id="action-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Update Customer Record"
                    data-testid="input-action-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="action-category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger data-testid="select-action-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {actionCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="action-description">Description</Label>
                <Textarea
                  id="action-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this action does..."
                  className="min-h-[80px]"
                  data-testid="textarea-action-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmation-message">Confirmation Message</Label>
                <Input
                  id="confirmation-message"
                  value={formData.confirmationMessage}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmationMessage: e.target.value }))}
                  placeholder="e.g., Are you sure you want to update this record?"
                  data-testid="input-confirmation-message"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="success-message">Success Message</Label>
                <Input
                  id="success-message"
                  value={formData.successMessage}
                  onChange={(e) => setFormData(prev => ({ ...prev, successMessage: e.target.value }))}
                  placeholder="e.g., Record updated successfully!"
                  data-testid="input-success-message"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Required Fields ({formData.requiredFields.length})</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addField}
                    data-testid="button-add-field"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Field
                  </Button>
                </div>

                {availableFields.length > 0 && (
                  <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
                    <Label className="text-xs text-muted-foreground">Quick add from sample data:</Label>
                    <div className="flex flex-wrap gap-1">
                      {availableFields.slice(0, 10).map((field, idx) => (
                        <Button
                          key={`${field.name}-${idx}`}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addFieldFromSampleData(field)}
                          data-testid={`button-quick-add-field-${field.name}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {field.name}
                        </Button>
                      ))}
                      {availableFields.length > 10 && (
                        <span className="text-xs text-muted-foreground self-center ml-2">
                          +{availableFields.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {formData.requiredFields.length > 0 && (
                  <div className="space-y-2">
                    {formData.requiredFields.map((field, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-3 rounded-lg border bg-card" data-testid={`field-row-${idx}`}>
                        <div className="flex-1 grid grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={field.name}
                              onChange={(e) => updateField(idx, { name: e.target.value })}
                              placeholder="fieldName"
                              className="h-8 text-sm"
                              data-testid={`input-field-name-${idx}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Label</Label>
                            <Input
                              value={field.label}
                              onChange={(e) => updateField(idx, { label: e.target.value })}
                              placeholder="Field Label"
                              className="h-8 text-sm"
                              data-testid={`input-field-label-${idx}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Select
                              value={field.type}
                              onValueChange={(value) => updateField(idx, { type: value as ActionField["type"] })}
                            >
                              <SelectTrigger className="h-8" data-testid={`select-field-type-${idx}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldTypes.map(t => (
                                  <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex items-center gap-1.5 pb-2">
                              <Checkbox
                                id={`required-${idx}`}
                                checked={field.required}
                                onCheckedChange={(checked) => updateField(idx, { required: checked === true })}
                                data-testid={`checkbox-field-required-${idx}`}
                              />
                              <Label htmlFor={`required-${idx}`} className="text-xs cursor-pointer">Req</Label>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeField(idx)}
                              data-testid={`button-remove-field-${idx}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {formData.requiredFields.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg">
                    No fields added yet. Click "Add Field" or use quick add from sample data.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setIsAddDialogOpen(false); setEditingAction(null); resetForm(); }}
                data-testid="button-cancel-action"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveAction}
                data-testid="button-save-action"
              >
                {editingAction ? "Update Action" : "Add Action"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}

// Generate manual template based on Anthropic's prompt engineering best practices
function generateManualTemplate(data: WizardStepData): string {
  const agentName = data.name || "[Agent Name]";
  const businessUseCase = data.businessUseCase || "[Describe the agent's purpose and what problems it solves]";
  
  // Build CONSTRAINTS section from validation rules and guardrails
  let constraintsContent = "";
  if (data.validationRules || data.guardrails) {
    const validationLines = data.validationRules?.split('\n').filter(l => l.trim()).map(l => {
      const trimmed = l.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) return `- Must ${trimmed.slice(1).trim()}`;
      return `- Must ${trimmed}`;
    }).join('\n') || "";
    
    const guardrailLines = data.guardrails?.split('\n').filter(l => l.trim()).map(l => {
      const trimmed = l.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•')) return `- Cannot ${trimmed.slice(1).trim()}`;
      return `- Cannot ${trimmed}`;
    }).join('\n') || "";
    
    constraintsContent = [validationLines, guardrailLines].filter(Boolean).join('\n');
  } else {
    constraintsContent = `- Must [add validation requirement here]
- Must [add required format here]
- Cannot [add restriction here]
- Cannot [add topic to avoid here]
- Should [add guideline here]`;
  }

  // Build INPUT section with domain knowledge and sample data
  let inputContent = "";
  
  // Domain knowledge part
  if (data.domainKnowledge || (data.domainDocuments && data.domainDocuments.length > 0)) {
    const docsContent = data.domainDocuments?.map(doc => doc.content).join("\n\n") || "";
    inputContent = `<knowledge>
${data.domainKnowledge || ""}
${docsContent}
</knowledge>`;
  }
  
  // Sample data part - use placeholder or actual data
  if (data.sampleDatasets && data.sampleDatasets.length > 0) {
    const datasetsContent = data.sampleDatasets.map(ds => ds.content).join("\n\n");
    inputContent += `\n\n<data>
${datasetsContent}
</data>`;
  } else {
    inputContent += `\n\n<data>
[Sample data will be included here when configured]
</data>`;
  }
  
  if (!inputContent.includes('<knowledge>')) {
    inputContent = `<knowledge>
[Add domain-specific knowledge, policies, or reference materials here]
</knowledge>` + inputContent;
  }

  // Build TASK section with available actions
  let taskContent = `1. Read and understand the user's request
2. Check if relevant information exists in the INPUT data
3. Formulate a helpful, accurate response`;
  
  if (data.availableActions && data.availableActions.length > 0) {
    const actionsContent = data.availableActions.map((action, i) => {
      const fields = action.requiredFields?.length 
        ? ` (requires: ${action.requiredFields.map(f => f.name).join(", ")})`
        : "";
      return `${i + 4}. If applicable, execute action: ${action.name}${fields}`;
    }).join('\n');
    taskContent += `\n${actionsContent}`;
  } else {
    taskContent += `\n4. If an action is needed, execute the appropriate available action`;
  }

  return `ROLE
You are ${agentName}, a specialized AI assistant designed to help users with their requests.

GOAL
${businessUseCase}

Success looks like: Users receive accurate, helpful responses that address their needs efficiently.

CONSTRAINTS
${constraintsContent}

INPUT
${inputContent}

TASK
${taskContent}

OUTPUT FORMAT
- Use clear, conversational language appropriate to the context
- Structure complex information with bullet points or numbered lists
- Keep responses concise but complete
- When presenting a new calculated column or expression, suggest a descriptive column name displayed in bold
- When executing actions, confirm what you are doing before proceeding
- If you cannot help, explain why and suggest alternatives

EXAMPLES
Example 1:
Input: [Sample user question relevant to your use case]
Output: [Expected response format and content]

Example 2:
Input: [Another sample user question]
Output: [Expected response format and content]

VERIFICATION CHECKLIST
Before responding, verify:
- [ ] Response directly addresses the user's question
- [ ] Information is accurate based on the provided INPUT data
- [ ] Response follows the CONSTRAINTS
- [ ] Format is appropriate for the content
- [ ] Any actions are properly confirmed before execution`;
}

type CheckStatus = 'pass' | 'fail' | 'unable_to_verify';
type CheckResult = {
  id: string;
  category: 'separation' | 'completeness' | 'clarity' | 'compatibility';
  label: string;
  status: CheckStatus;
  detail: string;
};

function runValidationChecklist(data: WizardStepData): CheckResult[] {
  const results: CheckResult[] = [];
  const techKeywords = ["API", "endpoint", "database", "SQL", "function", "class", "JSON", "schema", "HTTP", "REST", "GraphQL", "SDK", "middleware", "backend", "frontend", "server", "deploy"];
  const imperativePatterns = /^(Must|Never|Always|Do not|Ensure|Verify|Reject|Deny)\b/;
  const guardrailLanguage = /\b(Never|Always|Under no circumstances|Absolutely)\b/i;
  const conditionalPatterns = /^(if|when|check that|validate|verify that|ensure that)\b/i;
  const crossRefPhrases = ["as mentioned above", "see above", "as noted in", "refer to", "as described in", "mentioned earlier"];
  const metaPhrases = ["this agent", "the agent should", "our agent", "my agent will"];

  const textFields: { key: string; value: string }[] = [
    { key: "Business Use Case", value: data.businessUseCase },
    { key: "Domain Knowledge", value: data.domainKnowledge },
    { key: "Validation Rules", value: data.validationRules },
    { key: "Guardrails", value: data.guardrails },
  ];

  // 1. Business Use Case - no technical details
  if (!data.businessUseCase.trim()) {
    results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "unable_to_verify", detail: "Business Use Case not provided" });
  } else {
    const foundTech = techKeywords.filter(kw => data.businessUseCase.toLowerCase().includes(kw.toLowerCase()));
    if (foundTech.length > 0) {
      results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "fail", detail: `Found technical terms: ${foundTech.join(", ")}` });
    } else {
      results.push({ id: "sep-1", category: "separation", label: "Business Use Case contains ONLY what the agent does for users (no technical details)", status: "pass", detail: "No technical details found" });
    }
  }

  // 2. Domain Knowledge - only facts, no rules
  if (!data.domainKnowledge.trim()) {
    results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "unable_to_verify", detail: "Domain Knowledge not provided" });
  } else {
    const lines = data.domainKnowledge.split("\n").filter(l => l.trim());
    const ruleLines = lines.filter(l => imperativePatterns.test(l.trim()));
    if (ruleLines.length > 0) {
      results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "fail", detail: `Found ${ruleLines.length} rule-like line(s): "${ruleLines[0].trim().substring(0, 50)}..."` });
    } else {
      results.push({ id: "sep-2", category: "separation", label: "Domain Knowledge contains ONLY facts and explanations (no rules or commands)", status: "pass", detail: "No rule-like patterns found" });
    }
  }

  // 3. Validation Rules - no guardrail language
  if (!data.validationRules.trim()) {
    results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "unable_to_verify", detail: "Validation Rules not provided" });
  } else {
    if (guardrailLanguage.test(data.validationRules)) {
      results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "fail", detail: "Contains guardrail-like language that belongs in Guardrails" });
    } else {
      results.push({ id: "sep-3", category: "separation", label: "Validation Rules contains ONLY 'if this, then that' logic and checks", status: "pass", detail: "No guardrail-like language found" });
    }
  }

  // 4. Guardrails - no conditional logic
  if (!data.guardrails.trim()) {
    results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "unable_to_verify", detail: "Guardrails not provided" });
  } else {
    const gLines = data.guardrails.split("\n").filter(l => l.trim());
    const conditionalLines = gLines.filter(l => conditionalPatterns.test(l.trim()));
    if (conditionalLines.length > 0) {
      results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "fail", detail: "Contains conditional logic that belongs in Validation Rules" });
    } else {
      results.push({ id: "sep-4", category: "separation", label: "Guardrails contains ONLY absolute 'always/never' statements", status: "pass", detail: "No conditional logic found" });
    }
  }

  // 5. Sample Data - no comments
  if (!data.sampleDatasets || data.sampleDatasets.length === 0) {
    results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "unable_to_verify", detail: "No sample data provided" });
  } else {
    const jsonDatasets = data.sampleDatasets.filter(d => d.format === "json");
    const hasComments = jsonDatasets.some(d => /\/\/|\/\*|\*\//.test(d.content));
    if (hasComments) {
      results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "fail", detail: "JSON data contains comments (// or /* */)" });
    } else {
      results.push({ id: "sep-5", category: "separation", label: "Sample Data is pure data with no explanatory comments", status: "pass", detail: "No comments found in sample data" });
    }
  }

  // 6. Available Actions formatting
  if (!data.availableActions || data.availableActions.length === 0) {
    results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "unable_to_verify", detail: "No actions defined" });
  } else {
    const badActions = data.availableActions.filter(a => !a.name || !a.description);
    if (badActions.length > 0) {
      results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "fail", detail: `${badActions.length} action(s) missing name or description` });
    } else {
      results.push({ id: "sep-6", category: "separation", label: "Available Actions are clearly formatted", status: "pass", detail: "All actions have name and description" });
    }
  }

  // 7. Completeness - validation rules reference actions
  if (!data.validationRules.trim() || !data.availableActions || data.availableActions.length === 0) {
    results.push({ id: "comp-1", category: "completeness", label: "All validation rules reference available actions", status: "unable_to_verify", detail: "Validation Rules or Available Actions not provided" });
  } else {
    results.push({ id: "comp-1", category: "completeness", label: "All validation rules reference available actions", status: "pass", detail: "Both validation rules and actions are defined" });
  }

  // 8. Guardrails don't contradict validation rules
  if (!data.guardrails.trim() || !data.validationRules.trim()) {
    results.push({ id: "comp-2", category: "completeness", label: "Guardrails don't contradict Validation Rules", status: "unable_to_verify", detail: "Guardrails or Validation Rules not provided" });
  } else {
    results.push({ id: "comp-2", category: "completeness", label: "Guardrails don't contradict Validation Rules", status: "pass", detail: "Both fields are filled; no obvious contradictions detected" });
  }

  // 9. Sample Data covers domain terms
  if (!data.sampleDatasets || data.sampleDatasets.length === 0 || !data.domainKnowledge.trim()) {
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
  if (!data.domainKnowledge.trim()) {
    results.push({ id: "clar-2", category: "clarity", label: "Technical terms defined in Domain Knowledge before use elsewhere", status: "unable_to_verify", detail: "Domain Knowledge not provided" });
  } else {
    results.push({ id: "clar-2", category: "clarity", label: "Technical terms defined in Domain Knowledge before use elsewhere", status: "pass", detail: "Domain Knowledge is present" });
  }

  // 12. Action names clear
  if (!data.availableActions || data.availableActions.length === 0) {
    results.push({ id: "clar-3", category: "clarity", label: "Action names are clear and self-explanatory", status: "unable_to_verify", detail: "No actions defined" });
  } else {
    const unclear = data.availableActions.filter(a => !a.name || a.name.length < 2 || !a.description);
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

function Step8ValidationChecklist({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [showMistakesModal, setShowMistakesModal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setCheckResults(runValidationChecklist(data));
  }, []);

  const rerunChecks = () => {
    setCheckResults(runValidationChecklist(data));
  };

  const failCount = checkResults.filter(r => r.status === "fail").length;
  const passCount = checkResults.filter(r => r.status === "pass").length;
  const unverifiedCount = checkResults.filter(r => r.status === "unable_to_verify").length;
  const allPass = failCount === 0 && unverifiedCount === 0 && passCount > 0;
  const allUnverified = passCount === 0 && failCount === 0 && unverifiedCount > 0;

  const techKeywords = ["API", "endpoint", "database", "SQL", "function", "class", "JSON", "schema", "HTTP", "REST", "GraphQL", "SDK", "middleware", "backend", "frontend", "server", "deploy"];
  const imperativePatterns = /^(Must|Never|Always|Do not|Ensure|Verify|Reject|Deny)\b/;
  const guardrailLanguageRe = /\b(Never|Always|Under no circumstances|Absolutely)\b/i;
  const conditionalPatterns = /^(if|when|check that|validate|verify that|ensure that)\b/i;
  const crossRefPhrases = ["as mentioned above", "see above", "as noted in", "refer to", "as described in", "mentioned earlier"];
  const metaPhrases = ["this agent", "the agent should", "our agent", "my agent will"];

  const handleAutoFix = () => {
    const updates: Partial<WizardStepData> = {};

    // Fix businessUseCase - remove lines with technical keywords
    if (data.businessUseCase.trim()) {
      const lines = data.businessUseCase.split("\n");
      const filtered = lines.filter(line => {
        const lower = line.toLowerCase();
        return !techKeywords.some(kw => lower.includes(kw.toLowerCase()));
      });
      if (filtered.length !== lines.length) {
        updates.businessUseCase = filtered.join("\n");
      }
    }

    // Fix domainKnowledge - move rule-like lines to validationRules
    if (data.domainKnowledge.trim()) {
      const lines = data.domainKnowledge.split("\n");
      const ruleLines: string[] = [];
      const kept: string[] = [];
      for (const line of lines) {
        if (imperativePatterns.test(line.trim())) {
          ruleLines.push(line);
        } else {
          kept.push(line);
        }
      }
      if (ruleLines.length > 0) {
        updates.domainKnowledge = kept.join("\n");
        updates.validationRules = (data.validationRules ? data.validationRules + "\n" : "") + ruleLines.join("\n");
      }
    }

    // Fix validationRules - move guardrail language to guardrails
    const currentValidationRules = updates.validationRules ?? data.validationRules;
    if (currentValidationRules.trim()) {
      const lines = currentValidationRules.split("\n");
      const guardrailLines: string[] = [];
      const kept: string[] = [];
      for (const line of lines) {
        if (guardrailLanguageRe.test(line.trim())) {
          guardrailLines.push(line);
        } else {
          kept.push(line);
        }
      }
      if (guardrailLines.length > 0) {
        updates.validationRules = kept.join("\n");
        updates.guardrails = (data.guardrails ? data.guardrails + "\n" : "") + guardrailLines.join("\n");
      }
    }

    // Fix guardrails - move conditional logic to validationRules
    const currentGuardrails = updates.guardrails ?? data.guardrails;
    if (currentGuardrails.trim()) {
      const lines = currentGuardrails.split("\n");
      const condLines: string[] = [];
      const kept: string[] = [];
      for (const line of lines) {
        if (conditionalPatterns.test(line.trim())) {
          condLines.push(line);
        } else {
          kept.push(line);
        }
      }
      if (condLines.length > 0) {
        updates.guardrails = kept.join("\n");
        const vr = updates.validationRules ?? data.validationRules;
        updates.validationRules = (vr ? vr + "\n" : "") + condLines.join("\n");
      }
    }

    // Fix cross-references
    const allTextKeys: (keyof WizardStepData)[] = ["businessUseCase", "domainKnowledge", "validationRules", "guardrails"];
    for (const key of allTextKeys) {
      let val = (updates[key] as string) ?? (data[key] as string);
      if (!val || !val.trim()) continue;
      let changed = false;
      for (const phrase of crossRefPhrases) {
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

    // Fix meta-comments - remove lines with meta phrases
    for (const key of allTextKeys) {
      let val = (updates[key] as string) ?? (data[key] as string);
      if (!val || !val.trim()) continue;
      const lines = val.split("\n");
      const filtered = lines.filter(line => {
        const lower = line.toLowerCase();
        return !metaPhrases.some(p => lower.includes(p));
      });
      if (filtered.length !== lines.length) {
        (updates as any)[key] = filtered.join("\n");
      }
    }

    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
      toast({
        title: "Auto-fix applied!",
        description: "Review the changes in previous steps.",
      });
    }

    setTimeout(() => {
      setCheckResults(runValidationChecklist({ ...data, ...updates }));
    }, 100);
  };

  const categoryLabels: Record<string, string> = {
    separation: "Separation of Concerns",
    completeness: "Completeness",
    clarity: "Clarity",
    compatibility: "Wizard Compatibility",
  };

  const categories: Array<'separation' | 'completeness' | 'clarity' | 'compatibility'> = ["separation", "completeness", "clarity", "compatibility"];

  const getStatusIcon = (status: CheckStatus) => {
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
          <Button variant="outline" size="sm" onClick={() => setShowMistakesModal(true)} data-testid="button-common-mistakes">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Common Mistakes to Avoid
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {allPass && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3" data-testid="alert-all-pass">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-sm font-medium text-green-800 dark:text-green-300">All checks passed!</span>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3" data-testid="alert-issues-found">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-300">{failCount} issue{failCount !== 1 ? "s" : ""} found. Would you like to try to fix these automatically?</span>
                <div>
                  <Button size="sm" variant="outline" onClick={handleAutoFix} data-testid="button-auto-fix">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Auto-Fix Issues
                  </Button>
                </div>
              </div>
            </div>
          )}
          {allUnverified && (
            <div className="flex items-center gap-2 rounded-md border p-3" data-testid="alert-all-unverified">
              <Info className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Fill in more fields in the previous steps for validation checks to work.</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={rerunChecks} data-testid="button-rerun-checks">
              <RotateCcw className="h-4 w-4 mr-2" />
              Re-run Checks
            </Button>
          </div>

          {categories.map(cat => {
            const catResults = checkResults.filter(r => r.category === cat);
            if (catResults.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold">{categoryLabels[cat]}</h3>
                <div className="space-y-1.5">
                  {catResults.map(result => (
                    <div key={result.id} className="flex items-start gap-2 text-sm py-1" data-testid={`check-result-${result.id}`}>
                      {getStatusIcon(result.status)}
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

    <Dialog open={showMistakesModal} onOpenChange={setShowMistakesModal}>
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

function Step8Review({
  data,
  onUpdate,
  agentId,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
  agentId?: string;
}) {
  const [editedPrompt, setEditedPrompt] = useState(data.customPrompt || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);
  const [pendingGeneratedPrompt, setPendingGeneratedPrompt] = useState<string | null>(null);
  const [promptLastRevisedBy, setPromptLastRevisedBy] = useState<string | null>(null);
  const [promptLastRevisedAt, setPromptLastRevisedAt] = useState<string | null>(null);
  const [isOutOfSync, setIsOutOfSync] = useState(false);
  const { toast } = useToast();

  const hasBusinessUseCase = !!(data.businessUseCase && data.businessUseCase.trim());
  const hasExistingPrompt = !!(data.customPrompt && data.customPrompt.trim());

  useEffect(() => {
    setEditedPrompt(data.customPrompt || "");
  }, [data.customPrompt]);

  useEffect(() => {
    if (!agentId) return;
    const checkSync = async () => {
      try {
        const response = await fetch(`/api/agents/${agentId}/prompt-sync-status`, { credentials: "include" });
        if (response.ok) {
          const status = await response.json();
          setIsOutOfSync(!status.isInSync);
          setPromptLastRevisedBy(status.promptLastRevisedBy);
          setPromptLastRevisedAt(status.promptLastRevisedAt);
        }
      } catch {}
    };
    checkSync();
  }, [agentId, data.customPrompt]);

  const savePrompt = async (prompt: string, revisedBy: "user" | "ai-generate") => {
    if (!agentId) {
      onUpdate({ customPrompt: prompt });
      toast({ title: "Prompt saved", description: "Your changes have been saved." });
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiRequest("POST", `/api/agents/${agentId}/save-prompt`, {
        customPrompt: prompt,
        revisedBy,
      });
      const result = await response.json();
      onUpdate({ customPrompt: prompt });
      setPromptLastRevisedBy(result.promptLastRevisedBy);
      setPromptLastRevisedAt(result.promptLastRevisedAt);
      setIsOutOfSync(false);
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      toast({
        title: "Prompt saved",
        description: revisedBy === "ai-generate"
          ? "AI-generated prompt has been saved."
          : "Your changes have been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to save prompt",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const generatePromptFromAPI = async (model?: GeminiModel) => {
    const modelToUse = model || selectedModel;
    if (!data.name || !data.businessUseCase) {
      const fallback = generatePromptPreview("gemini", data);
      setPendingGeneratedPrompt(fallback);
      return;
    }
    
    setIsGenerating(true);
    setGenerationError(null);
    setPendingGeneratedPrompt(null);
    try {
      const response = await apiRequest("POST", "/api/generate/system-prompt", {
        name: data.name,
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        domainDocuments: data.domainDocuments,
        validationRules: data.validationRules,
        guardrails: data.guardrails,
        promptStyle: "gemini",
        model: modelToUse,
      });
      const result = await response.json();
      if (hasExistingPrompt) {
        setPendingGeneratedPrompt(result.systemPrompt);
      } else {
        await savePrompt(result.systemPrompt, "ai-generate");
      }
    } catch (error: any) {
      console.error("Failed to generate system prompt:", error);
      setGenerationError(error.message || "Failed to generate prompt");
      const fallback = generatePromptPreview("gemini", data);
      setPendingGeneratedPrompt(fallback);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveEdit = () => {
    savePrompt(editedPrompt, "user");
    setIsEditing(false);
  };

  const handleAcceptGenerated = () => {
    if (pendingGeneratedPrompt) {
      savePrompt(pendingGeneratedPrompt, "ai-generate");
      setPendingGeneratedPrompt(null);
    }
  };

  const handleDiscardGenerated = () => {
    setPendingGeneratedPrompt(null);
  };

  const formatRevisedBy = (source: string | null) => {
    if (!source) return null;
    const labels: Record<string, string> = {
      "user": "User (manual edit)",
      "prompt-coach": "Prompt Coach",
      "ai-generate": "AI Generate",
    };
    return labels[source] || source;
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return "";
    try {
      const date = new Date(ts);
      return date.toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    } catch { return ts; }
  };

  const domainDocsCount = data.domainDocuments?.length || 0;
  const domainKnowledgeValue = data.domainKnowledge 
    ? data.domainKnowledge 
    : (domainDocsCount > 0 ? `${domainDocsCount} document(s) uploaded` : "");
  const sampleDatasetsCount = data.sampleDatasets?.length || 0;
  const sampleDatasetsValue = sampleDatasetsCount > 0 
    ? `${sampleDatasetsCount} dataset(s) configured` 
    : "";
  const actionsCount = data.availableActions?.length || 0;
  const actionsValue = actionsCount > 0 
    ? `${actionsCount} action(s) defined` 
    : "";

  const sections = [
    { label: "Business Use Case", value: data.businessUseCase, icon: Briefcase },
    { label: "Agent Name", value: data.name, icon: Bot },
    { label: "Domain Knowledge", value: domainKnowledgeValue, icon: BookOpen, optional: true },
    { label: "Validation Rules", value: data.validationRules, icon: Shield, optional: true },
    { label: "Guardrails", value: data.guardrails, icon: AlertTriangle, optional: true },
    { label: "Sample Data", value: sampleDatasetsValue, icon: Database, optional: true },
    { label: "Available Actions", value: actionsValue, icon: Zap, optional: true },
  ];

  const ConfigReviewSummary = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          Review Configuration
        </CardTitle>
        <CardDescription>
          Review your agent configuration before creating the prompt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.label} className="flex items-start gap-2">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-xs">{section.label}</h4>
                    {section.optional && !section.value && (
                      <Badge variant="secondary" className="text-xs py-0 h-4">Not set</Badge>
                    )}
                  </div>
                  <p
                    className="text-xs text-muted-foreground mt-0.5 break-words line-clamp-2"
                    data-testid={`review-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {section.value ? (
                      section.value.length > 80 ? section.value.slice(0, 80) + "..." : section.value
                    ) : (
                      <span className="italic">Not provided</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <ConfigReviewSummary />

      {isOutOfSync && hasExistingPrompt && (
        <div className="flex items-start gap-3 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30" data-testid="prompt-out-of-sync-warning">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Configuration has changed</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
              Your agent's configuration fields have been updated since this prompt was last saved. You may want to regenerate the prompt or manually update it to reflect the latest changes.
            </p>
          </div>
        </div>
      )}

      {pendingGeneratedPrompt && (
        <Card data-testid="card-pending-generated-prompt">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              New AI-Generated Prompt
            </CardTitle>
            <CardDescription>
              Review the generated prompt below. You can replace your current prompt or discard this version.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-muted/50 p-4 text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto" data-testid="preview-generated-prompt">
              {pendingGeneratedPrompt}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDiscardGenerated}
                data-testid="button-discard-generated"
              >
                <X className="h-3 w-3 mr-1" />
                Discard
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleAcceptGenerated}
                disabled={isSaving}
                data-testid="button-replace-prompt"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Replace Current Prompt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                Agent Prompt
              </CardTitle>
              <CardDescription>
                {hasExistingPrompt
                  ? "View and edit your agent's system prompt. Click Edit to make changes, then Save."
                  : "Create your agent's system prompt using AI generation or write it manually."
                }
              </CardDescription>
            </div>
          </div>
          {promptLastRevisedBy && promptLastRevisedAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1" data-testid="text-last-revised">
              <User className="h-3 w-3 shrink-0" />
              <span>Last revised by <span className="font-medium">{formatRevisedBy(promptLastRevisedBy)}</span> &mdash; {formatTimestamp(promptLastRevisedAt)}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {hasBusinessUseCase && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isGenerating}
                      data-testid="button-ai-generate-prompt"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      {isGenerating ? "Generating..." : "AI Generate"}
                      {!isGenerating && <ChevronDown className="h-3 w-3 ml-1" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                      <DropdownMenuItem
                        key={model}
                        onClick={() => {
                          setSelectedModel(model);
                          generatePromptFromAPI(model);
                        }}
                        data-testid={`menu-item-prompt-model-${model}`}
                      >
                        {geminiModelDisplayNames[model]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!hasExistingPrompt && !isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const template = generateManualTemplate(data);
                    setEditedPrompt(template);
                    setIsEditing(true);
                  }}
                  data-testid="button-create-manual-prompt"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Create Manually
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasExistingPrompt && !isEditing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditedPrompt(data.customPrompt || "");
                    setIsEditing(true);
                  }}
                  data-testid="button-edit-prompt"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditedPrompt(data.customPrompt || "");
                      setIsEditing(false);
                    }}
                    data-testid="button-cancel-edit-prompt"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={isSaving || editedPrompt === data.customPrompt}
                    data-testid="button-save-prompt"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>

          {generationError && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="h-3 w-3" />
              {generationError} - Using fallback template.
            </div>
          )}

          {isGenerating ? (
            <div 
              className="rounded-md bg-muted/50 p-4 min-h-[400px] flex flex-col items-center justify-center gap-3"
              data-testid="prompt-loading"
            >
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating prompt with AI...</p>
            </div>
          ) : isEditing ? (
            <Textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              className="min-h-[400px] resize-y font-mono text-xs"
              data-testid="textarea-edit-prompt"
            />
          ) : hasExistingPrompt ? (
            <div 
              className="rounded-md bg-muted/50 p-4 text-xs font-mono whitespace-pre-wrap max-h-[500px] overflow-y-auto"
              data-testid="prompt-preview"
            >
              {data.customPrompt}
            </div>
          ) : (
            <div 
              className="rounded-md bg-muted/50 p-8 flex flex-col items-center justify-center gap-3 text-center"
              data-testid="prompt-empty-state"
            >
              <Code className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No prompt created yet.</p>
              <p className="text-xs text-muted-foreground">Use AI Generate or Create Manually to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Step10WelcomeScreen({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const hasGenerated = useRef(false);

  const welcomeConfig: WelcomeConfig = data.welcomeConfig || {
    enabled: true,
    greeting: "",
    suggestedPrompts: [],
  };

  const updateConfig = (updates: Partial<WelcomeConfig>) => {
    onUpdate({ welcomeConfig: { ...welcomeConfig, ...updates } });
  };

  const generateWelcomeConfig = async () => {
    if (!data.businessUseCase?.trim()) {
      toast({
        title: "Missing business use case",
        description: "Please provide a business use case in Step 1 to auto-generate the welcome screen.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const sampleDataString = data.sampleDatasets?.length
        ? data.sampleDatasets.map((s: any) => `${s.name || "Sample"}:\n${typeof s.content === 'string' ? s.content : JSON.stringify(s.content)}`).join("\n\n")
        : undefined;
      const response = await apiRequest("POST", "/api/generate/welcome-config", {
        name: data.name,
        businessUseCase: data.businessUseCase,
        domainKnowledge: data.domainKnowledge,
        sampleData: sampleDataString,
      });
      const result = await response.json();
      onUpdate({
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
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!hasGenerated.current && !data.welcomeConfig && data.businessUseCase?.trim()) {
      hasGenerated.current = true;
      generateWelcomeConfig();
    }
  }, []);

  const addPrompt = () => {
    const newPrompt: WelcomePrompt = {
      id: uuidv4(),
      title: "",
      prompt: "",
    };
    updateConfig({
      suggestedPrompts: [...welcomeConfig.suggestedPrompts, newPrompt],
    });
  };

  const removePrompt = (id: string) => {
    updateConfig({
      suggestedPrompts: welcomeConfig.suggestedPrompts.filter((p) => p.id !== id),
    });
  };

  const updatePrompt = (id: string, updates: Partial<WelcomePrompt>) => {
    updateConfig({
      suggestedPrompts: welcomeConfig.suggestedPrompts.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
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
              <Label htmlFor="welcome-enabled">Enable Welcome Screen</Label>
              <p className="text-sm text-muted-foreground">
                Show a greeting and suggested prompts when users open the chat
              </p>
            </div>
            <Switch
              id="welcome-enabled"
              checked={welcomeConfig.enabled}
              onCheckedChange={(checked) => updateConfig({ enabled: checked })}
              data-testid="switch-welcome-enabled"
            />
          </div>

          {welcomeConfig.enabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <Label htmlFor="greeting">Greeting Message</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateWelcomeConfig}
                    disabled={isGenerating}
                    data-testid="button-regenerate-welcome"
                  >
                    {isGenerating ? (
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
                  id="greeting"
                  placeholder="e.g., Hi there! I'm your assistant. How can I help you today?"
                  value={welcomeConfig.greeting}
                  onChange={(e) => updateConfig({ greeting: e.target.value })}
                  className="resize-none"
                  rows={3}
                  data-testid="textarea-welcome-greeting"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <Label>Suggested Prompts</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addPrompt}
                    data-testid="button-add-prompt"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Prompt
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Quick-start prompts that users can click to begin a conversation.
                </p>

                {isGenerating ? (
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
                      <Card key={prompt.id} data-testid={`card-prompt-${prompt.id}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <Input
                                placeholder="Prompt title (e.g., Check my order status)"
                                value={prompt.title}
                                onChange={(e) => updatePrompt(prompt.id, { title: e.target.value })}
                                data-testid={`input-prompt-title-${prompt.id}`}
                              />
                              <Textarea
                                placeholder="Full prompt text (e.g., I'd like to check the status of my recent order)"
                                value={prompt.prompt}
                                onChange={(e) => updatePrompt(prompt.id, { prompt: e.target.value })}
                                className="resize-none"
                                rows={2}
                                data-testid={`textarea-prompt-text-${prompt.id}`}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePrompt(prompt.id)}
                              data-testid={`button-remove-prompt-${prompt.id}`}
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
                      <p className="text-foreground" data-testid="text-preview-greeting">
                        {welcomeConfig.greeting || "Hi there! How can I help you today?"}
                      </p>
                      {welcomeConfig.suggestedPrompts.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mt-2">
                          {welcomeConfig.suggestedPrompts.map((prompt) => (
                            <Badge
                              key={prompt.id}
                              variant="outline"
                              className="cursor-pointer"
                              data-testid={`badge-preview-prompt-${prompt.id}`}
                            >
                              {prompt.title || "Untitled prompt"}
                            </Badge>
                          ))}
                        </div>
                      )}
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

export default function CreateAgent() {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const draftId = params.id;
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [formData, setFormData] = useState<WizardStepData>({
    businessUseCase: "",
    name: "",
    description: "",
    domainKnowledge: "",
    domainDocuments: [],
    sampleDatasets: [],
    validationRules: "",
    guardrails: "",
    promptStyle: "gemini",
    customPrompt: "",
    clarifyingInsights: [],
    availableActions: [],
    mockUserState: [],
    mockMode: "full",
  });

  // Fetch existing draft if editing
  const { data: existingAgent, isLoading: isLoadingDraft } = useQuery<Agent>({
    queryKey: ["/api/agents", draftId],
    enabled: !!draftId,
  });

  // Load draft data when fetched
  useEffect(() => {
    if (existingAgent && !isInitialized) {
      setFormData({
        businessUseCase: existingAgent.businessUseCase || "",
        name: existingAgent.name || "",
        description: existingAgent.description || "",
        domainKnowledge: existingAgent.domainKnowledge || "",
        domainDocuments: existingAgent.domainDocuments || [],
        sampleDatasets: existingAgent.sampleDatasets || [],
        validationRules: existingAgent.validationRules || "",
        guardrails: existingAgent.guardrails || "",
        promptStyle: existingAgent.promptStyle || "gemini",
        customPrompt: existingAgent.customPrompt || "",
        clarifyingInsights: existingAgent.clarifyingInsights || [],
        availableActions: existingAgent.availableActions || [],
        mockUserState: existingAgent.mockUserState || [],
        mockMode: existingAgent.mockMode || "full",
      });
      setCurrentStep(existingAgent.configurationStep || 1);
      setIsInitialized(true);
    }
  }, [existingAgent, isInitialized]);

  // Mark as initialized for new agents
  useEffect(() => {
    if (!draftId) {
      setIsInitialized(true);
    }
  }, [draftId]);

  const createMutation = useMutation({
    mutationFn: async (data: WizardStepData & { status?: string; configurationStep?: number }) => {
      const response = await apiRequest("POST", "/api/agents", data);
      return await response.json() as Agent;
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Agent created!",
        description: `${agent.name} has been successfully created.`,
      });
      navigate(`/chat/${agent.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create agent",
        variant: "destructive",
      });
    },
  });

  // Save draft mutation (update existing or create new)
  const saveDraftMutation = useMutation({
    mutationFn: async (data: { formData: WizardStepData; step: number }) => {
      if (draftId) {
        // Update existing draft
        const response = await apiRequest("PATCH", `/api/agents/${draftId}`, {
          ...data.formData,
          status: "draft",
          configurationStep: data.step,
        });
        return await response.json() as Agent;
      } else {
        // Create new draft
        const response = await apiRequest("POST", "/api/agents", {
          ...data.formData,
          status: "draft",
          configurationStep: data.step,
        });
        return await response.json() as Agent;
      }
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
      toast({
        title: "Draft saved!",
        description: "Your progress has been saved. You can continue later.",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save draft",
        variant: "destructive",
      });
    },
  });

  // Update mutation for completing a draft
  const updateMutation = useMutation({
    mutationFn: async (data: WizardStepData) => {
      const response = await apiRequest("PATCH", `/api/agents/${draftId}`, {
        ...data,
        status: "configured",
        configurationStep: 10,
      });
      return await response.json() as Agent;
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agent.id] });
      toast({
        title: "Agent updated!",
        description: `${agent.name} has been successfully configured.`,
      });
      navigate(`/chat/${agent.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update agent",
        variant: "destructive",
      });
    },
  });

  const handleSaveDraft = () => {
    saveDraftMutation.mutate({ formData, step: currentStep });
  };

  const updateFormData = (updates: Partial<WizardStepData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return true; // Business use case is optional
      case 2:
        return formData.name.trim().length > 0;
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        return true; // Optional steps
      case 8:
        return true; // Validation checklist - always proceed
      case 9:
        return true;
      case 10:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 10) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - create or update based on whether we're editing a draft
      if (draftId) {
        updateMutation.mutate(formData);
      } else {
        createMutation.mutate({ ...formData, status: "configured", configurationStep: 10 });
      }
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || saveDraftMutation.isPending;

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate("/");
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1BusinessUseCase data={formData} onUpdate={updateFormData} />;
      case 2:
        return <Step2AgentName data={formData} onUpdate={updateFormData} />;
      case 3:
        return <Step3DomainKnowledge data={formData} onUpdate={updateFormData} />;
      case 4:
        return <Step4ValidationRules data={formData} onUpdate={updateFormData} />;
      case 5:
        return <Step5Guardrails data={formData} onUpdate={updateFormData} />;
      case 6:
        return <Step6SampleData data={formData} onUpdate={updateFormData} />;
      case 7:
        return <Step7AvailableActions data={formData} onUpdate={updateFormData} />;
      case 8:
        return <Step8ValidationChecklist data={formData} onUpdate={updateFormData} />;
      case 9:
        return <Step8Review data={formData} onUpdate={updateFormData} agentId={draftId || undefined} />;
      case 10:
        return <Step10WelcomeScreen data={formData} onUpdate={updateFormData} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">
                  {draftId ? "Continue Configuration" : "Create New Agent"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="gap-2 ml-auto"
              data-testid="button-save-draft"
            >
              {saveDraftMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Draft
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8">
        {isLoadingDraft ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading draft...</p>
            </div>
          </div>
        ) : (
        <div className="flex gap-8">
          <aside className="hidden md:block w-64 shrink-0">
            <div className="sticky top-24 p-4 rounded-lg border bg-card">
              <StepIndicator currentStep={currentStep} />
            </div>
          </aside>
          
          <div className="flex-1 min-w-0">
            {renderStep()}

            <div className="mt-6 flex items-center justify-between gap-4">
              <Button
                variant="outline"
                onClick={handleBack}
                className="gap-2"
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4" />
                {currentStep === 1 ? "Cancel" : "Back"}
              </Button>
              <Button
                onClick={handleNext}
                disabled={!canProceed() || isSubmitting}
                className="gap-2"
                data-testid="button-next"
              >
                {currentStep === 10 ? (
                  isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {draftId ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      {draftId ? "Finish & Save" : "Create Agent"}
                    </>
                  )
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
