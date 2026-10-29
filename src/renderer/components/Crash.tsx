// Если в интерфейсе случилась ошибка — вместо белого экрана понятное окно; проект при этом не теряется.
import { Bug } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { api } from '../store';
import { BugDialog } from './BugDialog';

interface State { error: Error | null; report: boolean }

export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, report: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, report: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try { api.logError(`${error.stack ?? error.message}\n${info.componentStack ?? ''}`); } catch { /* журнал недоступен */ }
  }

  render(): ReactNode {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="crash" role="alert" data-testid="crash">
        <div className="crash-card">
          <h2>Что-то пошло не так</h2>
          <p>Kadro поймал ошибку в окне. Проект не потерян — черновик сохраняется автоматически.</p>
          <div className="row-btns">
            <button className="btn primary" onClick={() => this.setState({ error: null })}>Вернуться к работе</button>
            <button className="btn" onClick={() => location.reload()}>Перезапустить окно</button>
          </div>
          <details>
            <summary>Подробности для разработчика</summary>
            <pre>{e.message}</pre>
          </details>
          <div className="crash-report">
            <p className="hint small">Повторяется? Сообщи — получится готовый отчёт для GitHub с версией и журналом.</p>
            <button className="btn small" onClick={() => this.setState({ report: true })} data-testid="crash-report"><Bug size={13} />Сообщить об ошибке</button>
          </div>
        </div>
        {this.state.report && <BugDialog initial={`Окно упало: ${e.message.split('\n')[0].slice(0, 160)}`} onClose={() => this.setState({ report: false })} />}
      </div>
    );
  }
}
