import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, MessageSquare, Settings, Bot, Sparkles, LogOut, PlayCircle, Copy, Zap, HelpCircle, CloudDownload, Download, Upload, Loader2, Database, ShieldCheck, Pin, ChevronDown, ChevronUp, Check, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
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

interface SnapshotSession {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage?: string;
  isPinned: boolean;
}

function SessionSnapshotSection() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = useQuery<{ sessions: SnapshotSession[] }>({
    queryKey: ["/api/admin/snapshot-sessions"],
    enabled: expanded,
  });

  const pinMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const res = await apiRequest("POST", "/api/admin/pin-sessions-to-snapshot", { sessionIds });
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Sessions pinned",
        description: `${result.pinnedCount} session(s) will be copied to production on next publish.`,
      });
      refetch();
      setSelected(new Set());
    },
    onError: (error: Error) => {
      toast({ title: "Failed to pin sessions", description: error.message, variant: "destructive" });
    },
  });

  const sessions = data?.sessions || [];

  const agentGroups = sessions.reduce<Record<string, SnapshotSession[]>>((acc, s) => {
    if (!acc[s.agentName]) acc[s.agentName] = [];
    acc[s.agentName].push(s);
    return acc;
  }, {});

  const toggleSession = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    pinMutation.mutate(Array.from(selected));
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div
          className="flex items-center justify-between gap-4 cursor-pointer"
          onClick={() => setExpanded(v => !v)}
          data-testid="button-toggle-session-snapshot"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <Pin className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Pin Sessions to Production</p>
              <p className="text-xs text-muted-foreground">Select chat sessions to copy to production on next publish</p>
            </div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>

        {expanded && (
          <div className="mt-4 space-y-4">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No chat sessions found.</p>
            ) : (
              <>
                {Object.entries(agentGroups).map(([agentName, agentSessions]) => (
                  <div key={agentName}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{agentName}</p>
                    <div className="space-y-1">
                      {agentSessions.map(session => (
                        <div
                          key={session.id}
                          className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleSession(session.id)}
                          data-testid={`row-session-${session.id}`}
                        >
                          <Checkbox
                            checked={selected.has(session.id)}
                            onCheckedChange={() => toggleSession(session.id)}
                            onClick={e => e.stopPropagation()}
                            data-testid={`checkbox-session-${session.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{session.title}</span>
                              {session.isPinned && (
                                <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0" data-testid={`badge-pinned-${session.id}`}>
                                  <Check className="h-3 w-3 mr-1" />
                                  Pinned
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground shrink-0">{session.messageCount} messages</span>
                            </div>
                            {session.firstMessage && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{session.firstMessage}</p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {new Date(session.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={selected.size === 0 || pinMutation.isPending}
                    data-testid="button-pin-sessions"
                  >
                    {pinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Pin className="h-4 w-4 mr-1.5" />}
                    {selected.size === 0 ? "Select sessions to pin" : `Pin ${selected.size} session${selected.size > 1 ? "s" : ""} to Snapshot`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackupSection() {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/admin/backup-export", { credentials: "include" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      a.href = url;
      a.download = filenameMatch?.[1] || `agent-studio-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Backup exported", description: "Your backup file has been downloaded." });
    } catch (error: any) {
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowImportConfirm(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImportConfirm = async () => {
    if (!pendingFile) return;
    setShowImportConfirm(false);
    setIsImporting(true);
    try {
      const text = await pendingFile.text();
      const backup = JSON.parse(text);
      if (!backup?.version || !backup?.data) {
        throw new Error("Invalid backup file format");
      }
      const response = await fetch("/api/admin/backup-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: text,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import failed");
      }
      const result = await response.json();
      toast({
        title: "Backup restored",
        description: `Restored ${result.counts?.agents || 0} agents, ${result.counts?.users || 0} users, ${result.counts?.chatSessions || 0} chat sessions.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      setPendingFile(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Data Backup</p>
                <p className="text-xs text-muted-foreground">Export or restore your database to protect against data loss</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
                data-testid="button-backup-export"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Export Backup</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                data-testid="button-backup-import"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                <span className="ml-1.5">Restore Backup</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-backup-file"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace ALL current data (agents, users, chat history) with the data from the backup file "{pendingFile?.name}". This action cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFile(null)} data-testid="button-import-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportConfirm} data-testid="button-import-confirm">
              Yes, Restore Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
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
              <Link href="/swarms">
                <Button variant="outline" className="gap-2" data-testid="button-swarms">
                  <Network className="h-4 w-4" />
                  Swarms
                </Button>
              </Link>
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

      <main className="container mx-auto px-4 py-8 space-y-6">
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
        {user?.username === "kengqui.chia@ukg.com" && <SessionSnapshotSection />}
        <BackupSection />
      </main>
    </div>
  );
}
