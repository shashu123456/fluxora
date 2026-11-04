export type LearningEventKind =
  | 'recommendation_accepted'
  | 'recommendation_ignored'
  | 'workspace_switched'
  | 'chat_created'
  | 'ai_request'
  | 'prompt_used'
  | 'search'
  | 'file_opened'
  | 'command_run'
  | 'session_started'
  | 'session_ended'

export interface LearningEvent {
  id: string
  kind: LearningEventKind
  key: string | null
  value: string | null
  workspaceId: string | null
  createdAt: number
}

export interface DeveloperTrait {
  name: string
  count: number
  share: number
}

export type ResponseLength = 'concise' | 'balanced' | 'detailed'
export type ExplanationDepth = 'practical' | 'balanced' | 'deep'
export type CodeStyle = 'minimal' | 'balanced' | 'thorough'

export interface DeveloperProfile {
  headline: string
  summary: string
  languages: DeveloperTrait[]
  frameworks: DeveloperTrait[]
  providers: DeveloperTrait[]
  models: DeveloperTrait[]
  preferredProvider: string | null
  preferredModel: string | null
  projectTypes: DeveloperTrait[]
  architecturePreferences: string[]
  codingStyle: string[]
  documentationHabit: string
  testingHabit: string
  promptHabits: string[]
  activeHours: { hour: number; count: number }[]
  peakHour: number | null
  topWorkspaces: { id: string; name: string; chats: number }[]
  searchTopics: DeveloperTrait[]
  aiRequestThemes: DeveloperTrait[]
  acceptedRecommendations: { category: string; count: number }[]
  ignoredRecommendations: { category: string; count: number }[]
  responseStyle: {
    length: ResponseLength
    explanation: ExplanationDepth
    code: CodeStyle
  }
  stats: {
    sessions: number
    chats: number
    aiRequests: number
    filesOpened: number
    searches: number
    events: number
  }
  confidence: number
  generatedAt: number
}

export interface DeveloperInsight {
  id: string
  title: string
  detail: string
  confidence: number
  kind: 'preference' | 'habit' | 'trend' | 'suggestion'
}

export interface WorkSession {
  id: string
  startedAt: number
  endedAt: number
  durationMs: number
  workspaceId: string | null
  workspaceName: string | null
  chatsCreated: number
  aiRequests: number
  recommendationsAccepted: number
  filesChanged: number
  workspaceSwitches: number
  summary: string
}

export interface SessionBriefing {
  greeting: string
  sinceLabel: string
  lines: string[]
  focus: string
  lastSession: WorkSession | null
  generatedAt: number
}

export interface PersonalizationProfile {
  systemPrompt: string
  preferredProviderId: string | null
  preferredModelId: string | null
  responseLength: ResponseLength
  confidence: number
}

export interface RecommendationAffinity {
  acceptedCategories: Record<string, number>
  ignoredCategories: Record<string, number>
}

export interface DeveloperOverview {
  profile: DeveloperProfile
  insights: DeveloperInsight[]
  briefing: SessionBriefing
  sessions: WorkSession[]
  personalization: PersonalizationProfile
}

export interface DeveloperResetOptions {
  includeMemory?: boolean
}
