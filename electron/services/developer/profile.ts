import { all, get } from '../../database'
import type { DeveloperProfile, DeveloperTrait, ResponseLength, ExplanationDepth, CodeStyle } from '../../../src/types/developer'
import { countEventsByKey, latestEventAt } from './events'
import { sessionCount } from './sessions'

const PROFILE_TTL = 60_000

const THEME_KEYWORDS: Record<string, string[]> = {
  Architecture: ['architecture', 'structure', 'refactor', 'pattern', 'module', 'boundary', 'layer', 'organise', 'organize', 'design system'],
  Debugging: ['bug', 'error', 'fix', 'issue', 'broken', 'crash', 'debug', 'fails', 'exception', 'not working'],
  Testing: ['test', 'spec', 'vitest', 'jest', 'coverage', 'assert'],
  Documentation: ['docs', 'documentation', 'readme', 'comment', 'explain', 'guide'],
  Performance: ['performance', 'slow', 'optimize', 'optimise', 'latency', 'bundle', 'memory'],
  Security: ['security', 'auth', 'token', 'secret', 'vulnerability', 'permission', 'sanitize'],
  Interface: ['ui', 'layout', 'design', 'css', 'tailwind', 'style', 'animation', 'responsive'],
  Data: ['database', 'sql', 'query', 'schema', 'migration', 'api', 'store'],
}

let memo: { at: number; latest: number; profile: DeveloperProfile } | null = null

async function safeAll<T>(sql: string, params: any[] = []): Promise<T[]> {
  try {
    return await all<T>(sql, params)
  } catch {
    return []
  }
}

async function safeGet<T>(sql: string, params: any[] = []): Promise<T | undefined> {
  try {
    return await get<T>(sql, params)
  } catch {
    return undefined
  }
}

function parseJson<T = any>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toTraits(counts: Map<string, number>, limit = 6): DeveloperTrait[] {
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      count,
      share: total > 0 ? Math.round((count / total) * 100) / 100 : 0,
    }))
}

function add(counts: Map<string, number>, key: string | null | undefined, amount = 1) {
  const clean = (key || '').trim()
  if (!clean || clean.toLowerCase() === 'global') return
  counts.set(clean, (counts.get(clean) || 0) + amount)
}

function classifyThemes(messages: string[]): DeveloperTrait[] {
  const counts = new Map<string, number>()
  let classified = 0
  for (const message of messages) {
    const lower = message.toLowerCase()
    let matched = false
    for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (keywords.some((keyword) => lower.includes(keyword))) {
        counts.set(theme, (counts.get(theme) || 0) + 1)
        matched = true
      }
    }
    if (matched) classified += 1
  }
  return toTraits(counts, 6).map((trait) => ({
    ...trait,
    share: classified > 0 ? Math.round((trait.count / classified) * 100) / 100 : 0,
  }))
}

function peakLabel(hour: number | null): string {
  if (hour === null) return 'day'
  if (hour < 5) return 'late night'
  if (hour < 11) return 'morning'
  if (hour < 14) return 'midday'
  if (hour < 18) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'late night'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export async function getDeveloperProfile(force = false): Promise<DeveloperProfile> {
  const latest = await latestEventAt()
  if (!force && memo && Date.now() - memo.at < PROFILE_TTL && latest <= memo.latest) {
    return memo.profile
  }
  const profile = await computeProfile(latest)
  memo = { at: Date.now(), latest, profile }
  return profile
}

export function invalidateProfile(): void {
  memo = null
}

async function computeProfile(latest: number): Promise<DeveloperProfile> {
  const [providerRows, usageRows, usageHours, indexRows, intelligenceRows, chatRows, workspaceRows, terminalRows, promptRows, messageRows, sessionRows, eventRows] =
    await Promise.all([
      safeAll<any>('SELECT id, name FROM providers'),
      safeAll<any>('SELECT provider_id, model, COUNT(*) AS count FROM usage GROUP BY provider_id, model ORDER BY count DESC LIMIT 60'),
      safeAll<any>('SELECT created_at FROM usage ORDER BY created_at DESC LIMIT 3000'),
      safeAll<any>('SELECT data FROM workspace_index'),
      safeAll<any>('SELECT data FROM workspace_intelligence'),
      safeAll<any>('SELECT workspace_id, COUNT(*) AS count FROM chats GROUP BY workspace_id ORDER BY count DESC LIMIT 8'),
      safeAll<any>('SELECT id, name FROM workspaces'),
      safeAll<any>('SELECT command FROM terminal_history ORDER BY created_at DESC LIMIT 400'),
      safeAll<any>('SELECT category, COUNT(*) AS count FROM prompts GROUP BY category'),
      safeAll<any>("SELECT content FROM messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 400"),
      safeAll<any>('SELECT COUNT(*) AS count FROM work_sessions'),
      safeAll<any>('SELECT kind, COUNT(*) AS count FROM developer_events GROUP BY kind'),
    ])

  const providerNames = new Map<string, string>(providerRows.map((row) => [row.id, row.name]))
  const providerCounts = new Map<string, number>()
  const modelCounts = new Map<string, number>()
  for (const row of usageRows) {
    const name = providerNames.get(row.provider_id) || row.provider_id
    add(providerCounts, name, Number(row.count))
    if (row.model) add(modelCounts, row.model, Number(row.count))
  }

  const hourCounts = new Array(24).fill(0) as number[]
  for (const row of usageHours) {
    const date = new Date(Number(row.created_at))
    if (!Number.isNaN(date.getTime())) hourCounts[date.getHours()] += 1
  }
  const activeHours = hourCounts.map((count, hour) => ({ hour, count }))
  const peakHour = activeHours.reduce<number | null>((best, item) => {
    if (item.count === 0) return best
    if (best === null) return item.hour
    return item.count > activeHours[best].count ? item.hour : best
  }, null)

  const languageCounts = new Map<string, number>()
  const frameworkCounts = new Map<string, number>()
  const projectTypeCounts = new Map<string, number>()
  const architectureCounts = new Map<string, number>()
  let docScoreTotal = 0
  let docScoreCount = 0
  let indexesWithTests = 0
  let indexesWithDocs = 0
  let hasStrictConfig = false

  for (const row of indexRows) {
    const index = parseJson<any>(row.data)
    if (!index) continue
    for (const language of index.languages || []) add(languageCounts, language.lang, Number(language.count) || 1)
    for (const framework of index.frameworks || []) add(frameworkCounts, framework)
    if ((index.testDirs || []).length > 0) indexesWithTests += 1
    if ((index.docs || []).length > 0) indexesWithDocs += 1
    if ((index.configFiles || []).some((file: string) => /tsconfig/i.test(file))) hasStrictConfig = true
    const docsScore = index.health?.documentation?.score
    if (typeof docsScore === 'number') {
      docScoreTotal += docsScore
      docScoreCount += 1
    }
  }

  for (const row of intelligenceRows) {
    const intel = parseJson<any>(row.data)
    if (!intel?.profile) continue
    add(projectTypeCounts, intel.profile.projectType)
    add(projectTypeCounts, intel.profile.category)
    add(architectureCounts, intel.profile.architecturePattern)
    const score = intel.health?.documentationScore?.score
    if (typeof score === 'number') {
      docScoreTotal += score
      docScoreCount += 1
    }
  }

  const workspaceNames = new Map<string, string>(workspaceRows.map((row) => [row.id, row.name]))
  const topWorkspaces = chatRows
    .filter((row) => row.workspace_id && row.workspace_id !== 'global')
    .slice(0, 5)
    .map((row) => ({
      id: row.workspace_id,
      name: workspaceNames.get(row.workspace_id) || 'Workspace',
      chats: Number(row.count),
    }))

  const commandCounts = new Map<string, number>()
  const ignoredCommands = new Set(['cd', 'ls', 'dir', 'echo', 'clear', 'cls'])
  for (const row of terminalRows) {
    const verb = String(row.command || '').trim().split(/\s+/)[0]
    if (!verb || ignoredCommands.has(verb.toLowerCase())) continue
    add(commandCounts, verb)
  }

  const promptCounts = new Map<string, number>()
  for (const row of promptRows) add(promptCounts, row.category || 'general', Number(row.count))

  const messages = messageRows.map((row) => String(row.content || ''))
  const aiRequestThemes = classifyThemes(messages)
  const averageMessageLength =
    messages.length > 0 ? messages.reduce((sum, message) => sum + message.length, 0) / messages.length : 0

  const [acceptedRows, ignoredRows, searchRows, fileRows] = await Promise.all([
    countEventsByKey('recommendation_accepted'),
    countEventsByKey('recommendation_ignored'),
    countEventsByKey('search'),
    countEventsByKey('file_opened'),
  ])

  const searchTopics: DeveloperTrait[] = searchRows.slice(0, 8).map((row) => ({
    name: row.key.slice(0, 48),
    count: row.count,
    share: 0,
  }))
  const searchTotal = searchRows.reduce((sum, row) => sum + row.count, 0)
  for (const topic of searchTopics) topic.share = searchTotal > 0 ? Math.round((topic.count / searchTotal) * 100) / 100 : 0

  const eventsByKind = new Map<string, number>(eventRows.map((row) => [row.kind, Number(row.count)]))
  const eventTotal = Array.from(eventsByKind.values()).reduce((sum, value) => sum + value, 0)
  const sessions = Number(sessionRows[0]?.count || 0) || (await sessionCount())

  const languages = toTraits(languageCounts)
  const frameworks = toTraits(frameworkCounts)
  const providers = toTraits(providerCounts)
  const models = toTraits(modelCounts)
  const projectTypes = toTraits(projectTypeCounts, 4)

  const topFramework = frameworks[0]?.name || null
  const topLanguage = languages[0]?.name || null
  const topProvider = providers[0]?.name || null
  const topTheme = aiRequestThemes[0]?.name || null

  const docAverage = docScoreCount > 0 ? docScoreTotal / docScoreCount : null
  const documentationHabit =
    docAverage !== null
      ? docAverage >= 72
        ? 'Documents as the project grows'
        : docAverage >= 48
          ? 'Documents the important decisions'
          : 'Keeps documentation light'
      : indexesWithDocs > 0
        ? 'Documents the important decisions'
        : 'Keeps documentation light'
  const testRatio = indexRows.length > 0 ? indexesWithTests / indexRows.length : 0
  const testingHabit =
    testRatio >= 0.5 ? 'Writes tests alongside new work' : testRatio > 0 ? 'Tests selectively' : 'Rarely writes tests'

  const codingStyle: string[] = []
  const tsShare = languages.find((language) => /typescript/i.test(language.name))?.share || 0
  if (tsShare >= 0.4) codingStyle.push('TypeScript-first')
  if (frameworks.some((framework) => /react/i.test(framework.name))) codingStyle.push('Component-driven interfaces')
  if (hasStrictConfig) codingStyle.push('Strict configuration')
  if (testRatio > 0) codingStyle.push('Tests alongside features')
  if (codingStyle.length === 0) codingStyle.push('Pragmatic, focused changes')

  const architecturePreferences = toTraits(architectureCounts, 3).map((trait) => trait.name)

  const responseLength: ResponseLength = averageMessageLength > 320 ? 'detailed' : averageMessageLength > 0 && averageMessageLength < 100 ? 'concise' : 'balanced'
  const themeShare = (name: string) => aiRequestThemes.find((theme) => theme.name === name)?.share || 0
  const explanation: ExplanationDepth =
    themeShare('Architecture') + themeShare('Interface') >= 0.35
      ? 'deep'
      : themeShare('Debugging') + themeShare('Testing') >= 0.3
        ? 'practical'
        : 'balanced'
  const code: CodeStyle = detailedOr(responseLength, testRatio)

  const headlineParts = [topLanguage, topFramework].filter(Boolean)
  const headline = headlineParts.length ? headlineParts.join(' · ') : 'Early profile'
  const summaryParts: string[] = []
  if (topLanguage || topFramework) {
    const stack = [topLanguage, topFramework].filter(Boolean).join(' with ')
    summaryParts.push(`You usually work in ${stack}${peakHour !== null ? `, mostly during the ${peakLabel(peakHour)}` : ''}.`)
  }
  if (topTheme) summaryParts.push(`Most of your AI requests are about ${topTheme.toLowerCase()}.`)
  summaryParts.push(`${documentationHabit}. ${testingHabit}.`)

  const confidence = Math.round(clamp(0.2 + eventTotal / 400 + sessions * 0.01, 0.2, 0.95) * 100) / 100

  return {
    headline,
    summary: summaryParts.join(' '),
    languages,
    frameworks,
    providers,
    models,
    preferredProvider: topProvider,
    preferredModel: models[0]?.name || null,
    projectTypes,
    architecturePreferences,
    codingStyle,
    documentationHabit,
    testingHabit,
    promptHabits: toTraits(promptCounts, 4).map((trait) => trait.name),
    activeHours,
    peakHour,
    topWorkspaces,
    searchTopics,
    aiRequestThemes,
    acceptedRecommendations: acceptedRows.map((row) => ({ category: row.key, count: row.count })),
    ignoredRecommendations: ignoredRows.map((row) => ({ category: row.key, count: row.count })),
    responseStyle: { length: responseLength, explanation, code },
    stats: {
      sessions,
      chats: chatRows.reduce((sum, row) => sum + Number(row.count), 0),
      aiRequests: eventsByKind.get('ai_request') || 0,
      filesOpened: fileRows.reduce((sum, row) => sum + row.count, 0),
      searches: eventsByKind.get('search') || fileRows.length,
      events: eventTotal,
    },
    confidence,
    generatedAt: Date.now(),
  }
}

function detailedOr(length: ResponseLength, testRatio: number): CodeStyle {
  if (length === 'detailed' || testRatio >= 0.5) return 'thorough'
  if (length === 'concise') return 'minimal'
  return 'balanced'
}
