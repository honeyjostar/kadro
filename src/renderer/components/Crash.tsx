// Если в интерфейсе случилась ошибка — вместо белого экрана понятное окно; проект при этом не теряется.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { api } from '../store';

interface State { error: Error | null }

export class CrashGuard extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
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
          <p className="hint small">Если повторяется — опиши, что делал, на github.com/honeyjostar/kadro/issues и приложи файл %USERPROFILE%\.kadro\kadro.log</p>
        </div>
      </div>
    );
  }
}
