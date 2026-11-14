import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

export interface NewsErrorBoundaryProps {
  readonly children: ReactNode
  readonly fallback?: ReactNode
  readonly onReset?: () => void
}

interface NewsErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class NewsErrorBoundary extends Component<NewsErrorBoundaryProps, NewsErrorBoundaryState> {
  public override state: NewsErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): NewsErrorBoundaryState {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[NewsErrorBoundary] Caught rendering error in News view:', error, errorInfo)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="news-state news-state--error"
        >
          <AlertCircle className="news-state__icon" size={32} aria-hidden="true" />
          <h2 className="news-state__title">Something went wrong</h2>
          <p className="news-state__message">
            The News reader encountered an unexpected display error.
          </p>
          <button
            type="button"
            className="news-state__retry-btn"
            onClick={this.handleReset}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
