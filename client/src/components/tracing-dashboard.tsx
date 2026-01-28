import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Activity, 
  Clock, 
  Cpu, 
  Zap, 
  AlertCircle, 
  ChevronDown, 
  ChevronRight,
  Play,
  Trash2,
  History,
  RotateCcw,
  Loader2,
  GitBranch,
  Sparkles,
  Target,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AgentTrace, TurnTrace, ConfigHistory, ConfigSnapshot, Agent } from "@shared/schema";

interface TracingDashboardProps {
  agentId: string;
  agent: Agent;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType; 
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UsageChart({ 
  data, 
  title, 
  colorClass = "bg-primary" 
}: { 
  data: Record<string, number>; 
  title: string;
  colorClass?: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...Object.values(data), 1);
  
  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No {title.toLowerCase()} data yet
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {entries.slice(0, 8).map(([name, count]) => (
        <div key={name} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate max-w-[180px]" title={name}>{name}</span>
            <Badge variant="secondary" className="ml-2">{count}</Badge>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div 
              className={`h-full ${colorClass} rounded-full transition-all duration-300`}
              style={{ width: `${(count / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TraceEntry({ trace }: { trace: TurnTrace }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover-elevate transition-colors">
          <div className="flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${trace.success ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <p className="text-sm font-medium truncate max-w-[300px]">
                {trace.userInput.substring(0, 60)}{trace.userInput.length > 60 ? '...' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(trace.startTime).toLocaleString()} 
                {trace.totalDuration && ` • ${trace.totalDuration}ms`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{trace.entries.length} entries</Badge>
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-4 space-y-2 border-l-2 border-muted pl-4">
          {trace.agentResponse && (
            <div className="p-2 rounded bg-muted/50 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">Response:</p>
              <p className="text-xs">{trace.agentResponse.substring(0, 200)}{trace.agentResponse.length > 200 ? '...' : ''}</p>
            </div>
          )}
          {trace.entries.map((entry, idx) => (
            <div key={entry.id || idx} className="flex items-start gap-2 text-xs">
              <Badge variant={
                entry.type === 'error' ? 'destructive' :
                entry.type === 'llm_call' ? 'default' :
                'secondary'
              } className="shrink-0">
                {entry.type}
              </Badge>
              <div className="flex-1">
                <span className="font-medium">{entry.name}</span>
                {entry.metadata?.intent && (
                  <span className="ml-2 text-muted-foreground">
                    Intent: {entry.metadata.intent}
                  </span>
                )}
                {entry.metadata?.confidence && (
                  <span className="ml-2 text-muted-foreground">
                    ({entry.metadata.confidence})
                  </span>
                )}
                {entry.duration && (
                  <span className="ml-2 text-muted-foreground">
                    {entry.duration}ms
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ConfigHistoryPanel({ 
  agentId, 
  agent 
}: { 
  agentId: string; 
  agent: Agent;
}) {
  const { toast } = useToast();
  
  const { data: history, isLoading } = useQuery<ConfigHistory>({
    queryKey: ["/api/agents", agentId, "config-history"],
  });
  
  const revertMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const response = await apiRequest("POST", `/api/agents/${agentId}/config-history/${snapshotId}/revert`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "config-history"] });
      toast({
        title: "Reverted successfully",
        description: "The agent configuration has been restored.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Revert failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Change History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const snapshots = history?.snapshots || [];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Change History
        </CardTitle>
        <CardDescription>
          View and revert to previous configurations
        </CardDescription>
      </CardHeader>
      <CardContent>
        {snapshots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No configuration changes recorded yet</p>
            <p className="text-sm">Changes will appear here as you modify settings</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {snapshots.slice().reverse().map((snapshot, idx) => (
                <div 
                  key={snapshot.id} 
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {snapshot.description || `Version ${snapshots.length - idx}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(snapshot.timestamp).toLocaleString()}
                      </p>
                      {snapshot.changes.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {snapshot.changes.length} field(s) changed
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revertMutation.mutate(snapshot.id)}
                    disabled={revertMutation.isPending}
                    data-testid={`button-revert-${snapshot.id}`}
                  >
                    {revertMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function SimulationPanel({ 
  agentId, 
  agent 
}: { 
  agentId: string; 
  agent: Agent;
}) {
  const { toast } = useToast();
  const [testMessage, setTestMessage] = useState("");
  const [validationOverride, setValidationOverride] = useState("");
  const [guardrailsOverride, setGuardrailsOverride] = useState("");
  const [simulationResult, setSimulationResult] = useState<{
    originalResponse: string;
    simulatedResponse: string;
    differences: { aspect: string; original: string; simulated: string }[];
  } | null>(null);
  
  const simulateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/agents/${agentId}/simulate`, {
        testMessage,
        configOverrides: {
          validationRules: validationOverride || undefined,
          guardrails: guardrailsOverride || undefined,
        },
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setSimulationResult(data);
      toast({
        title: "Simulation complete",
        description: "Compare the responses below.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Config Simulation
        </CardTitle>
        <CardDescription>
          Test config changes before applying them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="test-message">Test Message</Label>
          <Textarea
            id="test-message"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Enter a test message to simulate..."
            className="mt-1"
            data-testid="input-test-message"
          />
        </div>
        
        <div>
          <Label htmlFor="validation-override">Validation Rules Override (optional)</Label>
          <Textarea
            id="validation-override"
            value={validationOverride}
            onChange={(e) => setValidationOverride(e.target.value)}
            placeholder="Leave empty to use current validation rules..."
            className="mt-1 min-h-[80px] text-xs font-mono"
            data-testid="input-validation-override"
          />
        </div>
        
        <div>
          <Label htmlFor="guardrails-override">Guardrails Override (optional)</Label>
          <Textarea
            id="guardrails-override"
            value={guardrailsOverride}
            onChange={(e) => setGuardrailsOverride(e.target.value)}
            placeholder="Leave empty to use current guardrails..."
            className="mt-1 min-h-[80px] text-xs font-mono"
            data-testid="input-guardrails-override"
          />
        </div>
        
        <Button
          onClick={() => simulateMutation.mutate()}
          disabled={!testMessage || simulateMutation.isPending}
          className="w-full"
          data-testid="button-simulate"
        >
          {simulateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Simulating...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Simulation
            </>
          )}
        </Button>
        
        {simulationResult && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <p className="text-sm font-medium mb-2">Original Response:</p>
              <div className="p-3 rounded-lg bg-muted text-sm">
                {simulationResult.originalResponse}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Simulated Response:</p>
              <div className="p-3 rounded-lg bg-primary/10 text-sm">
                {simulationResult.simulatedResponse}
              </div>
            </div>
            {simulationResult.differences.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Differences:</p>
                <div className="space-y-2">
                  {simulationResult.differences.map((diff, idx) => (
                    <div key={idx} className="p-2 rounded border text-xs">
                      <p className="font-medium">{diff.aspect}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TracingDashboard({ agentId, agent }: TracingDashboardProps) {
  const { toast } = useToast();
  
  const { data: traces, isLoading } = useQuery<AgentTrace>({
    queryKey: ["/api/agents", agentId, "traces"],
  });
  
  const clearTracesMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/agents/${agentId}/traces`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId, "traces"] });
      toast({
        title: "Traces cleared",
        description: "All trace data has been removed.",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stats = traces?.stats || {
    hookCalls: {},
    signalReads: {},
    intentDistribution: {},
    classificationMethods: {},
    avgResponseTime: 0,
    totalLlmCalls: 0,
    totalTokensUsed: 0,
    errorCount: 0,
  };

  const traceList = traces?.traces || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Agent Tracing</h2>
          <p className="text-sm text-muted-foreground">
            Monitor hooks, signals, and context used by your agent
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clearTracesMutation.mutate()}
          disabled={clearTracesMutation.isPending || traceList.length === 0}
          data-testid="button-clear-traces"
        >
          {clearTracesMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          <span className="ml-2">Clear Traces</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Traces"
          value={traceList.length}
          icon={Activity}
        />
        <StatCard
          title="LLM Calls"
          value={stats.totalLlmCalls}
          icon={Cpu}
        />
        <StatCard
          title="Avg Response Time"
          value={`${Math.round(stats.avgResponseTime)}ms`}
          icon={Clock}
        />
        <StatCard
          title="Errors"
          value={stats.errorCount}
          icon={AlertCircle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Intent Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageChart 
              data={stats.intentDistribution} 
              title="Intents" 
              colorClass="bg-blue-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Classification Methods
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageChart 
              data={stats.classificationMethods} 
              title="Methods" 
              colorClass="bg-green-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Hook Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageChart 
              data={stats.hookCalls} 
              title="Hooks" 
              colorClass="bg-purple-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Signal Reads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageChart 
              data={stats.signalReads} 
              title="Signals" 
              colorClass="bg-orange-500"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Traces
          </CardTitle>
          <CardDescription>
            Detailed view of recent agent interactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {traceList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No traces recorded yet</p>
              <p className="text-sm">Start a chat session to see traces appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {traceList.slice().reverse().map((trace) => (
                  <TraceEntry key={trace.id} trace={trace} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SimulationPanel agentId={agentId} agent={agent} />
        <ConfigHistoryPanel agentId={agentId} agent={agent} />
      </div>
    </div>
  );
}
