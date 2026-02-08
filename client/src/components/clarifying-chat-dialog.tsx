import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles, MessageCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ClarifyingInsight, GeminiModel, DomainDocument } from "@shared/schema";
import { geminiModelDisplayNames, defaultGenerationModel } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClarifyingChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generationType: "validation" | "guardrails";
  businessUseCase: string;
  domainKnowledge?: string;
  domainDocuments?: DomainDocument[];
  existingInsights: ClarifyingInsight[];
  initialQuestion: string;
  onComplete: (insights: ClarifyingInsight[], generatedContent: string) => void;
}

export function ClarifyingChatDialog({
  open,
  onOpenChange,
  generationType,
  businessUseCase,
  domainKnowledge,
  domainDocuments,
  existingInsights,
  initialQuestion,
  onComplete,
}: ClarifyingChatDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [gatheredInsights, setGatheredInsights] = useState<ClarifyingInsight[]>([]);
  const [isReadyToGenerate, setIsReadyToGenerate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && initialQuestion) {
      setMessages([{ role: "assistant", content: initialQuestion }]);
      setGatheredInsights([]);
      setIsReadyToGenerate(false);
    }
  }, [open, initialQuestion]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);

    try {
      const response = await apiRequest("POST", "/api/generate/clarifying-chat", {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        clarifyingInsights: [...existingInsights, ...gatheredInsights],
        generationType,
        chatHistory: messages,
        userMessage,
      });

      const result = await response.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.message },
      ]);

      if (result.gatheredInsight) {
        setGatheredInsights((prev) => [...prev, result.gatheredInsight]);
      }

      if (result.isReadyToGenerate) {
        setIsReadyToGenerate(true);
      }
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error. Let me try again or you can proceed to generate.",
        },
      ]);
      setIsReadyToGenerate(true);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async (model: GeminiModel) => {
    setIsGenerating(true);
    try {
      const allInsights = [...existingInsights, ...gatheredInsights];
      const endpoint =
        generationType === "validation"
          ? "/api/generate/validation-rules-with-insights"
          : "/api/generate/guardrails-with-insights";

      const response = await apiRequest("POST", endpoint, {
        businessUseCase,
        domainKnowledge,
        domainDocuments,
        clarifyingInsights: allInsights,
        model,
      });

      const result = await response.json();
      const content =
        generationType === "validation"
          ? result.validationRules
          : result.guardrails;

      onComplete(allInsights, content);
      onOpenChange(false);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Failed to generate: ${error?.message || "Please try again."}`,
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const typeLabel = generationType === "validation" ? "Validation Rules" : "Guardrails";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Let's gather more context
          </DialogTitle>
          <DialogDescription>
            I need a bit more information to generate good {typeLabel.toLowerCase()}. Answer a few quick questions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-[250px] max-h-[350px] pr-4" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  data-testid={`chat-message-${msg.role}-${idx}`}
                >
                  {msg.role === "user" ? msg.content : (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0">
                      <ReactMarkdown>{msg.content.replace(/```action\s*\n?[\s\S]*?```/gi, '').trim()}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 pt-4 border-t">
          <Input
            ref={inputRef}
            placeholder="Type your answer..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing || isGenerating}
            data-testid="input-clarifying-chat"
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isProcessing || isGenerating}
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
            data-testid="button-cancel-chat"
          >
            Cancel
          </Button>
          <div className="flex items-center">
            <Button
              disabled={isGenerating || (!isReadyToGenerate && messages.length < 2)}
              onClick={() => handleGenerate(defaultGenerationModel)}
              className="rounded-r-none"
              data-testid="button-generate-with-insights"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate {typeLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isGenerating || (!isReadyToGenerate && messages.length < 2)}
                  className="rounded-l-none border-l-0 px-2"
                  data-testid="button-model-dropdown"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(geminiModelDisplayNames) as GeminiModel[]).map((model) => (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => handleGenerate(model)}
                    data-testid={`menu-item-generate-${model}`}
                  >
                    {geminiModelDisplayNames[model]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
