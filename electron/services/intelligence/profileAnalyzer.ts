import path from 'path'
import fs from 'fs'
import type { WorkspaceIndex } from '../../../src/types'
import type { WorkspaceProfile, ScoredMetric, ScoringReason } from '../../../src/types/workspaceIntelligence'
import { assertPathAllowed } from '../../security-policy'

export function analyzeProfile(index: WorkspaceIndex, root: string): WorkspaceProfile {
  const pkg = (() => {
    try {
      const packagePath = assertPathAllowed(path.join(root, 'package.json'), [root])
      return JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
    } catch {
      return null
    }
  })()
  const projectName = pkg?.name || path.basename(root)
  
  const frameworks = index.frameworks || []
  const languages = index.languages || []
  const managers = index.packageManagers || []
  
  let projectType = 'Unknown'
  let category = 'general'
  let primaryPurpose = 'Project'
  let runtime: string[] = []
  let buildSystem: string[] = []
  let architecturePattern = 'Unknown'
  
  if (frameworks.includes('Electron')) { projectType = 'Desktop App'; category = 'desktop'; primaryPurpose = 'Desktop Application'; runtime.push('Node'); architecturePattern = 'Electron Desktop Application' }
  else if (frameworks.includes('Next.js')) { projectType = 'Web App'; category = 'web'; primaryPurpose = 'Full Stack Web App'; runtime.push('Node'); architecturePattern = 'Next.js Full Stack' }
  else if (frameworks.includes('React') && frameworks.includes('Vite')) { projectType = 'Web App'; category = 'web'; primaryPurpose = 'SPA'; runtime.push('Browser'); buildSystem.push('Vite'); architecturePattern = 'React + Vite SPA' }
  else if (frameworks.includes('Express') || frameworks.includes('Fastify') || frameworks.includes('NestJS')) { projectType = 'API'; category = 'backend'; primaryPurpose = 'REST API'; runtime.push('Node'); architecturePattern = frameworks.includes('NestJS') ? 'NestJS API' : 'Express REST API' }
  else if (languages.some(l => l.lang === 'Python')) { 
    if (frameworks.includes('Django')) { projectType = 'Web App'; category = 'web'; architecturePattern = 'Django Full Stack' }
    else if (frameworks.includes('FastAPI') || frameworks.includes('Flask')) { projectType = 'API'; category = 'backend'; architecturePattern = frameworks.includes('FastAPI') ? 'FastAPI REST API' : 'Flask API' }
    else { projectType = 'CLI/Script'; category = 'tool'; architecturePattern = 'Python CLI' }
    runtime.push('Python')
  }
  else if (languages.some(l => l.lang === 'Go')) { projectType = 'CLI/Service'; category = 'backend'; architecturePattern = 'Go Service'; runtime.push('Go') }
  else if (languages.some(l => l.lang === 'Rust')) { projectType = 'CLI/Library'; category = 'tool'; architecturePattern = 'Rust'; runtime.push('Rust') }
  else if (pkg?.main || frameworks.includes('TypeScript')) { projectType = 'Library'; category = 'library'; architecturePattern = 'Library' }
  
  if (managers.includes('npm') || managers.includes('yarn') || managers.includes('pnpm') || managers.includes('bun')) runtime.push('Node')
  if (frameworks.includes('Webpack')) buildSystem.push('Webpack')
  if (frameworks.includes('Vite')) buildSystem.push('Vite')
  
  return {
    projectName,
    projectType,
    category,
    primaryPurpose,
    languages,
    frameworks,
    runtime: [...new Set(runtime)],
    buildSystem: [...new Set(buildSystem)],
    packageManagers: managers,
    gitStatus: index.git,
    dependencies: index.dependencies,
    configFiles: index.configFiles,
    architecturePattern,
    folderStructureSummary: (index.topStructure || []).slice(0, 10)
  }
}
