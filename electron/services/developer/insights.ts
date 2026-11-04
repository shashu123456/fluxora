import { all } from '../../database'
import type { DeveloperInsight, DeveloperProfile } from '../../../src/types/developer'
import { getDeveloperProfile } from './profile'

async function timelineRows(): Promise<any[]> {
  try {
    return await all<any>('SELECT kind, title, delta, created_at FROM intelligence_timeline ORDER BY created_at DESC LIMIT 12')
  } catch {
    return []
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export async function getDeveloperInsights(provided?: DeveloperProfile): Promise<DeveloperInsight[]> {
  const profile = provided ?? (await getDeveloperProfile())
  const insights: DeveloperInsight[] = []

  const topLanguage = profile.languages[0]
  const topFramework = profile.frameworks[0]
  if (topLanguage && topLanguage.share >= 0.3) {
    insights.push({
      id: 'stack',
      title: `You usually write ${topLanguage.name}${topFramework ? ` with ${topFramework.name}` : ''}`,
      detail: `${Math.round(topLanguage.share * 100)}% of indexed code is ${topLanguage.name}. Fluxora will favour ${topFramework?.name || topLanguage.name} patterns when suggesting structure.`,
      confidence: round(Math.min(0.9, 0.45 + topLanguage.share / 2)),
      kind: 'preference',
    })
  }

  const topProvider = profile.providers[0]
  if (topProvider && topProvider.count >= 3) {
    insights.push({
      id: 'provider',
      title: `${topProvider.name} is your default choice`,
      detail: `Most requests go through ${topProvider.name}${profile.preferredModel ? ` using ${profile.preferredModel}` : ''}. Provider suggestions will start there first.`,
      confidence: round(Math.min(0.9, 0.4 + topProvider.share / 2)),
      kind: 'habit',
    })
  }

  const topTheme = profile.aiRequestThemes[0]
  if (topTheme && topTheme.count >= 3) {
    insights.push({
      id: 'theme',
      title: `Most AI requests are about ${topTheme.name.toLowerCase()}`,
      detail: `${Math.round(topTheme.share * 100)}% of your recent questions fall into this area. Explanations will lean that way without you asking.`,
      confidence: round(Math.min(0.85, 0.35 + topTheme.share / 2)),
      kind: 'habit',
    })
  }

  if (profile.peakHour !== null) {
    const total = profile.activeHours.reduce((sum, item) => sum + item.count, 0)
    if (total >= 5) {
      const time = profile.peakHour < 5 ? 'late at night' : profile.peakHour < 12 ? 'in the morning' : profile.peakHour < 18 ? 'in the afternoon' : 'in the evening'
      insights.push({
        id: 'hours',
        title: `You are most active ${time}`,
        detail: `Your busiest hour is around ${String(profile.peakHour).padStart(2, '0')}:00. Briefings and suggestions will meet you there.`,
        confidence: 0.6,
        kind: 'habit',
      })
    }
  }

  const acceptedTotal = profile.acceptedRecommendations.reduce((sum, item) => sum + item.count, 0)
  const ignoredTotal = profile.ignoredRecommendations.reduce((sum, item) => sum + item.count, 0)
  const ignoredTop = profile.ignoredRecommendations.find(
    (item) => item.count >= 3 && item.count > (profile.acceptedRecommendations.find((a) => a.category === item.category)?.count || 0) + 1
  )
  if (ignoredTop) {
    insights.push({
      id: 'ignored',
      title: `You often pass on ${ignoredTop.category.toLowerCase()} suggestions`,
      detail: `Ignored ${ignoredTop.count} times. Fluxora will lower the priority of similar recommendations and surface them only when they matter.`,
      confidence: 0.7,
      kind: 'suggestion',
    })
  } else if (acceptedTotal >= 3) {
    const acceptedTop = profile.acceptedRecommendations[0]
    if (acceptedTop) {
      insights.push({
        id: 'accepted',
        title: `You act on ${acceptedTop.category.toLowerCase()} recommendations`,
        detail: `${acceptedTotal} accepted so far, ${acceptedTop.count} of them in this category. Similar suggestions will rank higher.`,
        confidence: 0.65,
        kind: 'preference',
      })
    }
  }
  if (ignoredTotal + acceptedTotal >= 5) {
    const rate = Math.round((acceptedTotal / (acceptedTotal + ignoredTotal)) * 100)
    if (rate >= 60) {
      insights.push({
        id: 'rec-rate',
        title: `You accept ${rate}% of recommendations`,
        detail: 'Fluxora treats your recommendation feed as useful signal rather than noise.',
        confidence: 0.6,
        kind: 'trend',
      })
    }
  }

  const rows = await timelineRows()
  const docEvents = rows.filter((row) => row.kind === 'documentation')
  if (docEvents.length >= 2) {
    const [latest, previous] = docEvents
    const delta = Number(latest.delta ?? Number(latest.score || 0) - Number(previous.score || 0))
    if (delta > 0) {
      insights.push({
        id: 'docs-trend',
        title: 'Your documentation quality is improving',
        detail: `Documentation health moved up ${Math.abs(Math.round(delta))} points across recent snapshots.`,
        confidence: 0.6,
        kind: 'trend',
      })
    }
  }

  if (/rarely writes tests/i.test(profile.testingHabit)) {
    insights.push({
      id: 'tests',
      title: 'Tests are still thin in your projects',
      detail: 'None of the indexed workspaces have a test directory. Fluxora will suggest small, low-friction test steps rather than full suites.',
      confidence: 0.55,
      kind: 'suggestion',
    })
  }

  if (insights.length === 0) {
    insights.push({
      id: 'learning',
      title: 'Fluxora is still learning how you work',
      detail: 'A few chats, searches and accepted recommendations are enough to start adapting. Everything stays on this machine.',
      confidence: 0.25,
      kind: 'suggestion',
    })
  }

  return insights.slice(0, 8)
}
