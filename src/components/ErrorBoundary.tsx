import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = 'Er is een onverwachte fout opgetreden bij het laden van Aan Tafel!.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.includes('Missing or insufficient permissions')) {
          friendly =
            'Je hebt onvoldoende rechten voor deze actie. Log opnieuw in met je Google-account om door te gaan.';
        } else if (parsed.error.includes('Quota exceeded')) {
          friendly =
            'Het dagelijkse database-quotum is tijdelijk bereikt. Probeer het morgen opnieuw.';
        } else {
          friendly = parsed.error;
        }
      }
    } catch {
      if (error.message) {
        friendly = error.message;
      }
    }
    return { hasError: true, message: friendly };
  }

  componentDidCatch(error: Error) {
    console.error('Aan Tafel! ErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-zinc-200 rounded-xl p-8 text-center">
            <p className="text-xs font-medium text-[#1C3454] tracking-wide mb-2">Aan Tafel!</p>
            <h1 className="font-editorial text-2xl font-semibold text-zinc-900 mb-3">
              Er ging iets mis
            </h1>
            <p className="text-sm text-zinc-600 leading-relaxed mb-6">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#14532D] hover:bg-[#166534] rounded-lg transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Pagina opnieuw laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
