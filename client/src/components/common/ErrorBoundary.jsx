import React from 'react';

// Keys we must NOT wipe when resetting — losing these would sign the user out.
const PRESERVED_KEYS = ['token', 'authToken', 'user', 'global_selectedAthleteId'];

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, isLoop: false };
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

    // Crash-loop detection: when the underlying state (e.g. corrupt cached data)
    // keeps throwing right after a reload/Go-Home, reloading alone can never
    // recover — surface the "Reset" escape so the user isn't trapped.
    try {
      const now  = Date.now();
      const last = Number(sessionStorage.getItem('eb_lastCrashAt')) || 0;
      const within = now - last < 30000;
      const count  = within ? (Number(sessionStorage.getItem('eb_crashCount')) || 0) + 1 : 1;
      sessionStorage.setItem('eb_lastCrashAt', String(now));
      sessionStorage.setItem('eb_crashCount', String(count));
      if (count >= 2) this.setState({ isLoop: true });
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }

  // Always target the app origin root. A deep BrowserRouter path (e.g.
  // /dashboard) is not reliably reloadable inside the Capacitor shell
  // (capacitor://localhost/), so navigating to "/" is the safe reset point.
  goToRoot = () => {
    try {
      window.location.href = `${window.location.origin}/`;
    } catch {
      window.location.href = '/';
    }
  };

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      this.goToRoot();
    }
  };

  // Break a persisted-bad-data crash loop WITHOUT logging the user out: wipe
  // every cache/preference key except the auth-critical ones, then hard-reload
  // to the app root.
  handleReset = () => {
    try {
      const preserved = {};
      PRESERVED_KEYS.forEach((k) => {
        const v = localStorage.getItem(k);
        if (v != null) preserved[k] = v;
      });
      localStorage.clear();
      Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
      sessionStorage.clear();
    } catch {
      /* storage unavailable — still try to navigate away */
    }
    this.goToRoot();
  };

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
                  onClick={this.handleReload}
                >
                  Refresh Page
                </button>
                <button
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  onClick={this.goToRoot}
                >
                  Go Home
                </button>
              </div>

              {this.state.isLoop && (
                <p className="mt-5 text-sm text-gray-500">
                  Still stuck after reloading? Reset the app to clear cached data
                  (you stay signed in).
                </p>
              )}
              <button
                className="mt-3 text-sm font-medium text-primary hover:underline"
                onClick={this.handleReset}
              >
                Reset app data & restart
              </button>

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

    // Reaching a healthy render means we recovered — clear the loop counter so
    // a later, unrelated error starts counting fresh.
    try {
      if (sessionStorage.getItem('eb_crashCount')) {
        sessionStorage.removeItem('eb_crashCount');
        sessionStorage.removeItem('eb_lastCrashAt');
      }
    } catch {
      /* ignore */
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
