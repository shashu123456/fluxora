export type InsightSeverity = 'info' | 'warning' | 'critical'

export type RecommendationCategory =
  | 'documentation'
  | 'dependencies'
  | 'architecture'
  | 'security'
  | 'testing'
  | 'performance'
  | 'maintenance'
  | 'code-quality'
  | 'ai-readiness'

export interface Recommendation {
  id: string
  category: RecommendationCategory
  title: string
  /** What to do. */
  detail: string
  /** Why this matters, derived from the evidence behind the score. */
  why: string
  priority: 'high' | 'medium' | 'low'
  /** The intelligence metric that produced this recommendation. */
  metric: string
  /** Score points that closing this gap would recover. */
  impact: number
  severity: InsightSeverity
  action?: { kind: 'openTab' | 'runCommand' | 'openFile'; label: string; payload?: Record<string, any> }
}

export type EvolutionStage = 'observation' | 'reasoning' | 'insight' | 'recommendation' | 'learning'

export interface EvolutionStep {
  stage: EvolutionStage
  title: string
  content: string
}

export type TimelineEventKind =
  | 'indexed'
  | 'health'
  | 'risk'
  | 'architecture'
  | 'documentation'
  | 'dependencies'
  | 'repository'
  | 'recommendation'
  | 'learning'

export interface TimelineEvent {
  id: string
  workspaceId: string
  kind: TimelineEventKind
  title: string
  detail?: string
  score?: number
  delta?: number
  createdAt: number
}

export interface ScoringReason {
  reason: string
  impact: 'positive' | 'neutral' | 'negative'
}

export interface ScoredMetric {
  score: number
  reasons: ScoringReason[]
}

export interface WorkspaceProfile {
  projectName: string
  projectType: string
  category: string
  primaryPurpose: string
  languages: { lang: string; count: number }[]
  frameworks: string[]
  runtime: string[]
  buildSystem: string[]
  packageManagers: string[]
  gitStatus: { isRepo: boolean; branch?: string; hasChanges?: boolean; lastCommit?: string }
  dependencies: Record<string, Record<string, string>>
  configFiles: { name: string; path: string }[]
  architecturePattern: string
  folderStructureSummary: string[]
}

export interface HealthAnalysis {
  documentationScore: ScoredMetric
  aiReadinessScore: ScoredMetric
  architectureScore: ScoredMetric
  codeOrganizationScore: ScoredMetric
  dependencyHealth: ScoredMetric
  securityScore: ScoredMetric
  maintainabilityScore: ScoredMetric
  performanceScore: ScoredMetric
  overallWorkspaceHealth: ScoredMetric
}

export interface ComplexityAnalysis {
  estimatedProjectSize: string
  complexity: 'low' | 'medium' | 'high'
  technicalDebtIndicators: string[]
  largeFiles: string[]
  duplicatePatterns: string[]
  deadCodeIndicators: string[]
  missingDocumentation: string[]
  missingConfiguration: string[]
}

export interface DevelopmentInsights {
  currentDevelopmentStage: string
  confidenceLevel: 'low' | 'medium' | 'high'
  recommendedNextSteps: string[]
  potentialRisks: string[]
  suggestedImprovements: string[]
  strengths: string[]
  weaknesses: string[]
}

export interface RepositoryIntelligence {
  gitActivity: 'active' | 'moderate' | 'quiet' | 'none'
  commitFrequency: 'high' | 'medium' | 'low' | 'unknown'
  branchStatus: string
  dirtyState: boolean
  recentlyModifiedAreas: string[]
}

export interface RiskEngine {
  securityRisk: ScoredMetric
  dependencyRisk: ScoredMetric
  maintenanceRisk: ScoredMetric
  architectureRisk: ScoredMetric
  documentationRisk: ScoredMetric
  configurationRisk: ScoredMetric
  performanceRisk: ScoredMetric
}

export interface WorkspaceIntelligence {
  workspaceId: string
  generatedAt: number
  profile: WorkspaceProfile
  health: HealthAnalysis
  complexity: ComplexityAnalysis
  insights: DevelopmentInsights
  repository: RepositoryIntelligence
  risks: RiskEngine
  contextSummary: string
  architectureSummary: string
  intelligenceVersion: string
}
