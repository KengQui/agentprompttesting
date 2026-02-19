import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, MessageSquare, Settings, Bot, Sparkles, LogOut, PlayCircle, Copy, Zap, HelpCircle, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Agent } from "@shared/schema";

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "configured":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "draft":
    default:
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFlowModeStyle(flowMode: string) {
  switch (flowMode) {
    case "infer-first":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400";
    case "ask-first":
      return "bg-sky-500/10 text-sky-600 dark:text-sky-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getFlowModeLabel(flowMode: string) {
  switch (flowMode) {
    case "infer-first":
      return "Infer First";
    case "ask-first":
      return "Ask First";
    default:
      return "Unknown";
  }
}

function getFlowModeDescription(flowMode: string) {
  switch (flowMode) {
    case "infer-first":
      return "Analyzes data first, only asks when genuinely ambiguous";
    case "ask-first":
      return "Proactively asks for all required fields upfront";
    default:
      return "Flow mode could not be determined";
  }
}

interface SyncStatus {
  hasDifferences: boolean;
  changedFields: string[];
}

function AgentCard({ agent, flowMode, syncStatus }: { agent: Agent; flowMode?: string; syncStatus?: SyncStatus }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const cloneMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/clone`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent cloned", description: `"Copy of ${agent.name}" has been created.` });
    },
    onError: (error: Error) => {
      toast({ title: "Clone failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="group hover-elevate flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold truncate" data-testid={`text-agent-name-${agent.id}`}>
                {agent.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Created {formatDate(agent.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge
              variant="secondary"
              className={`capitalize ${getStatusColor(agent.status)}`}
              data-testid={`badge-status-${agent.id}`}
            >
              {agent.status}
            </Badge>
            {flowMode && flowMode !== "unknown" && agent.status !== "draft" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span data-testid={`badge-flow-mode-${agent.id}`}>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${getFlowModeStyle(flowMode)}`}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      {getFlowModeLabel(flowMode)}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">{getFlowModeDescription(flowMode)}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {syncStatus?.hasDifferences && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="cursor-pointer"
                    onClick={() => navigate(`/settings/${agent.id}`)}
                    data-testid={`badge-prod-updated-${agent.id}`}
                  >
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    >
                      <CloudDownload className="h-3 w-3 mr-1" />
                      Prod Updated
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[200px]">
                  <p className="text-xs font-medium mb-1">Production has changes in:</p>
                  <p className="text-xs text-muted-foreground">{syncStatus.changedFields.join(", ")}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardHeader>
      <CardFooter className="gap-2 pt-3 border-t">
        {agent.status === "draft" ? (
          <Link href={`/create/${agent.id}`} className="flex-1">
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2"
              data-testid={`button-continue-${agent.id}`}
            >
              <PlayCircle className="h-4 w-4" />
              Continue
            </Button>
          </Link>
        ) : (
          <Link href={`/chat/${agent.id}`} className="flex-1">
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2"
              data-testid={`button-chat-${agent.id}`}
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </Button>
          </Link>
        )}
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => cloneMutation.mutate()}
          disabled={cloneMutation.isPending}
          data-testid={`button-clone-${agent.id}`}
        >
          <Copy className="h-4 w-4" />
        </Button>
        <Link href={`/settings/${agent.id}`}>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            data-testid={`button-settings-${agent.id}`}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}

function AgentCardSkeleton() {
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-6">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No agents yet</h2>
      <p className="text-muted-foreground text-center mb-6 max-w-md">
        Create your first AI agent to get started. Define its purpose, personality, and behavior through our guided wizard.
      </p>
      <Link href="/create">
        <Button size="lg" className="gap-2" data-testid="button-create-first-agent">
          <Plus className="h-5 w-5" />
          Create Your First Agent
        </Button>
      </Link>
    </div>
  );
}

interface FlowModeResult {
  agentId: string;
  agentName: string;
  flowMode: string;
}

interface SyncStatusResponse {
  success: boolean;
  statuses: Record<string, SyncStatus>;
}

export default function Home() {
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: flowModes } = useQuery<FlowModeResult[]>({
    queryKey: ["/api/agents/flow-modes"],
    enabled: !!agents && agents.length > 0,
  });
  const { data: syncStatusData } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/admin/sync-status"],
    enabled: !!agents && agents.length > 0,
    staleTime: 60000,
    retry: false,
  });
  const { user, logout } = useAuth();

  const flowModeMap = new Map(
    flowModes?.map((fm) => [fm.agentId, fm.flowMode]) ?? []
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold">Agent Studio</h1>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <span className="text-sm text-muted-foreground" data-testid="text-username">
                  {user.username}
                </span>
              )}
              <Link href="/create">
                <Button className="gap-2" data-testid="button-create-agent">
                  <Plus className="h-4 w-4" />
                  Create Agent
                </Button>
              </Link>
              <Button
                variant="outline"
                size="icon"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <AgentCardSkeleton key={i} />
            ))}
          </div>
        ) : agents && agents.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} flowMode={flowModeMap.get(agent.id)} syncStatus={syncStatusData?.statuses?.[agent.id]} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
