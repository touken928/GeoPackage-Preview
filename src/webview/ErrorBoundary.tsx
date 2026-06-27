import React from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', color: '#111' }}>
          <h2 style={{ marginTop: 0 }}>React render failed</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{`${this.state.error.name}: ${this.state.error.message}`}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
