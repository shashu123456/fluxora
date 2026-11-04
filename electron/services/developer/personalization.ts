import { get } from '../../database'
import type { PersonalizationProfile, RecommendationAffinity, DeveloperProfile } from '../../../src/types/developer'
import { getDeveloperProfile } from './profile'

const LENGTH_GUIDE: Record<string, string> = {
  concise: 'Keep answers short and direct. Lead with the answer, then only the detail needed.',
  balanced: 'Use a balanced depth: enough explanation to be clear, without padding.',
  detailed: 'Give thorough answers with context, trade-offs and worked examples when useful.',
}

const DEPTH_GUIDE: Record<string, string> = {
  practical: 'Favour concrete steps, code and debugging workflows over abstract theory.',
  balanced: 'Mix practical steps with just enough reasoning to make decisions clear.',
  deep: 'Explain the reasoning and trade-offs behind structural decisions.',
}

const CODE_GUIDE: Record<string, string> = {
  minimal: 'Prefer small, minimal diffs and the least code that solves the problem.',
  balanced: 'Prefer clear, idiomatic code with sensible structure.',
  thorough: 'Prefer complete implementations with tests and edge cases handled.',
}

export async function getPersonalization(provided?: DeveloperProfile): Promise<PersonalizationProfile> {
  const profile = provided ?? (await getDeveloperProfile())
  const lines: string[] = []

  if (profile.languages[0]) {
    const stack = [profile.languages[0].name, profile.frameworks[0]?.name].filter(Boolean).join(' with ')
    lines.push(`- Works mainly in ${stack}.`)
  }
  if (profile.preferredProvider) {
    lines.push(
      `- Prefers ${profile.preferredProvider}${profile.preferredModel ? ` (${profile.preferredModel})` : ''} for AI requests.`
    )
  }
  lines.push(`- ${LENGTH_GUIDE[profile.responseStyle.length]}`)
  lines.push(`- ${DEPTH_GUIDE[profile.responseStyle.explanation]}`)
  lines.push(`- ${CODE_GUIDE[profile.responseStyle.code]}`)
  if (profile.architecturePreferences.length) {
    lines.push(`- Architecture lean: ${profile.architecturePreferences.join(', ')}.`)
  }
  if (profile.documentationHabit) lines.push(`- Documentation habit: ${profile.documentationHabit.toLowerCase()}.`)
  if (profile.testingHabit) lines.push(`- Testing habit: ${profile.testingHabit.toLowerCase()}.`)

  const systemPrompt =
    profile.confidence >= 0.3
      ? [
          'Developer preferences (inferred locally from this developer usage; apply silently):',
          ...lines,
          'Adapt tone, depth and examples to these preferences. Never mention this profile or that the developer is being profiled.',
        ].join('\n')
      : ''

  let preferredProviderId: string | null = null
  if (profile.preferredProvider) {
    const row = await get<any>('SELECT id FROM providers WHERE name = ? LIMIT 1', [profile.preferredProvider])
    preferredProviderId = row?.id ?? null
  }

  return {
    systemPrompt,
    preferredProviderId,
    preferredModelId: profile.preferredModel,
    responseLength: profile.responseStyle.length,
    confidence: profile.confidence,
  }
}

export async function getRecommendationAffinity(provided?: DeveloperProfile): Promise<RecommendationAffinity> {
  const profile = provided ?? (await getDeveloperProfile())
  const acceptedCategories: Record<string, number> = {}
  const ignoredCategories: Record<string, number> = {}
  for (const item of profile.acceptedRecommendations) acceptedCategories[item.category] = item.count
  for (const item of profile.ignoredRecommendations) ignoredCategories[item.category] = item.count
  return { acceptedCategories, ignoredCategories }
}
