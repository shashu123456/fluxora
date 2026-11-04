import type { WorkspaceIndex } from '../../../src/types'
import type { DevelopmentInsights, RepositoryIntelligence } from '../../../src/types/workspaceIntelligence'

export function analyzeInsights(index: WorkspaceIndex): DevelopmentInsights {
  const strengths: string[] = []
  const weaknesses: string[] = []
  const risks: string[] = []
  const improvements: string[] = []
  const nextSteps: string[] = []
  
  if (index.readme) strengths.push('Clear project documentation')
  else { weaknesses.push('Missing README'); improvements.push('Add README'); nextSteps.push('Create comprehensive README') }
  
  if ((index.testDirs?.length || 0) > 0) strengths.push('Test infrastructure present')
  else { weaknesses.push('No tests detected'); improvements.push('Add tests'); nextSteps.push('Set up testing framework') }
  
  if (index.frameworks.length > 0) strengths.push('Modern framework usage')
  if (index.git.isRepo) strengths.push('Version control in place')
  else { weaknesses.push('Not a git repository'); risks.push('No version control') }
  
  if (index.health?.score && index.health.score > 70) strengths.push('Good project health')
  else if (index.health?.score && index.health.score < 50) { weaknesses.push('Low project health'); improvements.push('Address health signals') }
  
  if (index.git.hasChanges) { risks.push('Uncommitted changes'); nextSteps.push('Commit or stash changes') }
  
  let stage = 'Unknown'
  if (index.packageManagers.length > 0 && (index.testDirs?.length || 0) > 0) stage = 'Active Development'
  else if (index.packageManagers.length > 0) stage = 'Development'
  else if (index.fileCount > 0) stage = 'Setup'
  
  return {
    currentDevelopmentStage: stage,
    confidenceLevel: index.frameworks.length > 0 && index.readme ? 'high' : index.readme ? 'medium' : 'low',
    recommendedNextSteps: nextSteps.slice(0, 5),
    potentialRisks: risks,
    suggestedImprovements: improvements.slice(0, 5),
    strengths,
    weaknesses
  }
}

export function analyzeRepository(index: WorkspaceIndex): RepositoryIntelligence {
  let gitActivity: 'active' | 'moderate' | 'quiet' | 'none' = 'none'
  if (index.git.isRepo) {
    if (index.git.hasChanges) gitActivity = 'active'
    else gitActivity = 'moderate'
  }
  
  const areas: string[] = []
  if (index.recentFiles?.length) {
    const dirs = new Set(index.recentFiles.map(f => f.path.split(/[/\\]/).slice(-2,-1)[0]).filter(Boolean))
    areas.push(...Array.from(dirs).slice(0, 5))
  }
  
  return {
    gitActivity,
    commitFrequency: index.git.lastCommit ? 'unknown' : 'unknown',
    branchStatus: index.git.branch || 'unknown',
    dirtyState: !!index.git.hasChanges,
    recentlyModifiedAreas: areas
  }
}
