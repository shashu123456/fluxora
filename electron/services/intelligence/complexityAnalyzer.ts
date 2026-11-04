import type { WorkspaceIndex } from '../../../src/types'
import type { ComplexityAnalysis } from '../../../src/types/workspaceIntelligence'

export function analyzeComplexity(index: WorkspaceIndex): ComplexityAnalysis {
  const debt: string[] = []
  const largeFiles: string[] = []
  const duplicates: string[] = []
  const deadCode: string[] = []
  const missingDocs: string[] = []
  const missingConfig: string[] = []
  
  const size = index.totalSize || 0
  const files = index.fileCount || 0
  
  let estimatedProjectSize = 'small'
  if (size > 50_000_000) estimatedProjectSize = 'large'
  else if (size > 10_000_000) estimatedProjectSize = 'medium'
  else estimatedProjectSize = 'small'
  
  let complexity: 'low' | 'medium' | 'high' = 'low'
  if (files > 3000 || index.frameworks.length > 4) complexity = 'high'
  else if (files > 800 || index.frameworks.length > 2) complexity = 'medium'
  
  if (!index.readme) { missingDocs.push('README missing'); debt.push('Missing README') }
  if ((index.docs?.length || 0) === 0) missingDocs.push('No documentation files')
  if ((index.testDirs?.length || 0) === 0 && !index.configFiles.some(c => /test/i.test(c.name))) { debt.push('No test coverage detected'); deadCode.push('Testing setup missing') }
  if (index.packageManagers.length > 1) debt.push('Multiple package managers')
  if (index.git.hasChanges) debt.push('Uncommitted changes')
  
  if (files > 10000) largeFiles.push(`Large file count: ${files}`)
  if (Object.keys(index.dependencies || {}).reduce((n,m)=>n+Object.keys(m).length,0) > 80) debt.push('High dependency count')
  
  return {
    estimatedProjectSize,
    complexity,
    technicalDebtIndicators: [...new Set(debt)],
    largeFiles,
    duplicatePatterns: duplicates,
    deadCodeIndicators: deadCode,
    missingDocumentation: missingDocs,
    missingConfiguration: missingConfig
  }
}
