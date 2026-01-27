import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2, Bot, Briefcase, Shield, AlertTriangle, Loader2, BookOpen, Upload, X, FileText, Code, Pencil, RotateCcw, HelpCircle, ExternalLink, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { generatePromptPreview, promptStyleInfo } from "@/lib/prompt-preview";
import { validationRulesTemplate, guardrailsTemplate } from "@/lib/config-templates";
import type { Agent, UpdateAgent, AgentStatus, DomainDocument, PromptStyle } from "@shared/schema";

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<UpdateAgent | null>(null);

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", params.id],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState("");

  const [isGeneratingValidation, setIsGeneratingValidation] = useState(false);
  const [isGeneratingGuardrails, setIsGeneratingGuardrails] = useState(false);

  // Initialize form data when agent loads
  useEffect(() => {
    if (agent && !formData) {
      setFormData({
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        domainKnowledge: agent.domainKnowledge,
        domainDocuments: agent.domainDocuments,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        promptStyle: agent.promptStyle,
        customPrompt: agent.customPrompt,
        status: agent.status,
      });
      setEditedPrompt(agent.customPrompt || "");
    }
  }, [agent, formData]);

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
        updateFormData({ domainDocuments: [...currentDocs, document] });

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
    updateFormData({ domainDocuments: currentDocs.filter(doc => doc.id !== id) });
  };

  const handleUseValidationTemplate = () => {
    updateFormData({ validationRules: validationRulesTemplate });
  };

  const handleUseGuardrailsTemplate = () => {
    updateFormData({ guardrails: guardrailsTemplate });
  };

  const handleGenerateValidationRules = async () => {
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
      });
      const result = await response.json();
      updateFormData({ validationRules: result.validationRules });
      toast({
        title: "Validation rules generated",
        description: "Review and customize the generated rules as needed.",
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

  const handleGenerateGuardrails = async () => {
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
      });
      const result = await response.json();
      updateFormData({ guardrails: result.guardrails });
      toast({
        title: "Guardrails generated",
        description: "Review and customize the generated guardrails as needed.",
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

  const updateFormData = (updates: Partial<UpdateAgent>) => {
    setFormData((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleSave = () => {
    if (formData) {
      updateMutation.mutate(formData);
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
        <main className="container mx-auto max-w-2xl px-4 py-8">
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-60" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-24 w-full" />
                </CardContent>
              </Card>
            ))}
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

      <main className="container mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-6">
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
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  className="mt-2"
                  data-testid="input-name"
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => updateFormData({ status: value as AgentStatus })}
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Business Use Case
              </CardTitle>
              <CardDescription>
                Define the problem this agent solves
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.businessUseCase || ""}
                onChange={(e) => updateFormData({ businessUseCase: e.target.value })}
                className="min-h-[120px] resize-none"
                data-testid="textarea-business-usecase"
              />
            </CardContent>
          </Card>

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
                  onChange={(e) => updateFormData({ domainKnowledge: e.target.value })}
                  className="mt-2 min-h-[120px] resize-none"
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
                    <Label htmlFor="validationRules">Validation Configuration</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseValidationTemplate}
                        className="text-sm text-primary hover:underline"
                        data-testid="settings-button-use-template-validation"
                      >
                        Use Template
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateValidationRules}
                        disabled={isGeneratingValidation}
                        data-testid="settings-button-generate-validation"
                      >
                        {isGeneratingValidation ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        Generate
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="validationRules"
                    value={formData.validationRules || ""}
                    onChange={(e) => updateFormData({ validationRules: e.target.value })}
                    className="min-h-[160px] resize-none font-mono text-sm"
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
                    <Label htmlFor="guardrails">Guardrails Configuration</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUseGuardrailsTemplate}
                        className="text-sm text-primary hover:underline"
                        data-testid="settings-button-use-template-guardrails"
                      >
                        Use Template
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateGuardrails}
                        disabled={isGeneratingGuardrails}
                        data-testid="settings-button-generate-guardrails"
                      >
                        {isGeneratingGuardrails ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        Generate
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="guardrails"
                    value={formData.guardrails || ""}
                    onChange={(e) => updateFormData({ guardrails: e.target.value })}
                    className="min-h-[160px] resize-none font-mono text-sm"
                    placeholder="Define what your agent should NOT do (Markdown or YAML format)..."
                    data-testid="textarea-guardrails"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional: Define what your agent should NOT do (Markdown or YAML format)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                Choose a prompt style and optionally customize the system prompt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Label>Prompt Style</Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        data-testid="settings-button-learn-more-styles"
                      >
                        <HelpCircle className="h-3.5 w-3.5 mr-1" />
                        Learn more
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Prompt Engineering Styles</DialogTitle>
                        <DialogDescription>
                          Different AI providers have developed distinct best practices for prompt engineering. Choose the style that works best for your use case.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        {(["anthropic", "gemini", "openai"] as PromptStyle[]).map((style) => (
                          <div key={style} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{promptStyleInfo[style].name}</h4>
                              <a
                                href={promptStyleInfo[style].link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                                data-testid={`settings-link-${style}-docs`}
                              >
                                View docs
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {promptStyleInfo[style].detailedDescription}
                            </p>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <RadioGroup
                  value={formData.promptStyle || "anthropic"}
                  onValueChange={(value) => {
                    updateFormData({ promptStyle: value as PromptStyle, customPrompt: "" });
                    setEditedPrompt("");
                    setIsEditingPrompt(false);
                  }}
                  className="grid grid-cols-3 gap-3"
                  data-testid="settings-prompt-style-radio-group"
                >
                  {(["anthropic", "gemini", "openai"] as PromptStyle[]).map((style) => (
                    <div key={style} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={style} 
                        id={`settings-style-${style}`}
                        data-testid={`settings-radio-${style}`}
                      />
                      <Label 
                        htmlFor={`settings-style-${style}`} 
                        className="text-sm cursor-pointer"
                      >
                        {promptStyleInfo[style].name}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                <p className="text-xs text-muted-foreground mt-2">
                  {promptStyleInfo[formData.promptStyle || "anthropic"].description}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Custom Prompt</Label>
                  <div className="flex gap-2">
                    {formData.customPrompt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          updateFormData({ customPrompt: "" });
                          setEditedPrompt("");
                          setIsEditingPrompt(false);
                        }}
                        className="gap-1 h-7"
                        data-testid="settings-button-reset-prompt"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (isEditingPrompt) {
                          updateFormData({ customPrompt: editedPrompt });
                        } else {
                          setEditedPrompt(formData.customPrompt || "");
                        }
                        setIsEditingPrompt(!isEditingPrompt);
                      }}
                      className="gap-1 h-7"
                      data-testid="settings-button-edit-prompt"
                    >
                      <Pencil className="h-3 w-3" />
                      {isEditingPrompt ? "Save" : "Edit"}
                    </Button>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground mb-2">
                  The actual prompt uses your platform's personality from personality-prompt.txt
                </p>
                
                {isEditingPrompt ? (
                  <Textarea
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="min-h-[200px] font-mono text-xs resize-none"
                    placeholder="Enter a custom system prompt..."
                    data-testid="settings-textarea-edit-prompt"
                  />
                ) : (
                  <div 
                    className="rounded-md bg-muted/50 p-4 text-xs font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap"
                    data-testid="settings-prompt-preview"
                  >
                    {formData.customPrompt || generatePromptPreview(formData.promptStyle || "anthropic", formData)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Card className="border-destructive/50">
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
      </main>
    </div>
  );
}
