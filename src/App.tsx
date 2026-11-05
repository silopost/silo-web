import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { createApp } from "./router";

/** Providers of the app: TanStack Query around TanStack Router (plan 6.1). */
export function App({ queryClient, router }: ReturnType<typeof createApp>) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
