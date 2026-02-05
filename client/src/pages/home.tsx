import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, MessageSquare, Settings, Bot, Sparkles, LogOut, PlayCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

function AgentCard({ agent }: { agent: Agent }) {
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
          <Badge
            variant="secondary"
            className={`shrink-0 capitalize ${getStatusColor(agent.status)}`}
            data-testid={`badge-status-${agent.id}`}
          >
            {agent.status}
          </Badge>
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

export default function Home() {
  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { user, logout } = useAuth();

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
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
}
