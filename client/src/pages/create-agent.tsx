import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Briefcase, FileText, Shield, AlertTriangle, Eye, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { WizardStepData, Agent } from "@shared/schema";

const steps = [
  { id: 1, name: "Business Use Case", icon: Briefcase, description: "Define the problem this agent solves" },
  { id: 2, name: "Description", icon: FileText, description: "Name and configure the agent's personality" },
  { id: 3, name: "Validation Rules", icon: Shield, description: "Set input/output validation rules" },
  { id: 4, name: "Guardrails", icon: AlertTriangle, description: "Define safety boundaries" },
  { id: 5, name: "Review", icon: Eye, description: "Preview and create your agent" },
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

function Step2Description({
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
          <FileText className="h-5 w-5 text-primary" />
          Agent Description
        </CardTitle>
        <CardDescription>
          Give your agent a name and define its personality through a system prompt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
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
          <div>
            <Label htmlFor="description">System Prompt / Personality</Label>
            <Textarea
              id="description"
              placeholder="e.g., You are a helpful customer support agent. You are friendly, professional, and always aim to resolve customer issues efficiently. You have access to our product documentation and can help with troubleshooting, billing questions, and feature explanations..."
              value={data.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              className="mt-2 min-h-[200px] resize-none"
              data-testid="textarea-description"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Step3ValidationRules({
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
          <Badge variant="secondary" size="sm">Optional</Badge>
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

function Step4Guardrails({
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
          <Badge variant="secondary" size="sm">Optional</Badge>
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

function Step5Review({ data }: { data: WizardStepData }) {
  const sections = [
    { label: "Business Use Case", value: data.businessUseCase, icon: Briefcase },
    { label: "Agent Name", value: data.name, icon: Bot },
    { label: "System Prompt", value: data.description, icon: FileText },
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
                    <Badge variant="secondary" size="sm">Not set</Badge>
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
        return true; // Optional steps
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
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
        return <Step2Description data={formData} onUpdate={updateFormData} />;
      case 3:
        return <Step3ValidationRules data={formData} onUpdate={updateFormData} />;
      case 4:
        return <Step4Guardrails data={formData} onUpdate={updateFormData} />;
      case 5:
        return <Step5Review data={formData} />;
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
            {currentStep === 5 ? (
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
