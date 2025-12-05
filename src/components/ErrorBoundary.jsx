import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-slate-900 text-white min-h-screen">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong.</h1>
          <div className="bg-slate-800 p-4 rounded-md overflow-auto font-mono text-sm border border-red-500/30">
            <p className="text-red-300 font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
            <pre className="text-slate-400">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
          </div>
          <button 
            className="mt-6 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
