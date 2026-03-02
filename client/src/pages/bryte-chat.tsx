import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Send, Bot, User, Loader2, MessageSquare, Plus, Trash2, Pencil, Check, X, Network, ArrowRight, Users, AlertTriangle, Wrench, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Swarm, SwarmAgent, SwarmSession, SwarmMessage } from "@shared/schema";

const MAX_MESSAGE_LENGTH = 2000;

interface SwarmWithAgents extends Swarm {
  agents: (SwarmAgent & { agentName?: string })[];
}

function SwarmSessionCard({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: SwarmSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer ${
        isActive ? "bg-primary/10" : "hover-elevate"
      }`}
      onClick={onSelect}
      data-testid={`session-card-${session.id}`}
    >
      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{session.title}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(session.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 invisible group-hover:visible"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        data-testid={`button-delete-session-${session.id}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function WelcomeScreen({ swarm }: { swarm: SwarmWithAgents }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4" data-testid="swarm-welcome-screen">
      <div className="max-w-lg text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Network className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold" data-testid="text-swarm-name">{swarm.name}</h2>
        {swarm.description && (
          <p className="text-muted-foreground" data-testid="text-swarm-description">{swarm.description}</p>
        )}
        {swarm.agents && swarm.agents.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Connected Agents</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {swarm.agents.map((agent) => (
                <Badge
                  key={agent.id}
                  variant="secondary"
                  data-testid={`badge-agent-${agent.agentId}`}
                >
                  <Bot className="h-3 w-3 mr-1" />
                  {agent.agentName || agent.agentId}
                  {agent.role && (
                    <span className="ml-1 text-muted-foreground">- {agent.role}</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground pt-2">
          Start a new session to chat with this swarm.
        </p>
      </div>
    </div>
  );
}

function RoutingBadge({ agentName, reason }: { agentName: string | null; reason: string | null }) {
  if (!agentName) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-xs gap-1 ml-11 -mt-1 mb-1" data-testid="badge-routing">
          <ArrowRight className="h-3 w-3" />
          via {agentName}
        </Badge>
      </TooltipTrigger>
      {reason && (
        <TooltipContent>
          <p className="max-w-xs">{reason}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function MessageBubble({ message }: { message: SwarmMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex gap-3 justify-end" data-testid={`message-${message.id}`}>
        <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          <p className="text-xs mt-1 opacity-70">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid={`message-${message.id}`}>
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="h-4 w-4" />
        </div>
        <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
          <p className="text-xs mt-1 text-muted-foreground">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      <RoutingBadge agentName={message.routedToAgentName} reason={message.routingReason} />
    </div>
  );
}

function RoutingStatusIndicator() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPhase(1), 1500);
    return () => clearTimeout(timer);
  }, []);

  const statusText = phase === 0 ? "Analyzing your request..." : "Routing to the right agent...";
  const StatusIcon = phase === 0 ? Loader2 : Shuffle;

  return (
    <div className="flex gap-3" data-testid="routing-status-indicator">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Network className="h-4 w-4 text-primary" />
      </div>
      <div className="rounded-lg px-4 py-3 bg-muted/70 border border-border/50">
        <div className="flex items-center gap-2">
          <StatusIcon className="h-3.5 w-3.5 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">{statusText}</span>
          <span className="flex gap-0.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentHandoffBanner({ fromAgent, toAgent }: { fromAgent: string; toAgent: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2" data-testid="banner-agent-handoff">
      <div className="h-px flex-1 bg-border" />
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border/50">
        <Shuffle className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          Switched to <span className="font-medium text-foreground">{toAgent}</span>
        </span>
      </div>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

interface RoutingError {
  type: "agent_failure" | "routing_failure" | "no_agents";
  agentId?: string;
  agentName?: string;
  message: string;
}

function ErrorCard({ error, onNavigateToAgent }: { error: RoutingError; onNavigateToAgent?: (agentId: string) => void }) {
  return (
    <div className="flex gap-3" data-testid="error-card">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-4 w-4 text-destructive" />
      </div>
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-destructive/5 border border-destructive/20">
        <div className="space-y-2">
          <p className="text-sm font-medium text-destructive">
            {error.type === "agent_failure"
              ? `${error.agentName || "An agent"} encountered an error`
              : error.type === "no_agents"
                ? "No agents available"
                : "Routing error"}
          </p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
          {error.type === "agent_failure" && error.agentId && onNavigateToAgent && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 gap-1.5 text-xs"
              onClick={() => onNavigateToAgent(error.agentId!)}
              data-testid="button-fix-agent"
            >
              <Wrench className="h-3 w-3" />
              Fix Agent Configuration
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BryteChat() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prevAgentName, setPrevAgentName] = useState<string | null>(null);
  const [lastError, setLastError] = useState<RoutingError | null>(null);

  const swarmId = params.id;

  const { data: swarm, isLoading: swarmLoading } = useQuery<SwarmWithAgents>({
    queryKey: ["/api/swarms", swarmId],
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<SwarmSession[]>({
    queryKey: ["/api/swarms", swarmId, "sessions"],
    enabled: !!swarmId,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<SwarmMessage[]>({
    queryKey: ["/api/swarms", swarmId, "sessions", activeSessionId, "messages"],
    enabled: !!activeSessionId && !!swarmId,
  });

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
      if (lastAssistant?.routedToAgentName && lastAssistant.routedToAgentName !== prevAgentName && prevAgentName !== null) {
        toast({
          title: "Agent Switch",
          description: `Now being handled by ${lastAssistant.routedToAgentName}`,
        });
      }
      if (lastAssistant?.routedToAgentName) {
        setPrevAgentName(lastAssistant.routedToAgentName);
      }
    }
  }, [messages]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/swarms/${swarmId}/sessions`, {});
      return res.json();
    },
    onSuccess: (session: SwarmSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId, "sessions"] });
      setActiveSessionId(session.id);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/swarms/${swarmId}/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: (deletedId: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId, "sessions"] });
      if (activeSessionId === deletedId) {
        const remaining = sessions.filter(s => s.id !== deletedId);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/swarms/${swarmId}/sessions/${activeSessionId}/messages`, { content });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.error) {
        setLastError(data.error);
      } else {
        setLastError(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/swarms", swarmId, "sessions", activeSessionId, "messages"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || !activeSessionId || sendMutation.isPending) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) return;
    setMessage("");
    sendMutation.mutate(trimmed);
  }, [message, activeSessionId, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleNewSession = useCallback(() => {
    createSessionMutation.mutate();
  }, [createSessionMutation]);

  const handleNavigateToAgent = useCallback((agentId: string) => {
    navigate(`/agents/${agentId}/edit`);
  }, [navigate]);

  if (swarmLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!swarm) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Swarm not found</p>
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-go-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;

  return (
    <div className="flex h-screen" data-testid="bryte-chat-page">
      <div className="w-64 border-r flex flex-col bg-muted/30">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="text-swarm-sidebar-name">{swarm.name}</p>
              <p className="text-xs text-muted-foreground">Swarm Chat</p>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleNewSession}
            disabled={createSessionMutation.isPending}
            data-testid="button-new-session"
          >
            {createSessionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            New Session
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-sessions">
                No sessions yet
              </p>
            ) : (
              sessions.map((session) => (
                <SwarmSessionCard
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={() => setActiveSessionId(session.id)}
                  onDelete={() => deleteSessionMutation.mutate(session.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {swarm.agents && swarm.agents.length > 0 && (
          <div className="border-t p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" />
              Agents ({swarm.agents.length})
            </p>
            <div className="space-y-1">
              {swarm.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 text-xs"
                  data-testid={`sidebar-agent-${agent.agentId}`}
                >
                  <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{agent.agentName || agent.agentId}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col">
        <header className="border-b bg-background p-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Network className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold" data-testid="text-chat-header-name">{swarm.name}</h1>
            {activeSessionId && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-active-session">
                <MessageSquare className="h-3 w-3 mr-1" />
                Session Active
              </Badge>
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messagesLoading || sessionsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-16 flex-1 max-w-[60%] rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : !activeSessionId || messages.length === 0 ? (
                <WelcomeScreen swarm={swarm} />
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => {
                    let handoffBanner = null;
                    if (msg.role === "assistant" && msg.routedToAgentName) {
                      const prevAssistant = messages.slice(0, idx).reverse().find(m => m.role === "assistant");
                      if (prevAssistant?.routedToAgentName && prevAssistant.routedToAgentName !== msg.routedToAgentName) {
                        handoffBanner = (
                          <AgentHandoffBanner
                            fromAgent={prevAssistant.routedToAgentName}
                            toAgent={msg.routedToAgentName}
                          />
                        );
                      }
                    }
                    return (
                      <div key={msg.id}>
                        {handoffBanner}
                        <MessageBubble message={msg} />
                      </div>
                    );
                  })}
                  {lastError && !sendMutation.isPending && (
                    <ErrorCard error={lastError} onNavigateToAgent={handleNavigateToAgent} />
                  )}
                  {sendMutation.isPending && <RoutingStatusIndicator />}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t bg-background p-4">
            <div className="max-w-3xl mx-auto">
              {!activeSessionId && (
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-sm">
                  <MessageSquare className="h-4 w-4" />
                  <span>Create a new session to start chatting</span>
                </div>
              )}
              {isOverLimit && (
                <div className="flex items-center gap-2 mb-2 text-destructive text-sm">
                  <span>Message is too long. Max {MAX_MESSAGE_LENGTH} characters.</span>
                </div>
              )}
              <Card className="p-2">
                <div className="flex gap-2">
                  <Textarea
                    ref={textareaRef}
                    placeholder={activeSessionId ? "Type your message..." : "Create a session first..."}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!activeSessionId || sendMutation.isPending}
                    className={`min-h-[44px] max-h-[120px] resize-none border-0 focus-visible:ring-0 ${
                      isOverLimit ? "text-destructive" : ""
                    }`}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH + 100}
                    data-testid="textarea-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!message.trim() || sendMutation.isPending || isOverLimit || !activeSessionId}
                    size="icon"
                    className="shrink-0"
                    data-testid="button-send"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground mt-2 px-1">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
