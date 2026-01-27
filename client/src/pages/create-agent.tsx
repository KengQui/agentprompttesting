import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Briefcase, Shield, AlertTriangle, Eye, Bot, BookOpen, Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { WizardStepData, Agent, DomainDocument } from "@shared/schema";

const steps = [
  { id: 1, name: "Business Use Case", icon: Briefcase, description: "Define the problem this agent solves" },
  { id: 2, name: "Agent Name", icon: Bot, description: "Name your agent" },
  { id: 3, name: "Domain Knowledge", icon: BookOpen, description: "Add knowledge and documents" },
  { id: 4, name: "Validation Rules", icon: Shield, description: "Set input/output validation rules" },
  { id: 5, name: "Guardrails", icon: AlertTriangle, description: "Define safety boundaries" },
  { id: 6, name: "Review", icon: Eye, description: "Preview and create your agent" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  const progress = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className={`flex flex-col items-center ${
                index !== steps.length - 1 ? "flex-1" : ""
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted bg-muted text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.id}`}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-medium hidden sm:block ${
                  isCurrent ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {step.name}
              </span>
            </div>
          );
        })}
      </div>
      <Progress value={progress} className="h-2" />
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
            <Label htmlFor="businessUseCase">What problem does this agent solve?</Label>
            <Textarea
              id="businessUseCase"
              placeholder="e.g., This agent helps customer support teams quickly answer product-related questions by accessing our knowledge base and providing accurate, helpful responses..."
              value={data.businessUseCase}
              onChange={(e) => onUpdate({ businessUseCase: e.target.value })}
              className="mt-2 min-h-[200px] resize-none"
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
              className="mt-2 min-h-[150px] resize-none"
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Validation Rules
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription>
          Define rules to validate user inputs and agent outputs. This helps ensure consistent, high-quality responses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="validationRules">Input/Output Validation Rules</Label>
            <Textarea
              id="validationRules"
              placeholder="e.g., 
- User input must be in English
- Responses should not exceed 500 words
- Always include relevant documentation links
- Format code examples with proper syntax highlighting
- Reject requests for personal information..."
              value={data.validationRules}
              onChange={(e) => onUpdate({ validationRules: e.target.value })}
              className="mt-2 min-h-[200px] resize-none"
              data-testid="textarea-validation-rules"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step5Guardrails({
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
          <AlertTriangle className="h-5 w-5 text-primary" />
          Guardrails
          <Badge variant="secondary">Optional</Badge>
        </CardTitle>
        <CardDescription>
          Set safety boundaries and restrictions for your agent. Define what the agent should never do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="guardrails">Safety Boundaries & Restrictions</Label>
            <Textarea
              id="guardrails"
              placeholder="e.g.,
- Never provide medical, legal, or financial advice
- Do not share confidential company information
- Refuse requests involving illegal activities
- Redirect complex issues to human support
- Never impersonate a real person
- Do not generate harmful or offensive content..."
              value={data.guardrails}
              onChange={(e) => onUpdate({ guardrails: e.target.value })}
              className="mt-2 min-h-[200px] resize-none"
              data-testid="textarea-guardrails"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step6Review({ data }: { data: WizardStepData }) {
  const domainDocsCount = data.domainDocuments?.length || 0;
  const domainKnowledgeValue = data.domainKnowledge 
    ? data.domainKnowledge 
    : (domainDocsCount > 0 ? `${domainDocsCount} document(s) uploaded` : "");

  const sections = [
    { label: "Business Use Case", value: data.businessUseCase, icon: Briefcase },
    { label: "Agent Name", value: data.name, icon: Bot },
    { label: "Domain Knowledge", value: domainKnowledgeValue, icon: BookOpen, optional: true },
    { label: "Validation Rules", value: data.validationRules, icon: Shield, optional: true },
    { label: "Guardrails", value: data.guardrails, icon: AlertTriangle, optional: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" />
          Review Configuration
        </CardTitle>
        <CardDescription>
          Review your agent configuration before creating it. You can edit these settings later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">{section.label}</h4>
                  {section.optional && !section.value && (
                    <Badge variant="secondary">Not set</Badge>
                  )}
                </div>
                <div
                  className="rounded-md bg-muted/50 p-3 text-sm"
                  data-testid={`review-${section.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {section.value || (
                    <span className="text-muted-foreground italic">Not provided</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
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
    validationRules: "",
    guardrails: "",
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
        return true; // Optional steps
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 6) {
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
        return <Step6Review data={formData} />;
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

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <StepIndicator currentStep={currentStep} />
        
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
            {currentStep === 6 ? (
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
      </main>
    </div>
  );
}
