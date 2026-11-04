import { all, get } from '../database'
import type { BrainInsight, BrainInsights, InsightConfidence, WorkspaceIndex } from '../../src/types'

const DAY = 86_400_000

function ago(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / DAY)}d ago`
}

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

interface ObservationInput {
  id: string
  topic: string
  severity?: BrainInsight['severity']
  confidence?: InsightConfidence
  title: string
  detail: string
  action?: BrainInsight['action']
}

function observation(o: ObservationInput): BrainInsight {
  return {
    id: o.id,
    category: 'observation',
    severity: o.severity || 'info',
    confidence: o.confidence || 'high',
    topic: o.topic,
    title: o.title,
    detail: o.detail,
    action: o.action,
  }
}

/**
 * Derives an actionable read-out of a workspace: what moved, what is missing,
 * what is risky, what the structure implies, and what to do next. Everything is
 * derived from data Fluxora already owns (workspace index, project brain,
 * terminal history, chats, usage) so insights are evidence, never invention.
 */
export async function buildBrainInsights(workspaceId: string): Promise<BrainInsights> {
  const changes: BrainInsight[] = []
  const gaps: BrainInsight[] = []
  const risks: BrainInsight[] = []
  const observations: BrainInsight[] = []
  const nextActions: BrainInsight[] = []

  let index: WorkspaceIndex | null = null
  try {
    const row = await get<{ data: string }>('SELECT data FROM workspace_index WHERE workspace_id = ?', [workspaceId])
    index = row ? (JSON.parse(row.data) as WorkspaceIndex) : null
  } catch { index = null }

  // ---------------------------------------------------------------- changes
  if (index?.git?.isRepo) {
    const bits: string[] = []
    if (index.git.branch) bits.push(`branch ${index.git.branch}`)
    bits.push(index.git.hasChanges ? 'uncommitted changes' : 'clean tree')
    if (index.git.lastCommit) bits.push(`last commit "${index.git.lastCommit}"`)
    changes.push({
      id: 'git-state',
      category: 'change',
      severity: 'info',
      title: 'Repository state',
      detail: bits.join(' · '),
      action: { kind: 'openTab', label: 'Open git', payload: { tab: 'workspace', panel: 'git' } },
    })
  }

  const recentFiles = index?.recentFiles || []
  if (recentFiles.length) {
    changes.push({
      id: 'recent-files',
      category: 'change',
      severity: 'info',
      title: `${recentFiles.length} recently modified file${recentFiles.length === 1 ? '' : 's'}`,
      detail: recentFiles.slice(0, 6).map((f) => `${basename(f.path)} (${ago(f.modifiedAt || Date.now())})`).join(', '),
      action: { kind: 'openTab', label: 'Open explorer', payload: { tab: 'workspace', panel: 'explorer' } },
    })
  }

  let recentChats: any[] = []
  try {
    recentChats = await all<any>(
      'SELECT title, updated_at FROM chats WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 6',
      [workspaceId]
    )
  } catch { recentChats = [] }
  if (recentChats.length) {
    changes.push({
      id: 'recent-chats',
      category: 'change',
      severity: 'info',
      title: `${recentChats.length} recent conversation${recentChats.length === 1 ? '' : 's'}`,
      detail: recentChats.map((c) => `${c.title || 'Untitled'} (${ago(c.updated_at)})`).join(', '),
      action: { kind: 'openTab', label: 'Open chat', payload: { tab: 'chat' } },
    })
  }

  let recentBrain: any[] = []
  try {
    recentBrain = await all<any>(
      "SELECT title, kind, updated_at FROM project_brain WHERE workspace_id = ? AND source != 'auto' ORDER BY updated_at DESC LIMIT 6",
      [workspaceId]
    )
  } catch { recentBrain = [] }
  if (recentBrain.length) {
    changes.push({
      id: 'brain-updates',
      category: 'change',
      severity: 'info',
      title: `${recentBrain.length} brain note${recentBrain.length === 1 ? '' : 's'} updated`,
      detail: recentBrain.map((b) => `${b.title} (${b.kind})`).join(', '),
      action: { kind: 'openTab', label: 'Open brain', payload: { tab: 'workspace', panel: 'brain' } },
    })
  }

  // ------------------------------------------------------------------- gaps
  if (!index) {
    gaps.push({
      id: 'not-indexed',
      category: 'gap',
      severity: 'warning',
      title: 'Workspace has never been indexed',
      detail: 'No structural index exists yet, so the AI has no picture of this codebase.',
      action: { kind: 'runCommand', label: 'Index workspace', payload: { command: 'workspace.index' } },
    })
  } else {
    if (!index.readmeSnippet) {
      gaps.push({
        id: 'no-readme',
        category: 'gap',
        severity: 'warning',
        title: 'No README found',
        detail: 'The project has no README at its root, so onboarding context is missing.',
        action: { kind: 'runCommand', label: 'Create README', payload: { command: 'workspace.createFile', filename: 'README.md' } },
      })
    }
    if (!index.docs?.length) {
      gaps.push({
        id: 'no-docs',
        category: 'gap',
        severity: 'info',
        title: 'No documentation directory detected',
        detail: 'No docs/ or equivalent folder was found in the indexed tree.',
      })
    }
    if (!index.testDirs?.length) {
      gaps.push({
        id: 'no-tests',
        category: 'gap',
        severity: 'warning',
        title: 'No test directories detected',
        detail: 'The indexer found no test folders, so automated coverage is unknown.',
      })
    }
    if (!index.entryPoints?.length) {
      gaps.push({
        id: 'no-entrypoints',
        category: 'gap',
        severity: 'info',
        title: 'No entry points identified',
        detail: 'The indexer could not identify a main file or bootstrap script.',
      })
    }
    const failingSignals = (index.health?.signals || []).filter((s) => !s.ok)
    if (failingSignals.length) {
      gaps.push({
        id: 'health-signals',
        category: 'gap',
        severity: 'warning',
        title: `${failingSignals.length} project health signal${failingSignals.length === 1 ? '' : 's'} not met`,
        detail: failingSignals.map((s) => s.label).join(', '),
      })
    }
  }

  let decisions: any[] = []
  let conventions: any[] = []
  let activeTodos: any[] = []
  let staleTodos: any[] = []
  try {
    decisions = await all<any>(
      "SELECT id, title FROM project_brain WHERE workspace_id = ? AND kind = 'decision' AND source != 'auto'",
      [workspaceId]
    )
    conventions = await all<any>(
      "SELECT id, title FROM project_brain WHERE workspace_id = ? AND kind = 'convention' AND source != 'auto'",
      [workspaceId]
    )
    activeTodos = await all<any>(
      "SELECT id, title, status, updated_at FROM project_brain WHERE workspace_id = ? AND kind = 'todo' AND source != 'auto' AND (status IS NULL OR LOWER(status) NOT IN ('done','completed'))",
      [workspaceId]
    )
    staleTodos = activeTodos.filter((t) => typeof t.updated_at === 'number' && Date.now() - t.updated_at > 14 * DAY)
  } catch { /* brain unavailable */ }

  if (decisions.length === 0) {
    gaps.push({
      id: 'no-decisions',
      category: 'gap',
      severity: 'info',
      title: 'No architectural decisions recorded',
      detail: 'Capture decisions in the Project Brain so future sessions stop re-litigating them.',
      action: { kind: 'openTab', label: 'Record decision', payload: { tab: 'workspace', panel: 'brain', kind: 'decision' } },
    })
  }
  if (conventions.length === 0) {
    gaps.push({
      id: 'no-conventions',
      category: 'gap',
      severity: 'info',
      title: 'No team conventions recorded',
      detail: 'Style, naming and workflow conventions are not written down anywhere.',
      action: { kind: 'openTab', label: 'Record convention', payload: { tab: 'workspace', panel: 'brain', kind: 'convention' } },
    })
  }

  let memoryCount = 0
  try {
    const row = await get<{ c: number }>('SELECT COUNT(*) as c FROM memories WHERE workspace_id = ?', [workspaceId])
    memoryCount = row?.c || 0
  } catch { memoryCount = 0 }
  if (memoryCount === 0) {
    gaps.push({
      id: 'no-memories',
      category: 'gap',
      severity: 'info',
      title: 'No memories captured yet',
      detail: 'The AI has no long-term notes about this project, so every session starts cold.',
      action: { kind: 'openTab', label: 'Open memory', payload: { tab: 'memory' } },
    })
  }

  // ------------------------------------------------------------ observations
  if (index) {
    const frameworks = index.frameworks || []
    const languages = index.languages || []
    const deps = index.dependencies || {}
    const managers = index.packageManagers || []
    const configNames = (index.configFiles || []).map((c) => c.name.toLowerCase())
    const topLanguages = languages.slice(0, 3).map((l) => l.lang).join(', ')
    const entryCount = index.entryPoints?.length || 0
    const docsCount = index.docs?.length || 0
    const testCount = index.testDirs?.length || 0
    const health = index.health

    if (frameworks.length || languages.length) {
      observations.push(observation({
        id: 'obs-architecture',
        topic: 'architecture',
        title: frameworks.length
          ? `${frameworks.slice(0, 3).join(' + ')} workspace`
          : `${topLanguages || 'Source'} workspace`,
        detail: [
          `${plural(index.fileCount, 'file')} across ${plural(index.dirCount, 'directory')}`,
          topLanguages ? `primary languages: ${topLanguages}` : null,
          entryCount ? `${plural(entryCount, 'entry point')} identified` : 'no entry point identified',
        ].filter(Boolean).join(' · '),
        action: { kind: 'openTab', label: 'Open intelligence', payload: { tab: 'workspace', panel: 'intelligence' } },
      }))
    }

    const depEntries = Object.entries(deps)
    if (depEntries.length) {
      const totalDeps = depEntries.reduce((sum, [, map]) => sum + Object.keys(map).length, 0)
      const devDeps = depEntries.reduce((sum, [, map]) => sum + Object.keys(map).filter((k) => String(map[k]).includes('(dev)')).length, 0)
      const hasLockfile = configNames.some((n) => /lock|shrinkwrap|pnpm-lock|yarn\.lock|bun\.lockb|package-lock/.test(n))
      observations.push(observation({
        id: 'obs-dependencies',
        topic: 'dependencies',
        severity: managers.length > 1 || (totalDeps > 0 && !hasLockfile) ? 'warning' : 'info',
        title: `${plural(totalDeps, 'dependency')} across ${plural(managers.length, 'package manager')}`,
        detail: [
          managers.length ? `managers: ${managers.join(', ')}` : null,
          totalDeps ? `${devDeps} dev · ${totalDeps - devDeps} runtime` : null,
          hasLockfile ? 'lockfile present' : 'no lockfile detected',
        ].filter(Boolean).join(' · '),
        action: { kind: 'openTab', label: 'Inspect stack', payload: { tab: 'workspace', panel: 'intelligence' } },
      }))
      if (managers.length > 1) {
        risks.push({
          id: 'multiple-package-managers',
          category: 'risk',
          severity: 'warning',
          title: `${managers.length} package managers in one workspace`,
          detail: `Detected ${managers.join(', ')}. Mixed lockfiles make installs non-deterministic across machines.`,
          action: { kind: 'openTab', label: 'Review dependencies', payload: { tab: 'workspace', panel: 'intelligence' } },
        })
      }
    }

    if (index.readmeSnippet && index.fileCount > 0) {
      const docCoverage = pct(docsCount, index.fileCount)
      observations.push(observation({
        id: 'obs-documentation',
        topic: 'documentation',
        severity: docsCount === 0 ? 'warning' : 'info',
        confidence: 'medium',
        title: docsCount === 0
          ? 'README only — no supporting docs'
          : `${plural(docsCount, 'documentation file')} for ${plural(index.fileCount, 'file')}`,
        detail: docsCount === 0
          ? 'Architecture and workflow knowledge is only captured in the README and in conversations.'
          : `Documentation covers roughly ${docCoverage}% of the file count; ${testCount ? 'tests are present' : 'no tests were found'}.`,
      }))
    }

    const hasCi = configNames.some((n) => n.includes('.github/workflows') || n.includes('gitlab-ci') || n.includes('jenkinsfile'))
    const hasEnvFile = configNames.some((n) => n === '.env' || n.endsWith('/.env'))
    const hasEnvTemplate = configNames.some((n) => n.includes('.env.example') || n.includes('.env.sample') || n.includes('.env.template'))
    const hasGitignore = configNames.some((n) => n.includes('.gitignore'))
    if (index.git?.isRepo && hasEnvFile && !hasEnvTemplate) {
      risks.push({
        id: 'env-without-template',
        category: 'risk',
        severity: 'critical',
        title: 'Environment file present without a template',
        detail: 'An .env file exists but no .env.example is published. Confirm it is ignored by git and document required keys.',
        action: { kind: 'openTab', label: 'Open explorer', payload: { tab: 'workspace', panel: 'explorer' } },
      })
    }
    if (index.git?.isRepo && !hasGitignore) {
      risks.push({
        id: 'no-gitignore',
        category: 'risk',
        severity: 'warning',
        title: 'No .gitignore detected at the project root',
        detail: 'Build output, local data or secrets could be committed accidentally.',
        action: { kind: 'openTab', label: 'Open explorer', payload: { tab: 'workspace', panel: 'explorer' } },
      })
    }
    if (!hasCi) {
      observations.push(observation({
        id: 'obs-delivery',
        topic: 'delivery',
        title: 'No continuous integration configured',
        detail: 'Checks run locally only, so regressions depend on the person shipping rather than the pipeline.',
      }))
    }

    if (index.fileCount > 20_000) {
      observations.push(observation({
        id: 'obs-performance-scale',
        topic: 'performance',
        severity: 'warning',
        confidence: 'high',
        title: `Large workspace — ${index.fileCount.toLocaleString()} files`,
        detail: 'Index, search and context assembly will be measurably slower. Keep indexing scoped and prefer targeted file reads.',
      }))
    } else if (index.fileCount > 5_000 && (frameworks.includes('Electron') || frameworks.includes('React'))) {
      observations.push(observation({
        id: 'obs-performance-renderer',
        topic: 'performance',
        confidence: 'medium',
        title: 'Substantial renderer surface',
        detail: `${index.fileCount.toLocaleString()} files with a UI framework present. Heavy imports should stay lazy and code-split.`,
      }))
    }

    const languageCount = languages.length
    if (languageCount > 3) {
      observations.push(observation({
        id: 'obs-polyglot',
        topic: 'maintainability',
        severity: 'info',
        confidence: 'medium',
        title: `Polyglot codebase — ${languageCount} languages`,
        detail: `Languages: ${languages.slice(0, 5).map((l) => `${l.lang} (${l.count})`).join(', ')}. Shared conventions need to be explicit to avoid drift.`,
      }))
    }

    if (health) {
      observations.push(observation({
        id: 'obs-health',
        topic: 'health',
        severity: health.score >= 70 ? 'info' : 'warning',
        title: `Project health ${health.score}%`,
        detail: health.score >= 85
          ? 'Structural signals — tests, docs, CI, typing and configuration — are strong.'
          : `Signals met: ${(health.signals || []).filter((s) => s.ok).map((s) => s.label).join(', ') || 'none'}.`,
        action: { kind: 'openTab', label: 'Open health', payload: { tab: 'workspace', panel: 'intelligence' } },
      }))
    }

    const indexedAgo = ago(index.indexedAt || Date.now())
    const weekly = recentFiles.filter((f) => f.modifiedAt && Date.now() - f.modifiedAt < 7 * DAY).length
    observations.push(observation({
      id: 'obs-evolution',
      topic: 'evolution',
      title: `Workspace last indexed ${indexedAgo}`,
      detail: weekly
        ? `${plural(weekly, 'file')} changed in the last 7 days — the project is actively moving.`
        : 'No files changed in the last 7 days; the workspace has been quiet.',
    }))
  }

  if (activeTodos.length > 0 && staleTodos.length > 0) {
    observations.push(observation({
      id: 'obs-stale-todos',
      topic: 'technical debt',
      severity: staleTodos.length > 3 ? 'warning' : 'info',
      title: `${plural(staleTodos.length, 'todo')} untouched for 14+ days`,
      detail: `Open todos: ${activeTodos.length}. Stale: ${staleTodos.slice(0, 4).map((t) => t.title).join(', ')}${staleTodos.length > 4 ? ', …' : ''}.`,
      action: { kind: 'openTab', label: 'Review todos', payload: { tab: 'workspace', panel: 'brain' } },
    }))
  }

  if (index?.git?.isRepo && index.git.branch && /^(main|master|trunk)$/.test(index.git.branch) && index.git.hasChanges) {
    observations.push(observation({
      id: 'obs-branch-discipline',
      topic: 'workflow',
      severity: 'info',
      confidence: 'medium',
      title: `Work in progress directly on ${index.git.branch}`,
      detail: 'Changes on the primary branch are harder to review and revert safely. A feature branch keeps the checkpoint clean.',
      action: { kind: 'openTab', label: 'Open git', payload: { tab: 'workspace', panel: 'git' } },
    }))
  }

  // ------------------------------------------------------------------ risks
  let failures: any[] = []
  try {
    failures = await all<any>(
      'SELECT command, exit_code, created_at FROM terminal_history WHERE workspace_id = ? AND exit_code IS NOT NULL AND exit_code != 0 ORDER BY created_at DESC LIMIT 5',
      [workspaceId]
    )
  } catch { failures = [] }
  if (failures.length) {
    risks.push({
      id: 'command-failures',
      category: 'risk',
      severity: 'critical',
      title: `${failures.length} failing command${failures.length === 1 ? '' : 's'} in history`,
      detail: failures.map((f) => `\`${f.command}\` exited ${f.exit_code} (${ago(f.created_at)})`).join(' · '),
      action: { kind: 'openTab', label: 'Open terminal', payload: { tab: 'workspace', panel: 'terminal' } },
    })
  }

  if (index?.git?.hasChanges) {
    risks.push({
      id: 'dirty-tree',
      category: 'risk',
      severity: 'warning',
      title: 'Uncommitted changes in the working tree',
      detail: 'Work in progress is not committed and could be lost or left inconsistent.',
      action: { kind: 'openTab', label: 'Open git panel', payload: { tab: 'workspace', panel: 'git' } },
    })
  }

  const healthScore = index?.health?.score
  if (typeof healthScore === 'number' && healthScore < 70) {
    risks.push({
      id: 'low-health',
      category: 'risk',
      severity: 'warning',
      title: `Project health score is ${healthScore}%`,
      detail: 'Structural signals (tests, docs, entry points, configs) are mostly unmet.',
    })
  }

  if (activeTodos.length > 10) {
    risks.push({
      id: 'todo-backlog',
      category: 'risk',
      severity: 'warning',
      title: `${activeTodos.length} open todos`,
      detail: 'The backlog is large enough that work may be drifting without a clear priority.',
      action: { kind: 'openTab', label: 'Review todos', payload: { tab: 'workspace', panel: 'brain' } },
    })
  }

  if (index && memoryCount === 0 && recentChats.length > 3) {
    risks.push({
      id: 'no-memory-retention',
      category: 'risk',
      severity: 'info',
      title: 'Conversations are not being retained',
      detail: 'This workspace has chats but zero memories — insight from past sessions is being lost.',
      action: { kind: 'openTab', label: 'Open memory', payload: { tab: 'memory' } },
    })
  }

  // ------------------------------------------------------------ next actions
  for (const t of activeTodos.slice(0, 5)) {
    nextActions.push({
      id: `todo:${t.id}`,
      category: 'action',
      severity: 'info',
      title: `Continue: ${t.title}`,
      detail: t.status ? `Status: ${t.status}` : 'Open todo in the Project Brain.',
      action: { kind: 'openTab', label: 'Open todo', payload: { tab: 'workspace', panel: 'brain' } },
    })
  }

  for (const f of failures.slice(0, 3)) {
    nextActions.push({
      id: `rerun:${f.created_at}:${f.command}`,
      category: 'action',
      severity: 'warning',
      title: `Re-run failing command: ${f.command}`,
      detail: `Last run exited ${f.exit_code} on ${ago(f.created_at)}.`,
      action: { kind: 'openTab', label: 'Open terminal', payload: { tab: 'workspace', panel: 'terminal' } },
    })
  }

  if (!index) {
    nextActions.push({
      id: 'action:index',
      category: 'action',
      severity: 'info',
      title: 'Index the workspace',
      detail: 'Indexing unlocks architecture, stack, dependency and health context.',
      action: { kind: 'runCommand', label: 'Index now', payload: { command: 'workspace.index' } },
    })
  } else {
    nextActions.push({
      id: 'action:sync-brain',
      category: 'action',
      severity: 'info',
      title: 'Refresh the Project Brain',
      detail: 'Regenerate the auto sections so they match the current state of the code.',
      action: { kind: 'runCommand', label: 'Sync brain', payload: { command: 'brain.sync' } },
    })
  }

  if (index?.git?.hasChanges) {
    nextActions.push({
      id: 'action:commit',
      category: 'action',
      severity: 'info',
      title: 'Commit the working tree',
      detail: 'A checkpoint keeps the current work recoverable and reviewable.',
      action: { kind: 'openTab', label: 'Open git panel', payload: { tab: 'workspace', panel: 'git' } },
    })
  }

  if (decisions.length === 0) {
    nextActions.push({
      id: 'action:decision',
      category: 'action',
      severity: 'info',
      title: 'Capture the current architecture as a decision',
      detail: 'One entry prevents the next session from re-deriving what you already know.',
      action: { kind: 'openTab', label: 'Record decision', payload: { tab: 'workspace', panel: 'brain', kind: 'decision' } },
    })
  }

  const counts = {
    changes: changes.length,
    gaps: gaps.length,
    risks: risks.length,
    observations: observations.length,
    actions: nextActions.length,
  }
  const summary =
    counts.changes === 0 && counts.gaps === 0 && counts.risks === 0
      ? 'No signals yet — index the workspace to unlock insights.'
      : `${counts.changes} change${counts.changes === 1 ? '' : 's'} · ${counts.gaps} gap${counts.gaps === 1 ? '' : 's'} · ${counts.risks} risk${counts.risks === 1 ? '' : 's'} · ${counts.observations} observation${counts.observations === 1 ? '' : 's'} · ${counts.actions} next step${counts.actions === 1 ? '' : 's'}`

  return {
    workspaceId,
    generatedAt: Date.now(),
    summary,
    counts,
    changes,
    gaps,
    risks,
    observations,
    nextActions,
  }
}
