import { PortableText, type PortableTextComponents } from '@portabletext/react'
import { classifyNewsLink } from './newsModel.ts'

export interface NewsPortableTextViewProps {
  readonly value?: readonly Record<string, unknown>[]
  readonly onNavigate?: (destination: { kind: 'month'; monthId: string }) => void
}

/**
 * Portable Text renderer for ministry News body content.
 *
 * Enforces strict link safety by neutralizing/blocking any external hrefs and
 * unauthorized internal destinations, while dispatching only authorized
 * month destinations (`#/month/YYYY-MM`) through `onNavigate`.
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

        const classification = classifyNewsLink(href)

        if (classification.kind === 'authorizedMonth' && onNavigate) {
          return (
            <a
              href={href}
              className="news-link news-link--internal"
              onClick={event => {
                event.preventDefault()
                onNavigate({ kind: 'month', monthId: classification.monthId })
              }}
            >
              {children}
            </a>
          )
        }

        const isExternal = classification.kind === 'external'
        const isUnauthorizedInternal = classification.kind === 'unauthorizedInternal'
        const tooltipTitle = isExternal
          ? 'External links are not permitted in ministry News'
          : 'This internal destination is not authorized in ministry News'
        const screenReaderNote = isExternal
          ? ' (external link disabled)'
          : ' (link disabled)'

        return (
          <span
            className="news-link news-link--blocked"
            role="link"
            aria-disabled="true"
            data-blocked-link="true"
            data-blocked-external-link={isExternal ? 'true' : undefined}
            data-blocked-internal-link={isUnauthorizedInternal ? 'true' : undefined}
            tabIndex={0}
            title={tooltipTitle}
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
            <span className="sr-only">{screenReaderNote}</span>
          </span>
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
