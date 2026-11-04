import type { WorkspaceProfile, HealthAnalysis, ComplexityAnalysis } from '../../../src/types/workspaceIntelligence'

export function generateContextSummary(profile: WorkspaceProfile, health: HealthAnalysis, complexity: ComplexityAnalysis): string {
  const parts = []
  parts.push(`${profile.projectName} is a ${profile.projectType.toLowerCase()} ${profile.primaryPurpose.toLowerCase()}.`)
  if (profile.frameworks.length) parts.push(`Built with ${profile.frameworks.slice(0,3).join(', ')}.`)
  if (profile.languages.length) parts.push(`Primary languages: ${profile.languages.slice(0,2).map((l:any)=>l.lang).join(', ')}.`)
  parts.push(`Overall health ${health.overallWorkspaceHealth.score}%, complexity ${complexity.complexity}.`)
  if (profile.architecturePattern !== 'Unknown') parts.push(`Architecture: ${profile.architecturePattern}.`)
  return parts.join(' ')
}

export function generateArchitectureSummary(profile: WorkspaceProfile): string {
  if (profile.architecturePattern !== 'Unknown') return profile.architecturePattern
  if (profile.frameworks.includes('React') && profile.frameworks.includes('Electron')) return 'Electron Desktop Application'
  if (profile.frameworks.includes('React')) return 'React SPA'
  if (profile.frameworks.includes('Next.js')) return 'Next.js Full Stack'
  if (profile.frameworks.includes('Express')) return 'Express REST API'
  if (profile.languages.some((l:any)=>l.lang==='Python')) return 'Python Application'
  return 'Unknown'
}
