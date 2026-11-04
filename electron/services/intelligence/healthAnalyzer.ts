import type { WorkspaceIndex } from '../../../src/types'
import type { HealthAnalysis, ScoredMetric, ScoringReason } from '../../../src/types/workspaceIntelligence'

function metric(score: number, reasons: ScoringReason[]): ScoredMetric {
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons }
}

export function analyzeHealth(index: WorkspaceIndex, root: string): HealthAnalysis {
  const reasons: Record<string, ScoringReason[]> = {
    doc: [], ai: [], arch: [], org: [], dep: [], sec: [], maint: [], perf: []
  }
  
  // Documentation
  let docScore = 0
  if (index.readme) { docScore += 40; reasons.doc.push({reason: 'README exists', impact: 'positive'}) }
  else reasons.doc.push({reason: 'No README found', impact: 'negative'})
  if ((index.docs?.length || 0) > 0) { docScore += 20; reasons.doc.push({reason: `${index.docs?.length} docs found`, impact: 'positive'}) }
  else reasons.doc.push({reason: 'No docs/ folder or docs', impact: 'negative'})
  if (index.configFiles.some(c => /contributing/i.test(c.name))) { docScore += 20; reasons.doc.push({reason: 'Contribution guide present', impact: 'positive'}) }
  else reasons.doc.push({reason: 'Missing contribution guide', impact: 'neutral'})
  if (index.configFiles.some(c => /license/i.test(c.name))) { docScore += 20; reasons.doc.push({reason: 'License present', impact: 'positive'}) }
  
  // AI Readiness
  let aiScore = 0
  if (index.readmeSnippet) { aiScore += 25; reasons.ai.push({reason: 'README provides context', impact: 'positive'}) }
  if ((index.testDirs?.length || 0) > 0) { aiScore += 20; reasons.ai.push({reason: 'Tests provide behavioral context', impact: 'positive'}) }
  else reasons.ai.push({reason: 'No test directories detected', impact: 'negative'})
  if (index.packageManagers.length > 0) { aiScore += 15; reasons.ai.push({reason: 'Clear dependency graph', impact: 'positive'}) }
  if (index.entryPoints?.length) { aiScore += 20; reasons.ai.push({reason: 'Entry points identified', impact: 'positive'}) }
  else reasons.ai.push({reason: 'Entry points unclear', impact: 'negative'})
  if (index.frameworks.length > 0) { aiScore += 20; reasons.ai.push({reason: 'Frameworks detected', impact: 'positive'}) }
  
  // Architecture
  let archScore = 40
  if (index.frameworks.length > 0) { archScore += 20; reasons.arch.push({reason: 'Clear framework usage', impact: 'positive'}) }
  if ((index.configFiles?.length || 0) > 3) { archScore += 20; reasons.arch.push({reason: 'Well configured', impact: 'positive'}) }
  else reasons.arch.push({reason: 'Few config files', impact: 'neutral'})
  if (index.entryPoints?.length) { archScore += 20; reasons.arch.push({reason: 'Clear entry points', impact: 'positive'}) }
  
  // Organization
  let orgScore = 50
  if (index.dirCount > 5) { orgScore += 25; reasons.org.push({reason: 'Structured directories', impact: 'positive'}) }
  if ((index.testDirs?.length || 0) > 0) { orgScore += 25; reasons.org.push({reason: 'Tests organized separately', impact: 'positive'}) }
  
  // Dependency health
  let depScore = 60
  const depCount = Object.values(index.dependencies || {}).reduce((n, m) => n + Object.keys(m).length, 0)
  if (index.packageManagers.length === 1) { depScore += 25; reasons.dep.push({reason: 'Single package manager', impact: 'positive'}) }
  else if (index.packageManagers.length > 1) { depScore -= 15; reasons.dep.push({reason: 'Multiple package managers', impact: 'negative'}) }
  if (depCount < 50) { depScore += 15; reasons.dep.push({reason: 'Manageable dependency count', impact: 'positive'}) }
  else if (depCount > 100) { depScore -= 10; reasons.dep.push({reason: 'High dependency count', impact: 'negative'}) }
  
  // Security
  let secScore = 50
  if (index.configFiles.some(c => /\.env$/i.test(c.name))) { secScore -= 20; reasons.sec.push({reason: '.env file present - check for committed secrets', impact: 'negative'}) }
  if (index.configFiles.some(c => /\.env\.(example|sample|template)/i.test(c.name))) { secScore += 30; reasons.sec.push({reason: 'Env template present', impact: 'positive'}) }
  else { secScore -= 10; reasons.sec.push({reason: 'No env template found', impact: 'negative'}) }
  if (index.git.isRepo) { secScore += 20; reasons.sec.push({reason: 'Git tracked', impact: 'positive'}) }
  
  // Maintainability
  let maintScore = 50
  if (index.health?.score) { maintScore += index.health.score * 0.3; reasons.maint.push({reason: `Health signals: ${index.health.score}%`, impact: index.health.score > 70 ? 'positive' : 'neutral'}) }
  if ((index.docs?.length || 0) > 0) { maintScore += 20; reasons.maint.push({reason: 'Documentation aids maintenance', impact: 'positive'}) }
  
  // Performance
  let perfScore = 70
  if (index.fileCount > 10000) { perfScore -= 20; reasons.perf.push({reason: 'Large codebase', impact: 'negative'}) }
  else if (index.fileCount < 1000) { perfScore += 15; reasons.perf.push({reason: 'Compact codebase', impact: 'positive'}) }
  if (index.frameworks.includes('Vite')) { perfScore += 10; reasons.perf.push({reason: 'Modern build tooling', impact: 'positive'}) }
  
  const overall = (docScore + aiScore + archScore + orgScore + depScore + secScore + maintScore + perfScore) / 8
  
  return {
    documentationScore: metric(docScore, reasons.doc),
    aiReadinessScore: metric(aiScore, reasons.ai),
    architectureScore: metric(archScore, reasons.arch),
    codeOrganizationScore: metric(orgScore, reasons.org),
    dependencyHealth: metric(depScore, reasons.dep),
    securityScore: metric(secScore, reasons.sec),
    maintainabilityScore: metric(maintScore, reasons.maint),
    performanceScore: metric(perfScore, reasons.perf),
    overallWorkspaceHealth: metric(overall, [{reason: `Composite of 8 metrics`, impact: overall > 70 ? 'positive' : overall > 50 ? 'neutral' : 'negative'}])
  }
}
