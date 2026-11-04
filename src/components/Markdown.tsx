import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/lib/utils'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('markdown', markdown)

interface MarkdownProps {
  content: string
  className?: string
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const html = useMemo(() => {
    const lang = language && hljs.getLanguage(language) ? language : 'plaintext'
    try {
      return hljs.highlight(value, { language: lang, ignoreIllegals: true }).value
    } catch {
      return null
    }
  }, [language, value])
  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="text-xs font-mono text-muted-foreground">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        {html !== null ? (
          <code className={cn('hljs', language)} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className={cn('hljs', language)}>{value}</code>
        )}
      </pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({ content, className }: MarkdownProps) {
  const components = useMemo(() => ({
    code({ node, className: cl, children, ...props }: any) {
      const match = /language-(\w+)/.exec(cl || '')
      const inline = !match
      if (inline) {
        return (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
            {children}
          </code>
        )
      }
      return <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')} />
    },
    a({ children, href, ...props }: any) {
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-blue-500 underline hover:text-blue-400" {...props}>
          {children}
        </a>
      )
    },
    table({ children, ...props }: any) {
      return (
        <div className="overflow-x-auto">
          <table className="my-2 w-full border-collapse text-sm" {...props}>
            {children}
          </table>
        </div>
      )
    },
  }), [])

  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-code:before:content-none prose-code:after:content-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})