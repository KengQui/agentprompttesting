import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2, Bot, Briefcase, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Agent, UpdateAgent, AgentStatus } from "@shared/schema";

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<UpdateAgent | null>(null);

  const { data: agent, isLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", params.id],
  });

  // Initialize form data when agent loads
  useEffect(() => {
    if (agent && !formData) {
      setFormData({
        name: agent.name,
        businessUseCase: agent.businessUseCase,
        validationRules: agent.validationRules,
        guardrails: agent.guardrails,
        status: agent.status,
      });
    }
  }, [agent, formData]);

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
                <Shield className="h-5 w-5 text-primary" />
                Validation Rules
                <Badge variant="secondary">Optional</Badge>
              </CardTitle>
              <CardDescription>
                Input/output validation rules for quality control
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.validationRules || ""}
                onChange={(e) => updateFormData({ validationRules: e.target.value })}
                className="min-h-[120px] resize-none"
                placeholder="Add validation rules..."
                data-testid="textarea-validation-rules"
              />
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
                Safety boundaries and restrictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={formData.guardrails || ""}
                onChange={(e) => updateFormData({ guardrails: e.target.value })}
                className="min-h-[120px] resize-none"
                placeholder="Add guardrails..."
                data-testid="textarea-guardrails"
              />
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
