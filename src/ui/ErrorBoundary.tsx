import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../i18n/react';

function Fallback({ onReload }: { onReload(): void }) {
  const t = useT();
  return (
    <div className="notice notice--error boundary" role="alert">
      <span>{t('error.boundary')}</span>
      <button type="button" className="btn btn--small" onClick={onReload}>
        {t('common.reload')}
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** What "Reload" does; by default the boundary just tries to render its children again. */
  onReload?(): void;
}

/** Catches render errors so one bad view shows a translated message instead of a blank page. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload();
    else this.setState({ failed: false });
  };

  render() {
    return this.state.failed ? <Fallback onReload={this.reload} /> : this.props.children;
  }
}
