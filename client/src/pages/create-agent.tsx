import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Briefcase, Shield, AlertTriangle, Eye, Bot, BookOpen, Upload, X, FileText, Code, Pencil, RotateCcw, HelpCircle, ExternalLink, Info, Sparkles, Loader2, ChevronDown, Database, Zap, Plus, Trash2, User, Filter, ChevronUp } from "lucide-react";
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
import { validationRulesTemplate, guardrailsTemplate } from "@/lib/config-templates";
import type { WizardStepData, Agent, DomainDocument, SampleDataset, PromptStyle, GeminiModel, ClarifyingInsight, AgentAction, MockUserState, ActionField, MockMode } from "@shared/schema";
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
  { id: 8, name: "Review", icon: Eye, description: "Preview and create your agent" },
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
        <div className="text-xs text-muted-foreground mb-2">Progress</div>
        <Progress value={progress} className="h-2" />
        <div className="text-xs text-muted-foreground mt-1">{Math.round(progress)}% complete</div>
      </div>
    </div>
  );
}

interface ExtractionResult {
  extractedContent: string;
  discardedSummary: string[];
  keepCategories: string[];
  success: boolean;
  error?: string;
}

function Step1BusinessUseCase({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { toast } = useToast();

  const handleExtract = async () => {
    if (!data.businessUseCase.trim()) {
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
        businessCaseText: data.businessUseCase,
      });
      const result: ExtractionResult = await response.json();
      
      if (result.success) {
        setExtractionResult(result);
        onUpdate({ businessUseCase: result.extractedContent });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Business Use Case
        </CardTitle>
        <CardDescription>
          Describe what problem this agent will solve. Be specific about the use case and target users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="businessUseCase">What problem does this agent solve?</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtract}
                disabled={isExtracting || !data.businessUseCase.trim()}
                data-testid="button-extract-content"
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
            <Textarea
              id="businessUseCase"
              placeholder="e.g., This agent helps customer support teams quickly answer product-related questions by accessing our knowledge base and providing accurate, helpful responses..."
              value={data.businessUseCase}
              onChange={(e) => {
                onUpdate({ businessUseCase: e.target.value });
                setExtractionResult(null);
              }}
              className="mt-2 min-h-[270px] resize-y"
              data-testid="textarea-business-usecase"
            />
            
            {extractionResult && extractionResult.success && (
              <div className="mt-3 p-3 bg-muted rounded-md border">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-sm font-medium w-full text-left"
                  data-testid="button-toggle-extraction-details"
                >
                  {showDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Extraction Summary
                  <Badge variant="secondary" className="ml-auto">
                    {extractionResult.discardedSummary.length} removed
                  </Badge>
                </button>
                
                {showDetails && (
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
        <CardDescription>
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
        <CardDescription>
          Add knowledge that your agent should know about. You can type it in or upload documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div>
            <Label htmlFor="domainKnowledge">Knowledge Base (Type here)</Label>
            <Textarea
              id="domainKnowledge"
              placeholder="e.g., 
- Our company was founded in 2020
- We offer three subscription tiers: Basic, Pro, and Enterprise
- Our support hours are 9 AM - 6 PM EST
- Product returns are accepted within 30 days..."
              value={data.domainKnowledge}
              onChange={(e) => onUpdate({ domainKnowledge: e.target.value })}
              className="mt-2 min-h-[270px] resize-y"
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
                <span className="text-xs text-muted-foreground" data-testid="validation-model-info">
                  AI model used: {geminiModelDisplayNames[defaultGenerationModel]}
                </span>
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
                <span className="text-xs text-muted-foreground" data-testid="guardrails-model-info">
                  AI model used: {geminiModelDisplayNames[defaultGenerationModel]}
                </span>
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
                <Label htmlFor="dataDescription" className="text-xs">Describe the data you need</Label>
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

function Step8Review({
  data,
  onUpdate,
}: {
  data: WizardStepData;
  onUpdate: (data: Partial<WizardStepData>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(data.customPrompt || "");
  const [generatedPrompt, setGeneratedPrompt] = useState(data.customPrompt || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<GeminiModel>(defaultGenerationModel);

  const generatePromptFromAPI = async (model?: GeminiModel) => {
    const modelToUse = model || selectedModel;
    if (!data.name || !data.businessUseCase) {
      const fallback = generatePromptPreview("gemini", data);
      setGeneratedPrompt(fallback);
      setEditedPrompt(fallback);
      return;
    }
    
    setIsGenerating(true);
    setGenerationError(null);
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
      setGeneratedPrompt(result.systemPrompt);
      setEditedPrompt(result.systemPrompt);
      onUpdate({ customPrompt: result.systemPrompt });
    } catch (error: any) {
      console.error("Failed to generate system prompt:", error);
      setGenerationError(error.message || "Failed to generate prompt");
      const fallback = generatePromptPreview("gemini", data);
      setGeneratedPrompt(fallback);
      setEditedPrompt(fallback);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (data.customPrompt) {
      setEditedPrompt(data.customPrompt);
      setGeneratedPrompt(data.customPrompt);
    } else if (data.name && data.businessUseCase) {
      generatePromptFromAPI();
    } else {
      const fallback = generatePromptPreview("gemini", data);
      setGeneratedPrompt(fallback);
      setEditedPrompt(fallback);
    }
  }, [data.name, data.businessUseCase, data.domainKnowledge, data.domainDocuments, data.validationRules, data.guardrails]);

  const handleEditToggle = () => {
    if (!isEditing) {
      setEditedPrompt(data.customPrompt || generatedPrompt);
    }
    setIsEditing(!isEditing);
  };

  const handleSaveEdit = () => {
    onUpdate({ customPrompt: editedPrompt });
    setIsEditing(false);
  };

  const handleResetPrompt = () => {
    onUpdate({ customPrompt: "" });
    generatePromptFromAPI();
    setIsEditing(false);
  };

  const displayPrompt = data.customPrompt || generatedPrompt;

  const domainDocsCount = data.domainDocuments?.length || 0;
  const domainKnowledgeValue = data.domainKnowledge 
    ? data.domainKnowledge 
    : (domainDocsCount > 0 ? `${domainDocsCount} document(s) uploaded` : "");

  const sampleDatasetsCount = data.sampleDatasets?.length || 0;
  const sampleDatasetsValue = sampleDatasetsCount > 0 
    ? `${sampleDatasetsCount} dataset(s) configured` 
    : "";

  const sections = [
    { label: "Business Use Case", value: data.businessUseCase, icon: Briefcase },
    { label: "Agent Name", value: data.name, icon: Bot },
    { label: "Domain Knowledge", value: domainKnowledgeValue, icon: BookOpen, optional: true },
    { label: "Validation Rules", value: data.validationRules, icon: Shield, optional: true },
    { label: "Guardrails", value: data.guardrails, icon: AlertTriangle, optional: true },
    { label: "Sample Data", value: sampleDatasetsValue, icon: Database, optional: true },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Review Configuration
          </CardTitle>
          <CardDescription>
            Review your agent configuration before creating it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.label} className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{section.label}</h4>
                      {section.optional && !section.value && (
                        <Badge variant="secondary" className="text-xs">Not set</Badge>
                      )}
                    </div>
                    <p
                      className="text-sm text-muted-foreground mt-0.5 break-words"
                      data-testid={`review-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {section.value ? (
                        section.value.length > 100 ? section.value.slice(0, 100) + "..." : section.value
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="h-5 w-5 text-primary" />
            Generated Prompt
          </CardTitle>
          <CardDescription>
            A system prompt has been automatically generated based on your configuration.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label>Prompt Preview</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">AI model</span>
                {!isGenerating && !isEditing && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1 h-7"
                        data-testid="button-regenerate-prompt"
                      >
                        {geminiModelDisplayNames[selectedModel]}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => {
                            setSelectedModel(model);
                            onUpdate({ customPrompt: "" });
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
                {isGenerating && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 h-7"
                    disabled
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {data.customPrompt && !isGenerating && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetPrompt}
                  className="gap-1 h-7"
                  data-testid="button-reset-prompt"
                >
                  <RotateCcw className="h-3 w-3" />
                  Regenerate
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={isEditing ? handleSaveEdit : handleEditToggle}
                className="gap-1 h-7"
                disabled={isGenerating}
                data-testid="button-edit-prompt"
              >
                <Pencil className="h-3 w-3" />
                {isEditing ? "Save" : "Edit"}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground">
              AI generates a custom prompt based on your configuration. You can edit it if needed.
            </p>

            {generationError && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                <AlertTriangle className="h-3 w-3" />
                {generationError} - Using fallback template.
              </div>
            )}
            
            {isGenerating ? (
              <div 
                className="rounded-md bg-muted/50 p-4 min-h-[300px] flex flex-col items-center justify-center gap-3"
                data-testid="prompt-loading"
              >
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generating prompt with Gemini...</p>
              </div>
            ) : isEditing ? (
              <Textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="min-h-[270px] resize-y font-mono text-xs"
                data-testid="textarea-edit-prompt"
              />
            ) : (
              <div 
                className="rounded-md bg-muted/50 p-4 text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto"
                data-testid="prompt-preview"
              >
                {displayPrompt || "No prompt generated yet."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreateAgent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
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

  const createMutation = useMutation({
    mutationFn: async (data: WizardStepData) => {
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

  const updateFormData = (updates: Partial<WizardStepData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.businessUseCase.trim().length > 0;
      case 2:
        return formData.name.trim().length > 0;
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        return true; // Optional steps
      case 8:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 8) {
      setCurrentStep(currentStep + 1);
    } else {
      createMutation.mutate(formData);
    }
  };

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
        return <Step8Review data={formData} onUpdate={updateFormData} />;
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
                <h1 className="text-lg font-bold">Create New Agent</h1>
                <p className="text-sm text-muted-foreground">
                  Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-8">
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
            disabled={!canProceed() || createMutation.isPending}
            className="gap-2"
            data-testid="button-next"
          >
            {currentStep === 8 ? (
              createMutation.isPending ? (
                "Creating..."
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Create Agent
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
      </main>
    </div>
  );
}
