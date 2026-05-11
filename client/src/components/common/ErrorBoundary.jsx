import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Native Capacitor console serialises objects via JSON.stringify, which
    // drops non-enumerable Error fields (message/stack/name). Log everything
    // as plain strings so the iOS console actually shows what blew up.
    const message = error?.message || String(error);
    const name    = error?.name    || 'Error';
    const stack   = error?.stack   || '(no stack)';
    const componentStack = errorInfo?.componentStack || '(no component stack)';
    // eslint-disable-next-line no-console
    console.error(
      `[ErrorBoundary] ${name}: ${message}` +
      `\n--- error.stack ---\n${stack}` +
      `\n--- componentStack ---\n${componentStack}`
    );
    // Also keep the structured log for browsers that handle it well
    // eslint-disable-next-line no-console
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Optional custom inline fallback — used by partial-page boundaries
      // (e.g. test detail) so a single bad item shows a small error card
      // instead of taking over the whole viewport.
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error)
          : this.props.fallback;
      }
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-600 mb-6">
                {this.state.error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </button>
                <button
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.href = '/';
                  }}
                >
                  Go Home
                </button>
              </div>
              {process.env.NODE_ENV === 'development' && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Error Details (Dev Only)
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-48">
                    {this.state.error?.stack || JSON.stringify(this.state.error, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 