import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("React error boundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#c0392b" }}>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "8px 20px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
