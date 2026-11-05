import { useEffect, useState } from "react";
import { api } from "./api/client";
import type { components } from "./api/schema";

type Meta = components["schemas"]["Meta"];
type MetaState = { status: "loading" } | { status: "error" } | { status: "ready"; meta: Meta };

export default function App() {
  const [state, setState] = useState<MetaState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/meta", { signal: controller.signal })
      .then(({ data }) => setState(data ? { status: "ready", meta: data } : { status: "error" }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-white text-neutral-900">
      <h1 className="text-4xl font-semibold tracking-tight">Silo</h1>
      <p className="text-sm text-neutral-500" role="status">
        {state.status === "loading" && "Connecting to server..."}
        {state.status === "error" && "Cannot reach the server."}
        {state.status === "ready" && `Server version ${state.meta.serverVersion}`}
      </p>
    </main>
  );
}
