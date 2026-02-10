import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { GraduationCap, Send, X, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
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
}

interface PromptCoachProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onToggle: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  businessUseCase: "Business Use Case",
  domainKnowledge: "Domain Knowledge",
  validationRules: "Validation Rules",
  guardrails: "Guardrails",
};

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

export function PromptCoachPanel({ agentId, agentName, onClose }: { agentId: string; agentName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: `Hi! I'm your Prompt Coach for **${agentName}**. I can help you improve your agent's configuration — things like the business use case, domain knowledge, validation rules, and guardrails.\n\nWhat would you like to improve? Or say **"review my agent"** and I'll analyze your current setup.`,
        },
      ]);
    }
  }, []);

  const getChatHistory = useCallback(() => {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await apiRequest("POST", `/api/agents/${agentId}/prompt-coach`, {
        message: userMessage,
        chatHistory: getChatHistory(),
      });

      const result = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.message,
          suggestedChanges: result.suggestedChanges,
          appliedChanges: new Set(),
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I ran into an issue. Could you try again?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyChange = async (messageIndex: number, changeIndex: number, change: SuggestedChange) => {
    const key = `${messageIndex}-${changeIndex}`;
    setApplyingIndex(key);

    try {
      await apiRequest("POST", `/api/agents/${agentId}/prompt-coach/apply`, {
        field: change.field,
        action: change.action,
        content: change.content,
      });

      setMessages((prev) =>
        prev.map((msg, idx) => {
          if (idx === messageIndex && msg.appliedChanges) {
            const newApplied = new Set(msg.appliedChanges);
            newApplied.add(changeIndex);
            return { ...msg, appliedChanges: newApplied };
          }
          return msg;
        })
      );

      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });

      toast({
        title: "Change applied",
        description: `Updated ${FIELD_LABELS[change.field] || change.field} successfully.`,
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 border-t">
      <div className="flex items-center justify-between gap-2 p-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Prompt Coach</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-prompt-coach-close"
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
        <div className="space-y-4 p-4">
          {messages.map((msg, msgIdx) => (
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
                    return (
                      <Card key={changeIdx} className="p-3" data-testid={`coach-change-${msgIdx}-${changeIdx}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {FIELD_LABELS[change.field] || change.field}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {change.action === "append" ? "Add to" : "Replace"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{change.explanation}</p>
                          </div>
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
            placeholder="Ask for help improving your agent..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[80px] resize-none border-0 focus-visible:ring-0 text-sm"
            rows={1}
            data-testid="textarea-coach-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
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
