import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, MessageSquare, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PromptCoachTrigger, PromptCoachPanel } from "@/components/prompt-coach";
import type { ChatSessionWithPreview } from "@shared/schema";

interface SessionSidebarProps {
  agentId: string;
  agentName: string;
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onSessionDeleted?: (sessionId: string) => void;
  width?: number;
}

function SessionCard({
  session,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSessionWithPreview;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(session.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? "bg-primary/10 border border-primary/20"
          : "hover-elevate border border-transparent"
      }`}
      onClick={!isEditing ? onSelect : undefined}
      data-testid={`session-card-${session.id}`}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                className="h-6 text-sm px-1 py-0"
                data-testid="input-session-title"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSave();
                }}
                data-testid="button-save-title"
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                data-testid="button-cancel-edit"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-1">
              <p className="text-sm font-medium truncate" data-testid="text-session-title">
                {session.title}
              </p>
              {!isEditing && (
                <div className="flex gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsEditing(true);
                        }}
                        data-testid="button-rename-session"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Rename session</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                        }}
                        data-testid="button-delete-session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete session</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          )}
          {session.firstMessage && !isEditing && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {session.firstMessage}
            </p>
          )}
          <div className="flex items-center flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
            <span>{formatDate(session.lastMessageAt || session.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionSidebar({
  agentId,
  agentName,
  activeSessionId,
  onSessionSelect,
  onNewSession,
  onSessionDeleted,
  width = 320,
}: SessionSidebarProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const { toast } = useToast();

  const { data: sessions = [], isLoading } = useQuery<ChatSessionWithPreview[]>({
    queryKey: ["/api/agents", agentId, "sessions"],
  });

  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      await apiRequest("PATCH", `/api/agents/${agentId}/sessions/${sessionId}`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "sessions"] });
      toast({
        title: "Session renamed",
        description: "The session has been renamed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to rename session",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/agents/${agentId}/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: (deletedSessionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "sessions"] });
      onSessionDeleted?.(deletedSessionId);
      toast({
        title: "Session deleted",
        description: "The session has been deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete session",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="shrink-0 border-r bg-muted/30 flex flex-col h-full" style={{ width: `${width}px` }}>
      <div className="p-3 border-b shrink-0">
        <Button
          onClick={onNewSession}
          className="w-full"
          size="sm"
          data-testid="button-new-session"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Session
        </Button>
      </div>
      {coachOpen ? (
        <PromptCoachPanel agentId={agentId} agentName={agentName} onClose={() => setCoachOpen(false)} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Click "New Session" to start
                </p>
              </div>
            ) : (
              sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onSelect={() => onSessionSelect(session.id)}
                  onRename={(title) => renameMutation.mutate({ sessionId: session.id, title })}
                  onDelete={() => deleteMutation.mutate(session.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      )}
      <PromptCoachTrigger isOpen={coachOpen} onToggle={() => setCoachOpen(!coachOpen)} isLoading={false} />
    </div>
  );
}
