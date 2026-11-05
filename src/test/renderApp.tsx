import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App } from "../App";
import { createApp } from "../router";
import { useConnection } from "../state/connection";
import { useToasts } from "../state/toasts";
import { useUi } from "../state/ui";

/** Renders the whole app (router, query client, guards) at a URL. */
export function renderApp(url: string) {
  useUi.setState({
    selection: new Set(),
    focusedThreadId: null,
    composeOpen: false,
    shortcutsHelpOpen: false,
    pendingPrefix: null,
  });
  useToasts.setState({ current: null, lastUndo: null });
  useConnection.setState({ state: "connecting" });
  const app = createApp(createMemoryHistory({ initialEntries: [url] }));
  const result = render(<App {...app} />);
  return { ...result, ...app };
}
