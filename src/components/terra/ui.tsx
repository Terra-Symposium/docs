import { Component } from 'react';
import type { ErrorInfo, JSX, ReactNode } from 'react';
export { Empty } from '@terra-symposium/styling/ui';

export class ErrorBoundary extends Component<
  {
    children?: ReactNode;
    name?: string;
    fallback?: (error: Error) => ReactNode;
    resetKey?: unknown;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.error
      ? (this.props.fallback?.(this.state.error) ?? (
          <div role="alert">{this.state.error.message}</div>
        ))
      : this.props.children;
  }
}
export const IMG_RESPONSIVE = 'max-w-full object-contain';
export default function User({
  user,
}: {
  user?: { name?: string; email?: string } | null;
}): JSX.Element {
  return <span className="text-sm text-primary-11">{user?.name ?? user?.email ?? ''}</span>;
}
