import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Send, Bot, User, Settings, Loader2, X, AlertCircle, MessageSquare, Eraser, Plus, PanelLeftClose, PanelLeft, Target, Columns, FunctionSquare, Layers, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselApi } from "@/components/ui/carousel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ContextProgressBar } from "@/components/context-progress-bar";
import { SessionSidebar } from "@/components/session-sidebar";
import { ResizeHandle, useResizable } from "@/components/resize-handle";
import type { Agent, ChatMessage, ChatSession, ChatSessionWithPreview, WelcomeConfig } from "@shared/schema";

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_COOLDOWN = 2000;
const HCM_EXPRESSION_BUILDER_AGENT_ID = "0edd0f1d-d9b6-4bc5-8054-b35cd7557c8c";

function stripActionBlocks(text: string): string {
  let cleaned = text.replace(/```action\s*\n?[\s\S]*?```/gi, '');
  cleaned = cleaned.replace(/```action\s*\n?[\s\S]*$/gi, '');
  return cleaned.trim();
}

const COLUMN_ADDED_FALLBACK_PILLS = ["See related expressions", "Create new expression", "I'm done"];
const EXPRESSION_PRESENTED_FALLBACK_PILLS = ["Edit this expression", "Create new column", "Test with my data", "Explain this expression"];
const VALIDATION_DONE_FALLBACK_PILLS = ["Create new column", "Revise this expression", "Explain this expression"];
const EXPLANATION_DONE_FALLBACK_PILLS = ["Create new column", "Revise this expression", "Test with my data"];

function parseSuggestedActions(text: string, isHcmAgent?: boolean): { cleanedText: string; actions: string[] } {
  const regex = /\{\{SUGGESTED_ACTIONS:(.*?)\}\}/g;
  const match = regex.exec(text);
  if (!match) {
    if (/has been added|added it to your report|added to the report|added to your report|successfully created the calculated column/i.test(text)) {
      return { cleanedText: text, actions: COLUMN_ADDED_FALLBACK_PILLS };
    }
    if (isHcmAgent) {
      const knownFns = /\b(Add|If|Value|Subtract|Multiply|Divide|Concat|DateDiff|FormatDate|GetYear|GetMonth|GetDay|In|Eq|Or|And|Not|Min|Max|Len|Search|Today|Round|Truncate)\s*\(/;
      const hasHcmExpression = (knownFns.test(text) && /`/.test(text)) || /```[\s\S]*?/.test(text) && knownFns.test(text);
      if (hasHcmExpression && /suggested column name/i.test(text)) {
        return { cleanedText: text, actions: EXPRESSION_PRESENTED_FALLBACK_PILLS };
      }
      if (hasHcmExpression && /will produce a \*?\*?\w+\*?\*? output/i.test(text)) {
        return { cleanedText: text, actions: EXPRESSION_PRESENTED_FALLBACK_PILLS };
      }
      if (hasHcmExpression && /here's (the|a) revised|updated expression|revised expression/i.test(text)) {
        return { cleanedText: text, actions: EXPRESSION_PRESENTED_FALLBACK_PILLS };
      }
      if (hasHcmExpression && /Row \d+.*?[→=]|substitut.*?values|let'?s validate/i.test(text)) {
        return { cleanedText: text, actions: VALIDATION_DONE_FALLBACK_PILLS };
      }
      if (hasHcmExpression && /\b1\.\s*(your )?objective\b/i.test(text) && /\bcombining everything\b/i.test(text)) {
        return { cleanedText: text, actions: EXPLANATION_DONE_FALLBACK_PILLS };
      }
    }
    return { cleanedText: text, actions: [] };
  }
  const actions = match[1].split('|').map(a => a.trim()).filter(Boolean);
  const cleanedText = text.replace(regex, '').trim();
  return { cleanedText, actions };
}

// PROTOTYPE ONLY: Split-bubble animation for column creation.
// This simulates a "processing" step between documentation and column confirmation
// by splitting the AI response into two message bubbles with typing dots in between.
// This is a UI-only effect for the Agent Studio testing interface.
// For production HCM integration: the agent prompt already outputs these as distinct
// logical steps (documentation → confirmation → suggestions). Your product UI can
// insert its own processing animation (spinner, progress bar, etc.) between them.
function splitColumnBuildResponse(content: string): { before: string; after: string } | null {
  const buildMarker = /I'll now add this as a new column to your report\./i;
  const match = content.match(buildMarker);
  if (!match || match.index === undefined) return null;

  const splitPoint = match.index + match[0].length;
  const before = content.slice(0, splitPoint).trim();
  const after = content.slice(splitPoint).trim();

  if (!after || !/has been added/i.test(after)) return null;

  return { before, after };
}

function AssistantBubble({ content, timestamp, testId }: { content: string; timestamp: string; testId?: string }) {
  return (
    <div
      className="flex gap-3"
      data-testid={testId}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none chat-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
        <p className="text-xs mt-1 text-muted-foreground">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// PROTOTYPE ONLY: Animated split-bubble display.
// Shows the first part of the response, then typing dots (simulating processing),
// then the second part. Timing: 800ms delay before dots, 2000ms dots duration.
// For production: replace with your product's native loading/processing UI pattern.
function SplitMessageBubbles({ message, before, after }: { message: ChatMessage; before: string; after: string }) {
  const [phase, setPhase] = useState<"before" | "typing" | "after">("before");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;

    const messageAge = Date.now() - new Date(message.timestamp).getTime();
    if (messageAge > 5000) {
      setPhase("after");
      hasAnimated.current = true;
      return;
    }

    hasAnimated.current = true;
    const showTypingTimer = setTimeout(() => {
      setPhase("typing");
    }, 800);
    const showAfterTimer = setTimeout(() => {
      setPhase("after");
    }, 2800);
    return () => {
      clearTimeout(showTypingTimer);
      clearTimeout(showAfterTimer);
    };
  }, [message.timestamp]);

  return (
    <>
      <AssistantBubble
        content={before}
        timestamp={message.timestamp}
        testId={`message-${message.id}-before`}
      />
      {phase === "typing" && (
        <TypingIndicator />
      )}
      {phase === "after" && (
        <AssistantBubble
          content={after}
          timestamp={message.timestamp}
          testId={`message-${message.id}-after`}
        />
      )}
    </>
  );
}

function extractHcmExpression(text: string): string | null {
  const codeBlockMatch = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const inlineRegex = /`([^`]{10,})`/g;
  let match: RegExpExecArray | null;
  let withParens: string | null = null;
  let longest: string | null = null;
  while ((match = inlineRegex.exec(text)) !== null) {
    const val = match[1].trim();
    if (!withParens && /\(.*\)/.test(val)) withParens = val;
    if (!longest || val.length > longest.length) longest = val;
  }
  if (withParens) return withParens;
  if (longest) return longest;
  return null;
}

function extractHcmExpressionFromMessages(messages: Array<{ role: string; content: string }>): string | null {
  const assistantMsgs = messages.filter(m => m.role === "assistant");
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const codeBlockMatch = assistantMsgs[i].content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
  }
  let fallback: string | null = null;
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const expr = extractHcmExpression(assistantMsgs[i].content);
    if (expr) { fallback = expr; break; }
  }
  return fallback;
}

function SuggestedActionPills({ actions, onSelect, onInjectExpression, disabled }: { actions: string[]; onSelect: (action: string) => void; onInjectExpression?: () => void; disabled?: boolean }) {
  const [clicked, setClicked] = useState(false);

  if (clicked || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 ml-11 mt-1" data-testid="suggested-action-pills">
      {actions.map((action, index) => (
        <Badge
          key={index}
          variant="outline"
          className="cursor-pointer px-3 py-1.5 text-xs font-medium"
          onClick={() => {
            if (disabled) return;
            if (/revise this expression|edit this expression/i.test(action) && onInjectExpression) {
              setClicked(true);
              onInjectExpression();
              return;
            }
            setClicked(true);
            onSelect(action);
          }}
          data-testid={`pill-action-${index}`}
        >
          {action}
        </Badge>
      ))}
    </div>
  );
}

interface ExplanationSection {
  title: string;
  content: string;
  icon: typeof Target;
}

const EXPLANATION_SECTION_META: { pattern: RegExp; label: string; icon: typeof Target }[] = [
  { pattern: /your\s+objective/i, label: "Your Objective", icon: Target },
  { pattern: /identifying\s+necessary\s+columns/i, label: "Columns Used", icon: Columns },
  { pattern: /using\s+the\s+/i, label: "Function Logic", icon: FunctionSquare },
  { pattern: /combining\s+everything/i, label: "Final Expression", icon: Layers },
];

function parseExplanationSections(text: string): ExplanationSection[] | null {
  const numberedPattern = /(^|\n)\s*\*{0,2}\d+\.\s*\*{0,2}\s*/g;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = numberedPattern.exec(text)) !== null) {
    if (/objective|column|function|combining/i.test(text.slice(m.index, m.index + 80))) {
      matches.push(m);
    }
  }
  if (matches.length < 3) return null;

  const sections: ExplanationSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const chunk = text.slice(start, end).trim();

    const headerMatch = chunk.match(/^\*{0,2}\d+\.\s*\*{0,2}\s*(.+?)(\*{0,2})\s*\n/);
    const headerText = headerMatch ? headerMatch[1].replace(/\*+/g, "").trim() : "";
    const body = headerMatch
      ? chunk.slice(headerMatch[0].length).trim()
      : chunk.replace(/^\*{0,2}\d+\.\s*\*{0,2}[^\n]*\n?/, "").trim();

    const meta = EXPLANATION_SECTION_META.find(m => m.pattern.test(headerText));
    sections.push({
      title: meta?.label || headerText.replace(/[*:#]/g, "").trim(),
      content: body,
      icon: meta?.icon || Layers,
    });
  }

  return sections.length >= 3 ? sections : null;
}

function isExplanationMessage(text: string): boolean {
  return /\*{0,2}1\.\s*\*{0,2}\s*(your\s+)?objective/i.test(text) && /combining\s+everything/i.test(text);
}

function ExpressionExplanationCard({ content, timestamp }: { content: string; timestamp: string }) {
  const sections = parseExplanationSections(content);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!sections) return null;

  const handleCopy = (text: string, idx: number) => {
    const codeMatch = text.match(/```[\s\S]*?\n([\s\S]*?)```/);
    const toCopy = codeMatch ? codeMatch[1].trim() : text.trim();
    navigator.clipboard.writeText(toCopy);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="flex gap-3" data-testid="explanation-card">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] space-y-0.5">
        <Card className="overflow-visible p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
            <FunctionSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Expression Breakdown</span>
          </div>
          <div className="divide-y divide-card-border">
            {sections.map((section, idx) => {
              const Icon = section.icon;
              const isFinal = idx === sections.length - 1;
              const hasCode = /```/.test(section.content);

              return (
                <div key={idx} className="px-4 py-3" data-testid={`explanation-section-${idx}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.title}
                    </span>
                    {isFinal && hasCode && (
                      <button
                        className="ml-auto p-1 rounded-md text-muted-foreground hover-elevate active-elevate-2"
                        onClick={() => handleCopy(section.content, idx)}
                        data-testid={`button-copy-expression-${idx}`}
                      >
                        {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none chat-markdown pl-5.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <p className="text-xs text-muted-foreground px-1 pt-1">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

interface ValidationRow {
  employeeName: string;
  inputs: { name: string; value: string }[];
  calculationSteps: string[];
  result: string;
}

function isValidationMessage(text: string): boolean {
  const hasRows = /\*{0,2}Row\s+\d+/i.test(text);
  const hasResult = /\*{0,2}Result:?\*{0,2}/i.test(text);
  const hasValidationContext = /sample\s+data|report\s+data|validation/i.test(text) || /\*{0,2}Inputs?:?\*{0,2}/i.test(text) || /\*{0,2}Calculation:?\*{0,2}/i.test(text);
  return hasRows && hasResult && hasValidationContext;
}

function parseValidationRows(text: string): { rows: ValidationRow[]; footnote: string } | null {
  const rowPattern = /(^|\n)\s*\*{0,2}Row\s+\d+/gi;
  const allMatches: number[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = rowPattern.exec(text)) !== null) {
    allMatches.push(rm.index);
  }
  if (allMatches.length === 0) return null;

  const structuralMarker = /\*{0,2}(?:Inputs?|Calculation|Result):?\*{0,2}/i;
  const rowMatches: number[] = [];
  let footnoteStart = -1;
  for (let i = 0; i < allMatches.length; i++) {
    const start = allMatches[i];
    const end = i + 1 < allMatches.length ? allMatches[i + 1] : text.length;
    const chunk = text.slice(start, end);
    if (structuralMarker.test(chunk)) {
      rowMatches.push(start);
    } else {
      footnoteStart = start;
      break;
    }
  }
  if (rowMatches.length === 0) return null;

  const rows: ValidationRow[] = [];
  let footnote = "";

  const lastRowEnd = footnoteStart >= 0 ? footnoteStart : text.length;

  for (let i = 0; i < rowMatches.length; i++) {
    const start = rowMatches[i];
    const end = i + 1 < rowMatches.length ? rowMatches[i + 1] : lastRowEnd;
    const chunk = text.slice(start, end).trim();

    const nameMatch = chunk.match(/Row\s+\d+[:\s]*(?:Employee[:\s]*)?\*{0,2}\s*(.+?)\s*\*{0,2}\s*\n/i);
    const employeeName = nameMatch ? nameMatch[1].replace(/\*+/g, "").trim() : `Row ${i + 1}`;

    const inputs: { name: string; value: string }[] = [];
    const inputSection = chunk.match(/\*{0,2}Inputs?:?\*{0,2}\s*([\s\S]*?)(?=\n\s*-?\s*\*{0,2}Calc|\n\s*-?\s*\*{0,2}Result)/i);
    if (inputSection) {
      const backtickRegex = /`([^`]+)`\s*=\s*"?([^",\n]+)"?/g;
      let ip: RegExpExecArray | null;
      while ((ip = backtickRegex.exec(inputSection[1])) !== null) {
        inputs.push({ name: ip[1], value: ip[2].replace(/\\"/g, '"').trim() });
      }
      if (inputs.length === 0) {
        const colonRegex = /[-*]\s*\*{0,2}([^:*]+)\*{0,2}:\s*(.+)/g;
        let cp: RegExpExecArray | null;
        while ((cp = colonRegex.exec(inputSection[1])) !== null) {
          inputs.push({ name: cp[1].trim(), value: cp[2].trim() });
        }
      }
    }

    const calcSteps: string[] = [];
    const calcSection = chunk.match(/\*{0,2}Calculation:?\*{0,2}\s*\n([\s\S]*?)(?=\n\s*-?\s*\*{0,2}Result)/i);
    if (calcSection) {
      const lines = calcSection[1].split("\n").map(l => l.trim()).filter(l => l.length > 0 && l !== "-");
      for (const line of lines) {
        calcSteps.push(line.replace(/^=\s*/, "").replace(/`/g, "").trim());
      }
    }

    const resultMatch = chunk.match(/\*{0,2}Result:?\*{0,2}\s*(.+)/i);
    const result = resultMatch ? resultMatch[1].replace(/\*+/g, "").trim() : "";

    rows.push({ employeeName, inputs, calculationSteps: calcSteps, result });
  }

  if (footnoteStart >= 0) {
    const raw = text.slice(footnoteStart).trim();
    const cleaned = raw.replace(/\{\{SUGGESTED_ACTIONS:.*?\}\}/g, "").trim();
    if (cleaned) footnote = cleaned;
  } else if (rowMatches.length > 0) {
    const lastRowStart = rowMatches[rowMatches.length - 1];
    const lastRowChunk = text.slice(lastRowStart);
    const resultEnd = lastRowChunk.search(/\*{0,2}Result:?\*{0,2}\s*.+/i);
    if (resultEnd > -1) {
      const afterResult = lastRowChunk.slice(resultEnd);
      const resultLineEnd = afterResult.indexOf("\n");
      if (resultLineEnd > -1) {
        const trailing = afterResult.slice(resultLineEnd).trim();
        const cleaned = trailing.replace(/\{\{SUGGESTED_ACTIONS:.*?\}\}/g, "").trim();
        if (cleaned) footnote = cleaned;
      }
    }
  }

  return rows.length > 0 ? { rows, footnote } : null;
}

function ValidationRowCard({ row, index, note }: { row: ValidationRow; index: number; note?: string }) {
  const isError = /error/i.test(row.result) || row.result.trim() === "—";
  return (
    <div className="px-4 py-3 space-y-3" data-testid={`validation-row-${index}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Row {index + 1}</span>
        <span className="text-muted-foreground">|</span>
        <span className="font-medium">{row.employeeName}</span>
      </div>
      {row.inputs.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inputs</span>
          <div className="flex flex-wrap gap-2">
            {row.inputs.map((input, j) => (
              <div key={j} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">{input.name}</span>
                <span className="mx-1">=</span>
                <span className="font-mono font-medium">{input.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {row.calculationSteps.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculation</span>
          <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs space-y-0.5">
            {row.calculationSteps.map((step, j) => (
              <div key={j} className={j > 0 ? "text-muted-foreground" : ""}>
                {j > 0 && <span className="mr-1">=</span>}
                {step}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isError ? "border-destructive/30 bg-destructive/5 dark:bg-destructive/10" : "dark:bg-muted/60 border-border/50 bg-[#f3f4f6]"}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</span>
        <span className={`ml-auto font-mono text-sm font-semibold ${isError ? "text-destructive" : "text-[#6b7280]"}`}>{isError ? "—" : row.result}</span>
      </div>
      {note && (
        <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${isError ? "bg-destructive/5 dark:bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`} data-testid={`validation-row-note-${index}`}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

function SampleDataValidationCarousel({ content, timestamp }: { content: string; timestamp: string }) {
  const parsed = parseValidationRows(content);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrentIdx(api.selectedScrollSnap());
    const onSelect = () => setCurrentIdx(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => { api.off("select", onSelect); };
  }, [api]);

  if (!parsed || parsed.rows.length === 0) return null;

  const { rows, footnote } = parsed;
  const total = rows.length;

  const rowNotes: (string | undefined)[] = rows.map(() => undefined);
  if (footnote) {
    const errorRowIndices = rows.reduce<number[]>((acc, r, idx) => {
      if (/error/i.test(r.result) || r.result.trim() === "—") acc.push(idx);
      return acc;
    }, []);
    if (errorRowIndices.length > 0) {
      for (const idx of errorRowIndices) rowNotes[idx] = footnote;
    } else {
      const mentionedIdx = rows.findIndex(r =>
        footnote.toLowerCase().includes(r.employeeName.toLowerCase())
      );
      rowNotes[mentionedIdx >= 0 ? mentionedIdx : rows.length - 1] = footnote;
    }
  }

  return (
    <div className="flex gap-3" data-testid="validation-carousel">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-[80%] space-y-0.5">
        <Card className="overflow-visible p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-card-border">
            <span className="text-sm font-semibold">Report Data Validation</span>
            <span className="ml-auto text-xs text-muted-foreground" data-testid="text-carousel-counter">{currentIdx + 1} / {total}</span>
          </div>

          <Carousel
            setApi={setApi}
            opts={{ align: "start", loop: false }}
            className="w-full"
          >
            <CarouselContent className="-ml-0">
              {rows.map((row, i) => (
                <CarouselItem key={i} className="pl-0">
                  <ValidationRowCard row={row} index={i} note={rowNotes[i]} />
                </CarouselItem>
              ))}
            </CarouselContent>

            {total > 1 && (
              <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-card-border">
                <CarouselPrevious
                  className="static translate-y-0 h-8 w-8"
                  variant="ghost"
                  data-testid="button-carousel-prev"
                />
                <div className="flex gap-1.5">
                  {rows.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => api?.scrollTo(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentIdx ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                      }`}
                      data-testid={`button-carousel-dot-${i}`}
                    />
                  ))}
                </div>
                <CarouselNext
                  className="static translate-y-0 h-8 w-8"
                  variant="ghost"
                  data-testid="button-carousel-next"
                />
              </div>
            )}
          </Carousel>
        </Card>
        <p className="text-xs text-muted-foreground px-1 pt-1">
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message, agentId, isLastAssistant, onSendMessage, onInjectExpression }: { message: ChatMessage; agentId?: string; isLastAssistant?: boolean; onSendMessage?: (text: string) => void; onInjectExpression?: () => void }) {
  const isUser = message.role === "user";
  const isHcmAgent = agentId === HCM_EXPRESSION_BUILDER_AGENT_ID;
  const rawContent = isUser ? message.content : stripActionBlocks(message.content);
  const { cleanedText: displayContent, actions } = isUser ? { cleanedText: rawContent, actions: [] } : parseSuggestedActions(rawContent, isHcmAgent);
  const showPills = isLastAssistant && actions.length > 0 && onSendMessage;
  const splitResult = !isUser && isHcmAgent ? splitColumnBuildResponse(displayContent) : null;

  if (splitResult) {
    return (
      <>
        <SplitMessageBubbles
          message={message}
          before={splitResult.before}
          after={splitResult.after}
        />
        {showPills && <SuggestedActionPills actions={actions} onSelect={onSendMessage} onInjectExpression={onInjectExpression} />}
      </>
    );
  }

  const explanationSections = !isUser && isHcmAgent && isExplanationMessage(displayContent)
    ? parseExplanationSections(displayContent)
    : null;

  if (explanationSections) {
    return (
      <>
        <ExpressionExplanationCard content={displayContent} timestamp={message.timestamp} />
        {showPills && <SuggestedActionPills actions={actions} onSelect={onSendMessage} onInjectExpression={onInjectExpression} />}
      </>
    );
  }

  const validationRows = !isUser && isHcmAgent && isValidationMessage(displayContent)
    ? parseValidationRows(displayContent)
    : null;

  if (validationRows) {
    return (
      <>
        <SampleDataValidationCarousel content={displayContent} timestamp={message.timestamp} />
        {showPills && <SuggestedActionPills actions={actions} onSelect={onSendMessage} onInjectExpression={onInjectExpression} />}
      </>
    );
  }

  return (
    <>
      <div
        className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
        data-testid={`message-${message.id}`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </div>
        <div
          className={`max-w-[80%] rounded-lg px-4 py-2 ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{displayContent}</p>
          ) : (
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </div>
          )}
          <p
            className={`text-xs mt-1 ${
              isUser ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
      {showPills && <SuggestedActionPills actions={actions} onSelect={onSendMessage} onInjectExpression={onInjectExpression} />}
    </>
  );
}

function TypingIndicator({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-3 py-2">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-xs text-muted-foreground"
            data-testid="button-cancel-response"
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function ContextSummary({ messages, sessionId }: { messages: ChatMessage[]; sessionId?: string }) {
  if (messages.length === 0) return null;
  
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
      <MessageSquare className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground font-mono">
        Conversation ID: {sessionId || "—"}
      </span>
    </div>
  );
}

function CharacterCounter({ current, max }: { current: number; max: number }) {
  const percentage = (current / max) * 100;
  const isWarning = percentage > 80;
  const isError = current > max;
  
  return (
    <span
      className={`text-xs ${
        isError ? "text-destructive" : isWarning ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"
      }`}
      data-testid="text-character-count"
    >
      {current}/{max}
    </span>
  );
}


function EmptyChat({ agentName, hasSession, welcomeConfig, onSendPrompt }: { 
  agentName: string; 
  hasSession: boolean;
  welcomeConfig?: WelcomeConfig | null;
  onSendPrompt?: (prompt: string) => void;
}) {
  if (welcomeConfig?.enabled && welcomeConfig.suggestedPrompts?.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8" data-testid="welcome-screen">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-1" data-testid="text-welcome-greeting-title">
          {agentName}
        </h3>
        <p className="text-muted-foreground text-center max-w-md mb-6" data-testid="text-welcome-greeting">
          {welcomeConfig.greeting}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {welcomeConfig.suggestedPrompts.map((prompt, index) => (
            <Card
              key={prompt.id || index}
              className="hover-elevate cursor-pointer p-4 transition-colors"
              onClick={() => onSendPrompt?.(prompt.prompt)}
              data-testid={`card-suggested-prompt-${index}`}
            >
              <p className="text-sm font-medium mb-1" data-testid={`text-prompt-title-${index}`}>
                {prompt.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-prompt-text-${index}`}>
                {prompt.prompt}
              </p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-12" data-testid="empty-chat">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-2">
        {hasSession ? "Start a conversation" : "Create a session to begin"}
      </h3>
      <p className="text-muted-foreground text-center max-w-sm">
        {hasSession 
          ? `Send a message to ${agentName} to begin testing your agent configuration.`
          : "Click 'New Session' in the sidebar to start a new conversation."
        }
      </p>
    </div>
  );
}

export default function Chat() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [lastMessageTime, setLastMessageTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [isCancelled, setIsCancelled] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { width: sidebarWidth, handleMouseDown: handleSidebarResize } = useResizable({
    initialWidth: 320,
    minWidth: 200,
    maxWidth: 400,
    direction: "left",
    storageKey: "chat-sidebar-width",
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingPromptRef = useRef<string | null>(null);

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", params.id],
  });

  const { data: welcomeConfig } = useQuery<WelcomeConfig>({
    queryKey: ["/api/agents", params.id, "welcome-config"],
    enabled: !!params.id,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ChatSessionWithPreview[]>({
    queryKey: ["/api/agents", params.id, "sessions"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/agents", params.id, "sessions", activeSessionId, "messages"],
    enabled: !!activeSessionId,
  });

  const activeSession = sessions.find(s => s.id === activeSessionId);


  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/agents/${params.id}/sessions`, {
        title: "New Session",
      });
      return await response.json() as ChatSession;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions"] });
      setActiveSessionId(session.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create session",
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!activeSessionId) throw new Error("No active session");
      
      abortControllerRef.current = new AbortController();
      setIsCancelled(false);
      
      const response = await fetch(`/api/agents/${params.id}/sessions/${activeSessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }
      
      return await response.json() as ChatMessage[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions", activeSessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions"] });
      setLastMessageTime(Date.now());
    },
    onError: (error: Error) => {
      if (error.name === 'AbortError' || isCancelled) {
        toast({
          title: "Response cancelled",
          description: "The AI response was cancelled.",
          duration: 3000,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions", activeSessionId, "messages"] });
        return;
      }
      
      let title = "Error";
      let description = error.message || "Failed to send message";
      
      if (error.message.includes("API key")) {
        title = "Configuration Error";
        description = "The AI service is not properly configured. Please check the API key settings.";
      } else if (error.message.includes("rate limit")) {
        title = "Too Many Requests";
        description = "Please wait a moment before sending another message.";
      } else if (error.message.includes("network") || error.message.includes("fetch")) {
        title = "Connection Error";
        description = "Unable to reach the server. Please check your internet connection.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!activeSessionId) throw new Error("No active session");
      await apiRequest("DELETE", `/api/agents/${params.id}/sessions/${activeSessionId}/messages`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions", activeSessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions"] });
      toast({
        title: "Chat cleared",
        description: "All messages in this session have been deleted.",
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear chat",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sendMutation.isPending]);

  useEffect(() => {
    if (lastMessageTime === 0) return;
    
    const updateCooldown = () => {
      const elapsed = Date.now() - lastMessageTime;
      const remaining = Math.max(0, RATE_LIMIT_COOLDOWN - elapsed);
      setCooldownRemaining(remaining);
      
      if (remaining > 0) {
        requestAnimationFrame(updateCooldown);
      }
    };
    
    updateCooldown();
  }, [lastMessageTime]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      setIsCancelled(true);
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const isRateLimited = cooldownRemaining > 0;
  const isOverLimit = message.length > MAX_MESSAGE_LENGTH;

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending || isRateLimited || isOverLimit || !activeSessionId) return;
    sendMutation.mutate(message.trim());
    setMessage("");
  };

  useEffect(() => {
    if (activeSessionId && pendingPromptRef.current && !sendMutation.isPending) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      sendMutation.mutate(prompt);
    }
  }, [activeSessionId]);

  const handleInjectExpression = useCallback(() => {
    const expr = extractHcmExpressionFromMessages(messages);
    if (expr) {
      setMessage(`Change current syntax to ${expr}`);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [messages]);

  const handleSendPrompt = async (prompt: string) => {
    if (sendMutation.isPending) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    if (!activeSessionId) {
      pendingPromptRef.current = trimmed;
      try {
        const response = await apiRequest("POST", `/api/agents/${params.id}/sessions`, {
          title: "New Session",
        });
        const session = await response.json() as ChatSession;
        queryClient.invalidateQueries({ queryKey: ["/api/agents", params.id, "sessions"] });
        setActiveSessionId(session.id);
      } catch {
        pendingPromptRef.current = null;
        toast({
          title: "Error",
          description: "Failed to create session",
          variant: "destructive",
        });
      }
      return;
    }

    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  const handleNewSession = () => {
    createSessionMutation.mutate();
  };

  const handleSessionDeleted = useCallback((deletedSessionId: string) => {
    if (activeSessionId === deletedSessionId) {
      const remainingSessions = sessions.filter(s => s.id !== deletedSessionId);
      if (remainingSessions.length > 0) {
        setActiveSessionId(remainingSessions[0].id);
      } else {
        setActiveSessionId(null);
      }
    }
  }, [activeSessionId, sessions]);

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-background p-4">
          <div className="container mx-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!agent) {
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
    <div className="min-h-screen h-screen bg-background flex flex-col overflow-hidden">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate("/")}
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Back to home</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    data-testid="button-toggle-sidebar"
                  >
                    {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sidebarOpen ? "Hide sessions" : "Show sessions"}</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="font-semibold" data-testid="text-agent-name">{agent.name}</h1>
                  <p className="text-xs text-muted-foreground capitalize">{agent.status}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <ContextProgressBar messages={messages} />
              )}
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleNewSession}
                      disabled={createSessionMutation.isPending}
                      data-testid="button-new-session-header"
                    >
                      {createSessionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>New session</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => clearMutation.mutate()}
                      disabled={messages.length === 0 || clearMutation.isPending || !activeSessionId}
                      data-testid="button-clear-chat"
                    >
                      {clearMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eraser className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear session messages</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => navigate(`/settings/${params.id}`)}
                      data-testid="button-settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Agent settings</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-w-0">
        {sidebarOpen && (
          <>
            <SessionSidebar
              agentId={params.id!}
              agentName={agent.name}
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
              onNewSession={handleNewSession}
              onSessionDeleted={handleSessionDeleted}
              width={sidebarWidth}
            />
            <ResizeHandle onMouseDown={handleSidebarResize} />
          </>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <ContextSummary messages={messages} sessionId={activeSessionId || undefined} />
          
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
                <EmptyChat agentName={agent.name} hasSession={!!activeSessionId} welcomeConfig={welcomeConfig} onSendPrompt={handleSendPrompt} />
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, idx) => {
                    const isLastAssistant = msg.role === "assistant" && !messages.slice(idx + 1).some(m => m.role === "assistant");
                    return (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        agentId={params.id}
                        isLastAssistant={isLastAssistant}
                        onSendMessage={handleSendPrompt}
                        onInjectExpression={handleInjectExpression}
                      />
                    );
                  })}
                  {sendMutation.isPending && <TypingIndicator onCancel={handleCancel} />}
                  {params.id === HCM_EXPRESSION_BUILDER_AGENT_ID && (
                    <div data-testid="debug-build-anim" style={{ display: 'none' }}>
                      msgs={messages.length} | splitCheck={messages.length > 0 && messages[messages.length-1].role === 'assistant' ? (splitColumnBuildResponse(stripActionBlocks(messages[messages.length-1].content)) ? 'MATCH' : 'no-match') : 'N/A'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t bg-background p-4">
            <div className="max-w-3xl mx-auto">
              {isOverLimit && (
                <div className="flex items-center gap-2 mb-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>Message is too long. Please shorten it to {MAX_MESSAGE_LENGTH} characters.</span>
                </div>
              )}
              {isRateLimited && (
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Please wait {Math.ceil(cooldownRemaining / 1000)}s before sending another message...</span>
                </div>
              )}
              {!activeSessionId && (
                <div className="flex items-center gap-2 mb-2 text-muted-foreground text-sm">
                  <MessageSquare className="h-4 w-4" />
                  <span>Create a new session to start chatting</span>
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
                    disabled={!activeSessionId}
                    className={`min-h-[44px] max-h-[120px] resize-none border-0 focus-visible:ring-0 ${
                      isOverLimit ? "text-destructive" : ""
                    }`}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH + 100}
                    data-testid="textarea-message"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!message.trim() || sendMutation.isPending || isRateLimited || isOverLimit || !activeSessionId}
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
              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-xs text-muted-foreground">
                  Press Enter to send, Shift+Enter for new line
                </p>
                <CharacterCounter current={message.length} max={MAX_MESSAGE_LENGTH} />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
