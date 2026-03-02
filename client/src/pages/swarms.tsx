import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  Plus,
  ArrowLeft,
  Bot,
  Trash2,
  Network,
  Search,
  Loader2,
  Settings,
  MessageSquare,
  X,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Swarm, SwarmAgent, Agent } from "@shared/schema";

interface SwarmWithAgents extends Swarm {
  agents: (SwarmAgent & { agentName?: string; agentStatus?: string })[];
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SwarmCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardHeader>
      <CardFooter className="gap-2 pt-3 border-t">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 w-8" />
      </CardFooter>
    </Card>
  );
}

function CreateSwarmDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/swarms", { name, description });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      toast({ title: "Swarm created", description: `"${name}" has been created.` });
      setName("");
      setDescription("");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create swarm", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Swarm</DialogTitle>
          <DialogDescription>
            A swarm connects multiple agents under an orchestrator for unified conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="swarm-name">Name</label>
            <Input
              id="swarm-name"
              placeholder="e.g., HR Assistant"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-swarm-name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="swarm-description">Description</label>
            <Textarea
              id="swarm-description"
              placeholder="Describe what this swarm does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              data-testid="input-swarm-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-create-swarm">
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            data-testid="button-confirm-create-swarm"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Create Swarm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwarmCard({ swarm }: { swarm: Swarm }) {
  const [, navigate] = useLocation();

  return (
    <Card className="group hover-elevate flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Network className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate" data-testid={`text-swarm-name-${swarm.id}`}>
                {swarm.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Created {formatDate(swarm.createdAt)}
              </p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={swarm.isActive
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"}
            data-testid={`badge-swarm-status-${swarm.id}`}
          >
            {swarm.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        {swarm.description && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2" data-testid={`text-swarm-desc-${swarm.id}`}>
            {swarm.description}
          </p>
        )}
      </CardHeader>
      <CardFooter className="gap-2 pt-3 border-t">
        <Button
          variant="default"
          size="sm"
          className="flex-1 gap-2"
          onClick={() => navigate(`/swarms/${swarm.id}`)}
          data-testid={`button-manage-swarm-${swarm.id}`}
        >
          <Settings className="h-4 w-4" />
          Manage
        </Button>
        <Link href={`/swarms/${swarm.id}/chat`}>
          <Button
            variant="outline"
            size="icon"
            data-testid={`button-chat-swarm-${swarm.id}`}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

function SwarmsList() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: swarms, isLoading } = useQuery<Swarm[]>({
    queryKey: ["/api/swarms"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Network className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold">Swarm Orchestrator</h1>
            </div>
            <Button className="gap-2" onClick={() => setShowCreate(true)} data-testid="button-create-swarm">
              <Plus className="h-4 w-4" />
              Create Swarm
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <SwarmCardSkeleton key={i} />
            ))}
          </div>
        ) : swarms && swarms.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {swarms.map((swarm) => (
              <SwarmCard key={swarm.id} swarm={swarm} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
              <Network className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No swarms yet</h2>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Create your first swarm to connect multiple agents under a single orchestrator for unified conversations.
            </p>
            <Button size="lg" className="gap-2" onClick={() => setShowCreate(true)} data-testid="button-create-first-swarm">
              <Plus className="h-5 w-5" />
              Create Your First Swarm
            </Button>
          </div>
        )}
      </main>

      <CreateSwarmDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}

function AgentConnector({
  swarmId,
  existingAgentIds,
  onClose,
}: {
  swarmId: string;
  existingAgentIds: Set<string>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [role, setRole] = useState("");
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/swarms/${swarmId}/agents`, {
        agentId: selectedAgent!.id,
        role,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId] });
      toast({ title: "Agent connected", description: `${selectedAgent!.name} has been added to the swarm.` });
      setSelectedAgent(null);
      setRole("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to connect agent", description: error.message, variant: "destructive" });
    },
  });

  const availableAgents = (agents || []).filter(
    (a) => !existingAgentIds.has(a.id) && a.status !== "draft"
  );

  const filteredAgents = availableAgents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect Agent to Swarm</DialogTitle>
          <DialogDescription>
            Select an agent and define its role in this swarm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!selectedAgent ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-agents"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {availableAgents.length === 0
                      ? "No available agents to connect. Create and configure agents first."
                      : "No agents match your search."}
                  </p>
                ) : (
                  filteredAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover-elevate"
                      onClick={() => setSelectedAgent(agent)}
                      data-testid={`button-select-agent-${agent.id}`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agent.name}</p>
                      </div>
                      <Badge variant="secondary" className="capitalize text-xs shrink-0">
                        {agent.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-md border p-3 bg-muted/30">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedAgent.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedAgent(null)}
                  data-testid="button-deselect-agent"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="agent-role">
                  Role in Swarm
                </label>
                <Input
                  id="agent-role"
                  placeholder="e.g., Handles scheduling and timesheets"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  data-testid="input-agent-role"
                />
                <p className="text-xs text-muted-foreground">
                  Describe what this agent handles within the swarm to help the orchestrator route messages correctly.
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-connect">
            Cancel
          </Button>
          {selectedAgent && (
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
              data-testid="button-confirm-connect"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Connect Agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwarmDetail() {
  const params = useParams<{ id: string }>();
  const swarmId = params.id!;
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConnector, setShowConnector] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleValue, setRoleValue] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const [editingOrchestratorPrompt, setEditingOrchestratorPrompt] = useState(false);
  const [orchestratorPromptValue, setOrchestratorPromptValue] = useState("");

  const isAdmin = (user as any)?.role === "admin";

  const { data: swarmData, isLoading } = useQuery<SwarmWithAgents>({
    queryKey: ["/api/swarms", swarmId],
  });

  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const agentMap = new Map((allAgents || []).map((a) => [a.id, a]));

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/swarms/${swarmId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      toast({ title: "Swarm deleted" });
      navigate("/swarms");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete swarm", description: error.message, variant: "destructive" });
    },
  });

  const updateSwarmMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      const res = await apiRequest("PATCH", `/api/swarms/${swarmId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId] });
      queryClient.invalidateQueries({ queryKey: ["/api/swarms"] });
      setEditingName(false);
      setEditingDesc(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update swarm", description: error.message, variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: { orchestratorPrompt?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/swarms/${swarmId}/settings`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId] });
      setEditingOrchestratorPrompt(false);
      toast({ title: "Orchestrator settings updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const removeAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      await apiRequest("DELETE", `/api/swarms/${swarmId}/agents/${agentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId] });
      toast({ title: "Agent disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove agent", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ agentId, role }: { agentId: string; role: string }) => {
      await apiRequest("PATCH", `/api/swarms/${swarmId}/agents/${agentId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId] });
      setEditingRole(null);
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-9 w-48" />
          </div>
        </header>
        <main className="container mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    );
  }

  if (!swarmData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Swarm not found</h2>
          <Link href="/swarms">
            <Button variant="outline" data-testid="button-back-to-swarms">Back to Swarms</Button>
          </Link>
        </div>
      </div>
    );
  }

  const existingAgentIds = new Set(swarmData.agents.map((a) => a.agentId));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/swarms">
                <Button variant="ghost" size="icon" data-testid="button-back-to-swarms">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Network className="h-5 w-5" />
              </div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    className="w-48"
                    data-testid="input-edit-swarm-name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateSwarmMutation.mutate({ name: nameValue });
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => updateSwarmMutation.mutate({ name: nameValue })}
                    disabled={updateSwarmMutation.isPending}
                    data-testid="button-save-swarm-name"
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} data-testid="button-cancel-edit-name">
                    Cancel
                  </Button>
                </div>
              ) : (
                <h1
                  className="text-xl font-bold cursor-pointer"
                  onClick={() => {
                    setNameValue(swarmData.name);
                    setEditingName(true);
                  }}
                  data-testid="text-swarm-detail-name"
                >
                  {swarmData.name}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/swarms/${swarmId}/chat`}>
                <Button className="gap-2" data-testid="button-open-chat">
                  <MessageSquare className="h-4 w-4" />
                  Chat
                </Button>
              </Link>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-swarm"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Description</label>
              {editingDesc ? (
                <div className="mt-1 space-y-2">
                  <Textarea
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    className="resize-none"
                    data-testid="input-edit-swarm-desc"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateSwarmMutation.mutate({ description: descValue })}
                      disabled={updateSwarmMutation.isPending}
                      data-testid="button-save-swarm-desc"
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingDesc(false)} data-testid="button-cancel-edit-desc">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm mt-1 cursor-pointer"
                  onClick={() => {
                    setDescValue(swarmData.description || "");
                    setEditingDesc(true);
                  }}
                  data-testid="text-swarm-detail-desc"
                >
                  {swarmData.description || "Click to add a description..."}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge
                  variant="secondary"
                  className={swarmData.isActive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"}
                  data-testid="badge-swarm-detail-status"
                >
                  {swarmData.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Agents:</span>
                <span className="text-sm font-medium" data-testid="text-agent-count">
                  {swarmData.agents.length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h2 className="text-lg font-semibold">Connected Agents</h2>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowConnector(true)}
              data-testid="button-connect-agent"
            >
              <Plus className="h-4 w-4" />
              Connect Agent
            </Button>
          </div>

          {swarmData.agents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  No agents connected yet. Connect agents to enable the orchestrator to route conversations.
                </p>
                <Button className="gap-2" onClick={() => setShowConnector(true)} data-testid="button-connect-first-agent">
                  <Plus className="h-4 w-4" />
                  Connect Your First Agent
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {swarmData.agents.map((sa) => {
                const agentDetails = agentMap.get(sa.agentId);
                const agentName = sa.agentName || agentDetails?.name || "Unknown Agent";
                const agentStatus = sa.agentStatus || agentDetails?.status || "unknown";

                return (
                  <Card key={sa.id} data-testid={`card-swarm-agent-${sa.agentId}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 mt-0.5">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm" data-testid={`text-agent-name-${sa.agentId}`}>
                              {agentName}
                            </span>
                            <Badge variant="secondary" className="capitalize text-xs shrink-0">
                              {agentStatus}
                            </Badge>
                          </div>
                          {editingRole === sa.agentId ? (
                            <div className="mt-2 space-y-2">
                              <Input
                                value={roleValue}
                                onChange={(e) => setRoleValue(e.target.value)}
                                placeholder="Describe the agent's role..."
                                data-testid={`input-edit-role-${sa.agentId}`}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") updateRoleMutation.mutate({ agentId: sa.agentId, role: roleValue });
                                  if (e.key === "Escape") setEditingRole(null);
                                }}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => updateRoleMutation.mutate({ agentId: sa.agentId, role: roleValue })}
                                  disabled={updateRoleMutation.isPending}
                                  data-testid={`button-save-role-${sa.agentId}`}
                                >
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingRole(null)} data-testid={`button-cancel-role-${sa.agentId}`}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className="text-sm text-muted-foreground mt-1 cursor-pointer"
                              onClick={() => {
                                setEditingRole(sa.agentId);
                                setRoleValue(sa.role || "");
                              }}
                              data-testid={`text-role-${sa.agentId}`}
                            >
                              {sa.role || "Click to define role..."}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAgentMutation.mutate(sa.agentId)}
                          disabled={removeAgentMutation.isPending}
                          data-testid={`button-remove-agent-${sa.agentId}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {isAdmin && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Orchestrator Settings</h2>
            <Card data-testid="card-orchestrator-settings">
              <CardContent className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Custom Routing Prompt</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Override the default routing behavior with custom instructions for the orchestrator.
                  </p>
                  {editingOrchestratorPrompt ? (
                    <div className="space-y-2">
                      <Textarea
                        value={orchestratorPromptValue}
                        onChange={(e) => setOrchestratorPromptValue(e.target.value)}
                        className="resize-none min-h-[120px]"
                        placeholder="Enter custom routing instructions..."
                        data-testid="input-orchestrator-prompt"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateSettingsMutation.mutate({ orchestratorPrompt: orchestratorPromptValue })}
                          disabled={updateSettingsMutation.isPending}
                          data-testid="button-save-orchestrator-prompt"
                        >
                          {updateSettingsMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingOrchestratorPrompt(false)} data-testid="button-cancel-orchestrator-prompt">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-sm cursor-pointer rounded-md border p-3 min-h-[60px]"
                      onClick={() => {
                        setOrchestratorPromptValue(swarmData.orchestratorPrompt || "");
                        setEditingOrchestratorPrompt(true);
                      }}
                      data-testid="text-orchestrator-prompt"
                    >
                      {swarmData.orchestratorPrompt || "Click to add custom routing instructions..."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {showConnector && (
        <AgentConnector
          swarmId={swarmId}
          existingAgentIds={existingAgentIds}
          onClose={() => setShowConnector(false)}
        />
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Swarm?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{swarmData.name}" and all its sessions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              Delete Swarm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function SwarmsPage() {
  const params = useParams<{ id: string }>();

  if (params.id) {
    return <SwarmDetail />;
  }
  return <SwarmsList />;
}
