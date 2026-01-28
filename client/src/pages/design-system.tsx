import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/ui/status-badge"
import { FileCard, FileCardGrid } from "@/components/ui/file-card"
import { InsightCard, AiDotsDecoration } from "@/components/ui/insight-card"
import { ProgressArc } from "@/components/ui/progress-arc"
import { FileText, FolderOpen, BarChart3, PieChart, Settings, Search, Bell, User, Plus, ArrowLeft, ChevronRight } from "lucide-react"

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-8 space-y-12">
        
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Design System</h1>
          <p className="text-muted-foreground">
            Modern glassmorphism UI components inspired by Celoxis management dashboard
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Typography</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold">Urbanist Bold - 36px</h1>
                <h2 className="text-2xl font-semibold">Urbanist Semibold - 24px</h2>
                <h3 className="text-xl font-medium">Urbanist Medium - 20px</h3>
                <p className="text-base">Urbanist Regular - 16px body text</p>
                <p className="text-sm text-muted-foreground">Urbanist Regular - 14px secondary text</p>
                <p className="text-xs text-muted-foreground">Urbanist Regular - 12px caption</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Color Palette</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <ColorSwatch name="Primary (Golden)" className="bg-primary" hex="#FDCF00" />
            <ColorSwatch name="Warning (Coral)" className="bg-[hsl(var(--warning))]" hex="#FF7A47" />
            <ColorSwatch name="Destructive (Red)" className="bg-destructive" hex="#FF4747" />
            <ColorSwatch name="Success (Green)" className="bg-[hsl(var(--success))]" hex="#22C55E" />
            <ColorSwatch name="Background" className="bg-background border" hex="#E5E0DA" />
            <ColorSwatch name="Card" className="bg-card border" hex="#FFFFFF" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Buttons</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <Button data-testid="button-default">Primary</Button>
                <Button variant="secondary" data-testid="button-secondary">Secondary</Button>
                <Button variant="outline" data-testid="button-outline">Outline</Button>
                <Button variant="ghost" data-testid="button-ghost">Ghost</Button>
                <Button variant="destructive" data-testid="button-destructive">Destructive</Button>
                <Button variant="warning" data-testid="button-warning">Warning</Button>
                <Button variant="success" data-testid="button-success">Success</Button>
              </div>
              
              <div className="flex flex-wrap gap-4 mt-6">
                <Button size="sm" data-testid="button-sm">Small</Button>
                <Button size="default" data-testid="button-md">Default</Button>
                <Button size="lg" data-testid="button-lg">Large</Button>
                <Button size="xl" data-testid="button-xl">Extra Large</Button>
                <Button size="icon" data-testid="button-icon"><Plus /></Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Badges</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <Badge data-testid="badge-default">Default</Badge>
                <Badge variant="secondary" data-testid="badge-secondary">Secondary</Badge>
                <Badge variant="outline" data-testid="badge-outline">Outline</Badge>
                <Badge variant="destructive" data-testid="badge-destructive">Destructive</Badge>
                <Badge variant="warning" data-testid="badge-warning">Warning</Badge>
                <Badge variant="success" data-testid="badge-success">Success</Badge>
                <Badge variant="muted" data-testid="badge-muted">Muted</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Status Badges</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-6">
                <StatusBadge status="success" data-testid="status-success" />
                <StatusBadge status="warning" data-testid="status-warning" />
                <StatusBadge status="destructive" data-testid="status-destructive" />
                <StatusBadge status="muted" data-testid="status-muted" />
              </div>
              <div className="flex flex-wrap gap-6 mt-4">
                <StatusBadge status="success" label="Completed" />
                <StatusBadge status="warning" label="In Progress" />
                <StatusBadge status="destructive" label="Critical" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-default">
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>Clean white card with subtle shadow</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This is the standard card variant with soft shadows and rounded corners.
                </p>
              </CardContent>
            </Card>
            
            <Card variant="glass" data-testid="card-glass">
              <CardHeader>
                <CardTitle>Glass Card</CardTitle>
                <CardDescription>Glassmorphism effect with blur</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This card uses backdrop blur for a frosted glass appearance.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">File Cards</h2>
          <FileCardGrid>
            <FileCard
              title="Invoices"
              fileCount={193}
              preview={
                <div className="w-full h-full p-2 flex items-center justify-center">
                  <FileText className="w-12 h-12 text-muted-foreground/50" />
                </div>
              }
              onClick={() => console.log('Invoices clicked')}
            />
            <FileCard
              title="Reporting"
              fileCount={271}
              preview={
                <div className="w-full h-full p-2 flex items-center justify-center">
                  <BarChart3 className="w-12 h-12 text-muted-foreground/50" />
                </div>
              }
              onClick={() => console.log('Reporting clicked')}
            />
            <FileCard
              title="Analysis"
              fileCount={295}
              preview={
                <div className="w-full h-full p-2 flex items-center justify-center">
                  <PieChart className="w-12 h-12 text-muted-foreground/50" />
                </div>
              }
              onClick={() => console.log('Analysis clicked')}
            />
          </FileCardGrid>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Insight Card</h2>
          <div className="max-w-md">
            <InsightCard
              title="AI Insights"
              description="The Company's profitability for the third quarter"
              highlight="Increased by 27.1% - 31.2%"
              icon={<AiDotsDecoration />}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Progress Arc</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-8 items-center">
                <ProgressArc value={57} label="Total Processed" data-testid="progress-arc-57" />
                <ProgressArc value={25} size={100} strokeWidth={6} label="Low" data-testid="progress-arc-25" />
                <ProgressArc value={85} size={80} strokeWidth={4} showLabel={false} data-testid="progress-arc-85" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Inputs</h2>
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by system" 
                  className="pl-9" 
                  data-testid="input-search"
                />
              </div>
              <Input 
                placeholder="Enter your email" 
                type="email"
                data-testid="input-email"
              />
              <Input 
                placeholder="Disabled input" 
                disabled
                data-testid="input-disabled"
              />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Sidebar Menu Items (Preview)</h2>
          <Card>
            <CardContent className="pt-6 max-w-xs">
              <nav className="space-y-1">
                <SidebarMenuItem icon={<FolderOpen />} label="Main Dashboard" />
                <SidebarMenuItem icon={<FileText />} label="Files Management" active />
                <SidebarMenuItem icon={<BarChart3 />} label="Company Portfolio" hasAction />
                <SidebarMenuItem icon={<Settings />} label="Settings" />
                <SidebarMenuItem icon={<User />} label="Account" />
              </nav>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Data Table Row (Preview)</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <DataTableRow
                  project="Transport deployment"
                  scheduleHealth={<StatusBadge status="destructive" label="Off Track" />}
                  budgetHealth={<StatusBadge status="success" label="On Track" />}
                  deadline="17-Jul-2020"
                  client="Rolex"
                />
                <DataTableRow
                  project="Salesforce integration"
                  scheduleHealth={<StatusBadge status="success" label="On Track" />}
                  budgetHealth={<StatusBadge status="success" label="On Track" />}
                  deadline="21-Aug-2020"
                  client="Apple"
                />
                <DataTableRow
                  project="Website redesign"
                  scheduleHealth={<StatusBadge status="warning" label="Delayed" />}
                  budgetHealth={<StatusBadge status="destructive" label="Off Track" />}
                  deadline="10-Sep-2020"
                  client="Google"
                />
              </div>
            </CardContent>
          </Card>
        </section>

      </div>
    </div>
  )
}

function ColorSwatch({ name, className, hex }: { name: string; className: string; hex: string }) {
  return (
    <div className="space-y-2">
      <div className={`w-full aspect-square rounded-xl ${className}`} />
      <p className="text-xs font-medium text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">{hex}</p>
    </div>
  )
}

function SidebarMenuItem({ 
  icon, 
  label, 
  active = false, 
  hasAction = false 
}: { 
  icon: React.ReactNode
  label: string
  active?: boolean
  hasAction?: boolean
}) {
  return (
    <div 
      className={`
        flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer
        transition-colors hover-elevate
        ${active ? 'bg-muted' : ''}
      `}
      data-testid={`sidebar-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-5 h-5 text-foreground/70">{icon}</span>
        <span className="text-sm text-foreground">{label}</span>
      </div>
      {hasAction && (
        <Plus className="w-4 h-4 text-muted-foreground" />
      )}
      {active && (
        <span className="text-muted-foreground">
          <ChevronRight className="w-4 h-4" />
        </span>
      )}
    </div>
  )
}

function DataTableRow({
  project,
  scheduleHealth,
  budgetHealth,
  deadline,
  client,
}: {
  project: string
  scheduleHealth: React.ReactNode
  budgetHealth: React.ReactNode
  deadline: string
  client: string
}) {
  return (
    <div 
      className="grid grid-cols-5 gap-4 py-3 px-4 rounded-lg hover:bg-muted/50 transition-colors items-center"
      data-testid={`table-row-${project.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="text-sm font-medium text-foreground truncate">{project}</div>
      <div>{scheduleHealth}</div>
      <div>{budgetHealth}</div>
      <div className="text-sm text-muted-foreground">{deadline}</div>
      <div className="text-sm text-foreground">{client}</div>
    </div>
  )
}
