import type { WorkspaceIndex } from '../../../src/types'
import type { RiskEngine, ScoredMetric, ScoringReason } from '../../../src/types/workspaceIntelligence'

function metric(score: number, reasons: ScoringReason[]): ScoredMetric {
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

export function analyzeRisks(index: WorkspaceIndex): RiskEngine {
  const secReasons: ScoringReason[] = []
  const depReasons: ScoringReason[] = []
  const maintReasons: ScoringReason[] = []
  const archReasons: ScoringReason[] = []
  const docReasons: ScoringReason[] = []
  const confReasons: ScoringReason[] = []
  const perfReasons: ScoringReason[] = []
  
  let sec = 80
  if (index.configFiles.some((c: any) => /\.env$/.test(c.name))) { sec -= 30; secReasons.push({reason: '.env file committed risk', impact: 'negative'}) }
  if (index.configFiles.some((c: any) => /\.env\.example/.test(c.name))) { sec += 15; secReasons.push({reason: 'Env template present', impact: 'positive'}) }
  else secReasons.push({reason: 'No env template', impact: 'neutral'})
  
  let dep = 70
  const depCount = Object.values(index.dependencies || {}).reduce((n: number,m: any)=>n+Object.keys(m||{}).length,0)
  if (index.packageManagers.length > 1) { dep -= 25; depReasons.push({reason: 'Multiple package managers', impact: 'negative'}) }
  if (depCount > 100) { dep -= 15; depReasons.push({reason: 'High dependency count', impact: 'negative'}) }
  else if (depCount > 0) { dep += 10; depReasons.push({reason: 'Dependencies tracked', impact: 'positive'}) }
  
  let maint = 70
  if (index.git.hasChanges) { maint -= 10; maintReasons.push({reason: 'Uncommitted changes', impact: 'negative'}) }
  if ((index.testDirs?.length || 0) === 0) { maint -= 20; maintReasons.push({reason: 'No tests', impact: 'negative'}) }
  else { maint += 15; maintReasons.push({reason: 'Tests present', impact: 'positive'}) }
  
  let arch = 75
  if (index.entryPoints?.length) archReasons.push({reason: `Entry points identified (${index.entryPoints.length})`, impact: 'positive'})
  else { arch -= 15; archReasons.push({reason: 'Unclear entry points', impact: 'negative'}) }
  if (index.frameworks.length === 0 && index.fileCount > 10) { arch -= 10; archReasons.push({reason: 'No framework detected', impact: 'neutral'}) }
  else if (index.frameworks.length > 0) archReasons.push({reason: `Framework stack detected (${index.frameworks.join(', ')})`, impact: 'positive'})
  
  let doc = 70
  if (!index.readme) { doc -= 40; docReasons.push({reason: 'No README', impact: 'negative'}) }
  else { doc += 20; docReasons.push({reason: 'README exists', impact: 'positive'}) }
  if ((index.docs?.length || 0) === 0) { doc -= 15; docReasons.push({reason: 'No docs', impact: 'negative'}) }
  
  let conf = 75
  if (index.configFiles.some((c: any) => /tsconfig|package\.json|vite|webpack/.test(c.name))) { conf += 10; confReasons.push({reason: 'Build config present', impact: 'positive'}) }
  
  let perf = 75
  if (index.fileCount > 10000) { perf -= 20; perfReasons.push({reason: 'Large codebase size', impact: 'negative'}) }
  else if (index.fileCount < 2000) { perf += 10; perfReasons.push({reason: 'Compact codebase', impact: 'positive'}) }
  else perfReasons.push({reason: 'Codebase size within normal range', impact: 'neutral'})
  
  return {
    securityRisk: metric(sec, secReasons),
    dependencyRisk: metric(dep, depReasons),
    maintenanceRisk: metric(maint, maintReasons),
    architectureRisk: metric(arch, archReasons),
    documentationRisk: metric(doc, docReasons),
    configurationRisk: metric(conf, confReasons),
    performanceRisk: metric(perf, perfReasons)
  }
}
