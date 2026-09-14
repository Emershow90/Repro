/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border border-rose-500/30 bg-rose-950/20 rounded-2xl text-white font-mono space-y-4 my-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/40">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-rose-300">
                {this.props.fallbackTitle || 'Ocorreu um erro no módulo'}
              </h3>
              <p className="text-xs text-slate-400">
                {this.state.error?.message || 'Erro inesperado na renderização do componente.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-black font-bold text-xs uppercase rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Tentar Novamente</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
