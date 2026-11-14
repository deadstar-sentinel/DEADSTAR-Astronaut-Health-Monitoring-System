import { Component, type ReactNode } from "react";

/** Keeps a SENTINEL panel failure contained: the hologram and the rest of the app keep running. */
export class SafeBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error(`[SENTINEL] ${this.props.label} failed`, err);
  }
  render() {
    if (this.state.failed) {
      return <div className="px-3 py-1 text-[10px] font-mono text-slate-500">{this.props.label} unavailable</div>;
    }
    return this.props.children;
  }
}
