import React, { type ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Log client errors to backend (optional but nice for debugging)
    fetch('/api/logClientError', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: error.message, 
        stack: error.stack,
        timestamp: new Date().toISOString()
      }), 
    }).catch(() => {
      // Silently fail if logging doesn't work
    });
    
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Board crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          textAlign: 'center', 
          color: '#E01313',
          border: '2px solid #E01313',
          borderRadius: '8px',
          margin: '20px'
        }}>
          ⚠️ Board crashed - refresh to restart
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 