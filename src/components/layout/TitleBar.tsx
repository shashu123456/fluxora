import { Menu, Minus, Square, Sun, Moon, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/uiStore'
import { FluxoraMark } from '@/components/brand/FluxoraMark'
import { navLabel } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
const mod = isMac ? '⌘' : 'Ctrl'

export function TitleBar() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const activeTab = useUIStore((s) => s.activeTab)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen)

  return (
    <div
      className={cn(
        'relative z-20 flex h-11 shrink-0 items-center gap-2 border-b border-border/45 bg-background/55 px-2 backdrop-blur-2xl app-drag',
        isMac && 'pl-20'
      )}
    >
      <div className="flex shrink-0 items-center gap-1 app-no-drag">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title={`Toggle sidebar (${mod} B)`}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="ml-1 hidden items-center gap-2 sm:flex">
          <FluxoraMark size={14} className="opacity-85" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            {navLabel(activeTab)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 justify-center px-3">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="fx-press group hidden h-7 w-full max-w-[24rem] items-center gap-2 rounded-lg border border-border/45 bg-background/25 px-2.5 text-[12px] text-muted-foreground/80 outline-none hover:border-border/80 hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-fx-gold/30 md:flex app-no-drag"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Search or run a command</span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="fx-kbd">{mod}</kbd>
            <kbd className="fx-kbd">K</kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 app-no-drag">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="mx-1 h-4 w-px bg-border/60" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => window.api.minimize()}
          aria-label="Minimize window"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => window.api.maximize()}
          aria-label="Maximize window"
        >
          <Square className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => window.api.close()}
          aria-label="Close window"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
