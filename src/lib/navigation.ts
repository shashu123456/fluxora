import type { AppTab } from '@/types'

export interface NavItem {
  id: AppTab
  label: string
  icon: string
  keywords: string[]
  shortcut?: string
}

/**
 * Single source of truth for application navigation. The sidebar, the keyboard
 * shortcuts and the command palette all read from this list so they can never
 * drift apart.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'home',
    label: 'Mission Control',
    icon: 'home',
    keywords: ['home', 'dashboard', 'mission control', 'overview', 'start'],
    shortcut: 'Ctrl+1',
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: 'chat',
    keywords: ['chat', 'conversation', 'talk', 'assistant'],
    shortcut: 'Ctrl+2',
  },
  {
    id: 'search',
    label: 'Search',
    icon: 'search',
    keywords: ['search', 'find', 'spotlight', 'everything'],
    shortcut: 'Ctrl+3',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: 'workspace',
    keywords: ['workspace', 'project', 'code', 'files', 'folder', 'terminal', 'brain'],
    shortcut: 'Ctrl+4',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: 'memory',
    keywords: ['memory', 'notes', 'remember', 'knowledge'],
    shortcut: 'Ctrl+5',
  },
  {
    id: 'prompts',
    label: 'Prompts',
    icon: 'prompts',
    keywords: ['prompt', 'template', 'library', 'snippets'],
    shortcut: 'Ctrl+6',
  },
  {
    id: 'visualizations',
    label: 'Visualizations',
    icon: 'visualizations',
    keywords: ['graph', 'timeline', 'chart', 'knowledge graph', 'dependency'],
    shortcut: 'Ctrl+7',
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: 'usage',
    keywords: ['usage', 'tokens', 'cost', 'billing', 'spend'],
    shortcut: 'Ctrl+8',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    keywords: ['settings', 'preferences', 'configure', 'provider', 'theme'],
    shortcut: 'Ctrl+9',
  },
  {
    id: 'developer',
    label: 'Profile',
    icon: 'developer',
    keywords: ['profile', 'developer', 'learning', 'insights', 'sessions', 'habits', 'personal'],
    shortcut: 'Ctrl+0',
  },
]

export const NAV_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV_ITEMS.map((n) => [n.id, n])
)

export function navLabel(tab: string): string {
  return NAV_BY_ID[tab]?.label || tab
}
