import { PortableText, type PortableTextComponents } from '@portabletext/react'
import { isExternalLink } from './newsModel.ts'

export interface NewsPortableTextViewProps {
  readonly value?: readonly Record<string, unknown>[]
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
}

/**
 * Portable Text renderer for ministry News body content.
 *
 * Enforces strict link safety by neutralizing/blocking any external hrefs,
 * while honoring valid internal month destinations.
 */
export function NewsPortableTextView({ value, onNavigate }: NewsPortableTextViewProps) {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }

  const portableTextComponents: PortableTextComponents = {
    block: {
      normal: ({ children }) => <p className="news-body-paragraph">{children}</p>,
      h2: ({ children }) => <h3 className="news-body-heading news-body-heading--2">{children}</h3>,
      h3: ({ children }) => <h4 className="news-body-heading news-body-heading--3">{children}</h4>,
      blockquote: ({ children }) => (
        <blockquote className="news-body-quote">
          <p>{children}</p>
        </blockquote>
      ),
    },
    marks: {
      strong: ({ children }) => <strong>{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      link: ({ children, value: markValue }) => {
        const href = typeof markValue?.href === 'string' ? markValue.href.trim() : ''
        if (!href) return <>{children}</>

        if (isExternalLink(href)) {
          return (
            <span
              className="news-link news-link--blocked"
              role="link"
              aria-disabled="true"
              data-blocked-external-link="true"
              tabIndex={0}
              title="External links are not permitted in ministry News"
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                }
              }}
            >
              {children}
              <span className="sr-only"> (external link disabled)</span>
            </span>
          )
        }

        const handleInternalClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (href.startsWith('#/month/')) {
            const targetMonth = href.slice('#/month/'.length).trim()
            if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(targetMonth)) {
              event.preventDefault()
              onNavigate?.({ kind: 'month', monthId: targetMonth })
            }
          }
        }

        return (
          <a
            href={href}
            className="news-link news-link--internal"
            onClick={handleInternalClick}
          >
            {children}
          </a>
        )
      },
    },
    list: {
      bullet: ({ children }) => <ul className="news-body-list news-body-list--bullet">{children}</ul>,
      number: ({ children }) => <ol className="news-body-list news-body-list--number">{children}</ol>,
    },
    listItem: {
      bullet: ({ children }) => <li>{children}</li>,
      number: ({ children }) => <li>{children}</li>,
    },
  }

  // Cast value to any because @portabletext/react expects PortableTextBlock[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <div className="news-body"><PortableText value={value as any} components={portableTextComponents} /></div>
}
