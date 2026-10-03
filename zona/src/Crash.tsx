import { Component, Suspense, type ReactNode } from 'react';
import { logError } from './errlog.ts';
import { named } from './lazy.ts';

const ReportModal = named(() => import('./Report.tsx'), 'ReportModal');

/** Ловит падение экрана: вместо белого листа — «перезагрузить» и «сообщить». */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: string | null; report: boolean }> {
  state = { failed: null as string | null, report: false };
  static getDerivedStateFromError(e: unknown) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown, info: { componentStack?: string | null }) {
    logError(`экран упал: ${e instanceof Error ? e.message : String(e)}`, (e instanceof Error ? (e.stack ?? '') : '') + '\n' + (info.componentStack ?? ''));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-ico">🧱</div>
        <h2>Что-то сломалось</h2>
        <p className="muted small">Ошибку уже передали. Перезагрузи игру — прогресс хранится на сервере.</p>
        <button className="btn btn-wide" onClick={() => location.reload()}>
          🔄 Перезагрузить
        </button>
        <button className="btn btn-wide btn-dark" onClick={() => this.setState({ report: true })}>
          🆘 Рассказать, что делал
        </button>
        {this.state.report && (
          <Suspense fallback={null}>
            <ReportModal where="crash" preset={`Игра упала: ${this.state.failed}\nДелал: `} onClose={() => this.setState({ report: false })} />
          </Suspense>
        )}
      </div>
    );
  }
}
