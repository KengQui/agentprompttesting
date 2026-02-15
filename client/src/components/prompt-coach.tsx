import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { GraduationCap, Send, X, Loader2, Check, ChevronDown, ChevronUp, Eraser, Clock, Undo2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SuggestedChange {
  field: string;
  action: "replace" | "append";
  content: string;
  explanation: string;
}

interface CoachMessage {
  role: "user" | "assistant";
  content: string;
  suggestedChanges?: SuggestedChange[];
  appliedChanges?: Set<number>;
  timestamp?: string;
}

interface PromptCoachProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onToggle: () => void;
  onConfigChanged?: (field: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  businessUseCase: "Business Use Case",
  domainKnowledge: "Domain Knowledge",
  validationRules: "Validation Rules",
  guardrails: "Guardrails",
  welcomeGreeting: "Welcome Greeting",
  welcomeSuggestedPrompts: "Welcome Prompts",
};

const TOKEN_LIMIT = 50000;
const TOKEN_WARNING_THRESHOLD = 0.8;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function PromptCoachTrigger({ isOpen, onToggle, isLoading }: { isOpen: boolean; onToggle: () => void; isLoading: boolean }) {
  return (
    <div
      className="flex items-center gap-2 p-3 border-t cursor-pointer hover-elevate shrink-0"
      onClick={onToggle}
      data-testid="button-prompt-coach-toggle"
    >
      <GraduationCap className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium flex-1">Prompt Coach</span>
      {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      <ChevronUp className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
    </div>
  );
}

export function PromptCoachPanel({ agentId, agentName, onClose, onConfigChanged }: { agentId: string; agentName: string; onClose: () => void; onConfigChanged?: (field: string) => void }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [applyingIndex, setApplyingIndex] = useState<string | null>(null);
  const [revertingIndex, setRevertingIndex] = useState<string | null>(null);
  const [revertHistory, setRevertHistory] = useState<Map<string, { field: string; previousValue: string }>>(new Map());
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const { toast } = useToast();

  const tokenUsage = useMemo(() => {
    const totalText = messages.map((m) => m.content).join("");
    const tokens = estimateTokens(totalText);
    const percentage = Math.min(tokens / TOKEN_LIMIT, 1);
    return { tokens, percentage };
  }, [messages]);

  const isAtLimit = tokenUsage.percentage >= 1;
  const isNearLimit = tokenUsage.percentage >= TOKEN_WARNING_THRESHOLD;

  const serializeMessages = useCallback((msgs: CoachMessage[]) => {
    return msgs.map((m) => ({
      role: m.role,
      content: m.content,
      suggestedChanges: m.suggestedChanges,
      appliedChanges: m.appliedChanges ? Array.from(m.appliedChanges) : undefined,
      timestamp: m.timestamp || new Date().toISOString(),
    }));
  }, []);

  const deserializeMessages = useCallback((data: any[]): CoachMessage[] => {
    return data.map((m) => ({
      role: m.role,
      content: m.content,
      suggestedChanges: m.suggestedChanges,
      appliedChanges: m.appliedChanges ? new Set(m.appliedChanges) : undefined,
      timestamp: m.timestamp,
    }));
  }, []);

  const saveHistory = useCallback(async (msgs: CoachMessage[]) => {
    try {
      await apiRequest("PUT", `/api/agents/${agentId}/prompt-coach/history`, {
        messages: serializeMessages(msgs),
      });
    } catch (err) {
      // Silent fail for save - non-critical
    }
  }, [agentId, serializeMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/agents/${agentId}/prompt-coach/history`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            setMessages(deserializeMessages(data));
            setIsLoadingHistory(false);
            return;
          }
        }
      } catch (err) {
        // Fall through to default welcome message
      }

      setMessages([
        {
          role: "assistant",
          content: `Hi! I'm your Prompt Coach for **${agentName}**. I can help you improve your agent's prompt and configuration — I'll analyze what's working and what needs fixing, then suggest specific changes.\n\nSay **"review my agent"** for a full analysis, or tell me about a specific issue you're seeing.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsLoadingHistory(false);
    };

    loadHistory();
  }, [agentId, agentName, deserializeMessages]);

  const getChatHistory = useCallback(() => {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isAtLimit) return;

    const userMessage = input.trim();
    setInput("");
    const now = new Date().toISOString();
    const updatedWithUser = [...messages, { role: "user" as const, content: userMessage, timestamp: now }];
    setMessages(updatedWithUser);
    setIsLoading(true);

    try {
      const response = await apiRequest("POST", `/api/agents/${agentId}/prompt-coach`, {
        message: userMessage,
        chatHistory: getChatHistory(),
      });

      const result = await response.json();

      const assistantMsg: CoachMessage = {
        role: "assistant",
        content: result.message,
        suggestedChanges: result.suggestedChanges,
        appliedChanges: new Set(),
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedWithUser, assistantMsg];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } catch (error: any) {
      const errorMsg: CoachMessage = {
        role: "assistant",
        content: "Sorry, I ran into an issue. Could you try again?",
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedWithUser, errorMsg];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyChange = async (messageIndex: number, changeIndex: number, change: SuggestedChange) => {
    const key = `${messageIndex}-${changeIndex}`;
    setApplyingIndex(key);

    try {
      const agentResponse = await fetch(`/api/agents/${agentId}`, { credentials: "include" });
      const agentData = await agentResponse.json();

      let previousValue = "";
      if (change.field === "welcomeGreeting") {
        previousValue = agentData.welcomeConfig?.greeting || "";
      } else if (change.field === "welcomeSuggestedPrompts") {
        previousValue = JSON.stringify(agentData.welcomeConfig?.suggestedPrompts || []);
      } else {
        previousValue = agentData[change.field] || "";
      }

      const response = await apiRequest("POST", `/api/agents/${agentId}/prompt-coach/apply`, {
        field: change.field,
        action: change.action,
        content: change.content,
      });
      const responseData = await response.json();

      const key = `${messageIndex}-${changeIndex}`;
      setRevertHistory((prev) => {
        const next = new Map(prev);
        next.set(key, { field: change.field, previousValue });
        return next;
      });

      const updatedMessages = messages.map((msg, idx) => {
        if (idx === messageIndex && msg.appliedChanges) {
          const newApplied = new Set(msg.appliedChanges);
          newApplied.add(changeIndex);
          return { ...msg, appliedChanges: newApplied };
        }
        return msg;
      });
      setMessages(updatedMessages);
      saveHistory(updatedMessages);

      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });

      if (onConfigChanged) {
        onConfigChanged(change.field);
      }

      toast({
        title: "Change applied",
        description: responseData.promptRegenerated 
          ? `Updated ${FIELD_LABELS[change.field] || change.field} and regenerated the system prompt.`
          : `Updated ${FIELD_LABELS[change.field] || change.field} successfully.`,
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: "Failed to apply change",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setApplyingIndex(null);
    }
  };

  const handleRevert = async (messageIndex: number, changeIndex: number) => {
    const key = `${messageIndex}-${changeIndex}`;
    const revertData = revertHistory.get(key);
    if (!revertData) return;
    setRevertingIndex(key);

    try {
      await apiRequest("POST", `/api/agents/${agentId}/prompt-coach/apply`, {
        field: revertData.field,
        action: "replace",
        content: revertData.previousValue,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });

      const updatedMessages = messages.map((msg, idx) => {
        if (idx === messageIndex && msg.appliedChanges) {
          const newApplied = new Set(msg.appliedChanges);
          newApplied.delete(changeIndex);
          return { ...msg, appliedChanges: newApplied };
        }
        return msg;
      });
      setMessages(updatedMessages);
      saveHistory(updatedMessages);

      setRevertHistory((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      if (onConfigChanged) {
        onConfigChanged(revertData.field);
      }

      toast({
        title: "Change reverted",
        description: `Restored ${FIELD_LABELS[revertData.field] || revertData.field} to its previous value.`,
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: "Failed to revert",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRevertingIndex(null);
    }
  };

  const togglePreview = (key: string) => {
    setExpandedPreviews((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    await apiRequest("DELETE", `/api/agents/${agentId}/prompt-coach/history`);
    setMessages([
      {
        role: "assistant",
        content: `Hi! I'm your Prompt Coach for **${agentName}**. I can help you improve your agent's prompt and configuration — I'll analyze what's working and what needs fixing, then suggest specific changes.\n\nSay **"review my agent"** for a full analysis, or tell me about a specific issue you're seeing.`,
        timestamp: new Date().toISOString(),
      },
    ]);
    setRevertHistory(new Map());
    setExpandedPreviews(new Set());
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t">
      <div className="flex items-center justify-between gap-2 p-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Prompt Coach</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearHistory}
              data-testid="button-prompt-coach-clear"
            >
              <Eraser className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-prompt-coach-close"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isLoadingHistory && messages.length > 1 && (
        <div className="px-3 pt-2 shrink-0">
          <div className="flex items-center gap-2" data-testid="context-usage-bar">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isAtLimit ? "bg-destructive" : isNearLimit ? "bg-yellow-500" : "bg-primary"
                }`}
                style={{ width: `${Math.round(tokenUsage.percentage * 100)}%` }}
              />
            </div>
            <span className={`text-[10px] shrink-0 ${isAtLimit ? "text-destructive" : "text-muted-foreground"}`}>
              {Math.round(tokenUsage.percentage * 100)}%
            </span>
          </div>
          {isAtLimit && (
            <p className="text-[11px] text-destructive mt-1">
              Context limit reached. Clear the conversation to continue.
            </p>
          )}
          {isNearLimit && !isAtLimit && (
            <p className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-1">
              Approaching context limit. Consider clearing soon.
            </p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
        <div className="space-y-4 p-4">
          {!isLoadingHistory && messages.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1" data-testid="text-coach-expiry-warning">
              <Clock className="h-3 w-3 shrink-0" />
              <span>Individual messages older than 2 weeks are automatically removed.</span>
            </div>
          )}
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.map((msg, msgIdx) => (
            <div key={msgIdx}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid={`coach-message-${msgIdx}`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>

              {msg.suggestedChanges && msg.suggestedChanges.length > 0 && (
                <div className="mt-2 space-y-2 ml-0">
                  {msg.suggestedChanges.map((change, changeIdx) => {
                    const isApplied = msg.appliedChanges?.has(changeIdx);
                    const isApplying = applyingIndex === `${msgIdx}-${changeIdx}`;
                    const changeKey = `${msgIdx}-${changeIdx}`;
                    const isPreviewExpanded = expandedPreviews.has(changeKey);
                    const canRevert = isApplied && revertHistory.has(changeKey);
                    const isReverting = revertingIndex === changeKey;
                    return (
                      <Card key={changeIdx} className="p-3" data-testid={`coach-change-${msgIdx}-${changeIdx}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {FIELD_LABELS[change.field] || change.field}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => togglePreview(changeKey)}
                              className="text-xs gap-1"
                              data-testid={`button-preview-change-${msgIdx}-${changeIdx}`}
                            >
                              {isPreviewExpanded ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              {isPreviewExpanded ? "Hide" : "Preview"}
                            </Button>
                            {canRevert && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevert(msgIdx, changeIdx)}
                                disabled={isReverting}
                                className="text-xs gap-1"
                                data-testid={`button-revert-change-${msgIdx}-${changeIdx}`}
                              >
                                {isReverting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Undo2 className="h-3 w-3" />
                                )}
                                Revert
                              </Button>
                            )}
                            <Button
                              variant={isApplied ? "outline" : "default"}
                              size="sm"
                              disabled={isApplied || isApplying}
                              onClick={() => handleApplyChange(msgIdx, changeIdx, change)}
                              data-testid={`button-apply-change-${msgIdx}-${changeIdx}`}
                            >
                              {isApplying ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : isApplied ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  Applied
                                </>
                              ) : (
                                "Apply"
                              )}
                            </Button>
                          </div>
                        </div>
                        {isPreviewExpanded && (
                          <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto" data-testid={`preview-content-${msgIdx}-${changeIdx}`}>
                            {change.content}
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1 text-right">
                          {change.action === "append"
                            ? `Will add to existing ${(FIELD_LABELS[change.field] || change.field).toLowerCase()}`
                            : `Will replace existing ${(FIELD_LABELS[change.field] || change.field).toLowerCase()}`}
                        </p>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="border-t p-3 shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder={isAtLimit ? "Context limit reached. Clear conversation to continue." : "Ask for help improving your agent..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[80px] resize-none border-0 focus-visible:ring-0 text-sm"
            rows={1}
            disabled={isAtLimit}
            data-testid="textarea-coach-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isAtLimit}
            size="icon"
            className="shrink-0"
            data-testid="button-coach-send"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
