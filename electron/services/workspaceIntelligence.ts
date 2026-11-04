import fs from 'fs'
import path from 'path'
import { get, run } from '../database'
import type { WorkspaceIndex } from '../../src/types'
import type { WorkspaceIntelligence } from '../../src/types/workspaceIntelligence'
import { analyzeProfile } from './intelligence/profileAnalyzer'
import { analyzeHealth } from './intelligence/healthAnalyzer'
import { analyzeComplexity } from './intelligence/complexityAnalyzer'
import { analyzeInsights, analyzeRepository } from './intelligence/repoAnalyzer'
import { analyzeRisks } from './intelligence/riskEngine'
import { generateContextSummary, generateArchitectureSummary } from './intelligence/summaryGenerator'
import { evolveWorkspace } from './intelligenceEvolution'
import { assertPathInsideRoots, canonicalizePath } from '../security-policy'

const CACHE_DIR = '.fluxora-intel'
const CACHE_FILE = 'workspace-intel.json'

function getCachePath(root: string): string {
  return path.join(root, CACHE_DIR, CACHE_FILE)
}

function isCacheValid(cachePath: string, index: WorkspaceIndex): boolean {
  try {
    if (!fs.existsSync(cachePath)) return false
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    if (!cache.generatedAt || !cache.indexedAt) return false
    // Invalidate if index is newer
    if (cache.indexedAt < (index.indexedAt || 0)) return false
    return true
  } catch {
    return false
  }
}

function writeCache(root: string, intel: WorkspaceIntelligence, indexedAt: number) {
  try {
    const dir = assertPathInsideRoots(path.join(root, CACHE_DIR), [root])
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const cacheFile = assertPathInsideRoots(getCachePath(root), [root])
    fs.writeFileSync(cacheFile, JSON.stringify({ ...intel, indexedAt }, null, 2))
  } catch {}
}

function readCache(cachePath: string): WorkspaceIntelligence | null {
  try {
    if (!fs.existsSync(cachePath)) return null
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    const { indexedAt, ...intel } = cache
    return intel as WorkspaceIntelligence
  } catch {
    return null
  }
}

export async function buildWorkspaceIntelligence(workspaceId: string, force = false): Promise<WorkspaceIntelligence | null> {
  const ws = await get<any>('SELECT path FROM workspaces WHERE id = ?', [workspaceId])
  if (!ws || !ws.path) return null

  let root: string
  try {
    root = canonicalizePath(ws.path)
    if (!fs.statSync(root).isDirectory()) return null
  } catch {
    return null
  }
  
  // Get index
  const row = await get<any>('SELECT data FROM workspace_index WHERE workspace_id = ?', [workspaceId])
  if (!row?.data) return null
  
  let index: WorkspaceIndex
  try {
    index = JSON.parse(row.data)
  } catch {
    return null
  }
  
  let cachePath: string | null = null
  try {
    cachePath = assertPathInsideRoots(getCachePath(root), [root])
  } catch {
    cachePath = null
  }
  if (!force && cachePath && isCacheValid(cachePath, index)) {
    const cached = readCache(cachePath)
    if (cached) return cached
  }
  
  // Previous snapshot — used to describe how the workspace evolved.
  let previous: WorkspaceIntelligence | null = null
  try {
    const prevRow = await get<any>('SELECT data FROM workspace_intelligence WHERE workspace_id = ?', [workspaceId])
    if (prevRow?.data) previous = JSON.parse(prevRow.data)
  } catch { previous = null }
  
  // Build intelligence
  const profile = analyzeProfile(index, root)
  const health = analyzeHealth(index, root)
  const complexity = analyzeComplexity(index)
  const insights = analyzeInsights(index)
  const repository = analyzeRepository(index)
  const risks = analyzeRisks(index)
  const contextSummary = generateContextSummary(profile, health, complexity)
  const architectureSummary = generateArchitectureSummary(profile)
  
  const intelligence: WorkspaceIntelligence = {
    workspaceId,
    generatedAt: Date.now(),
    profile,
    health,
    complexity,
    insights,
    repository,
    risks,
    contextSummary,
    architectureSummary,
    intelligenceVersion: '1.0.0'
  }
  
  writeCache(root, intelligence, index.indexedAt || 0)
  
  // Store in DB
  try {
    await run(
      `CREATE TABLE IF NOT EXISTS workspace_intelligence (
        workspace_id TEXT PRIMARY KEY,
        data TEXT,
        generated_at INTEGER
      )`
    )
    await run(
      `INSERT INTO workspace_intelligence (workspace_id, data, generated_at) VALUES (?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, generated_at = excluded.generated_at`,
      [workspaceId, JSON.stringify(intelligence), intelligence.generatedAt]
    )
  } catch {}
  
  // Evolve the Brain and the Intelligence Timeline from the change.
  try {
    await evolveWorkspace(workspaceId, previous, intelligence)
  } catch {}
  
  return intelligence
}

export async function getWorkspaceIntelligence(workspaceId: string): Promise<WorkspaceIntelligence | null> {
  try {
    const row = await get<any>('SELECT data FROM workspace_intelligence WHERE workspace_id = ?', [workspaceId])
    if (row?.data) {
      try {
        return JSON.parse(row.data)
      } catch {}
    }
  } catch {}
  
  return buildWorkspaceIntelligence(workspaceId)
}
