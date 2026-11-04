import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-lg border border-border/70 bg-background/35 px-3 py-2 text-sm shadow-soft outline-none transition-[border-color,background-color,box-shadow] duration-2 ease-fx placeholder:text-muted-foreground/70 hover:border-border focus-visible:border-fx-gold/45 focus-visible:bg-background/55 focus-visible:ring-2 focus-visible:ring-fx-gold/20 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }