export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules', 'dist', 'build', 'out', 'release', '.next', '.git', '.gitlab',
  '.cache', '__pycache__', 'coverage', 'target', 'venv', '.venv', '.idea', '.vscode',
  '.turbo', '.parcel-cache', '.gradle', 'Pods', '.DS_Store',
])

export function isSkippedDir(name: string): boolean {
  return SKIP_DIRS.has(name)
}

export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ico', '.woff', '.woff2',
  '.ttf', '.exe', '.dll', '.db', '.sqlite', '.zip',
])

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}