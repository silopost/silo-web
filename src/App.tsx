import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useLocale } from "./lib/i18n";
import type { createApp } from "./router";

/**
 * Providers of the app: TanStack Query around TanStack Router (plan 6.1). A language change
 * remounts the router under its key, so every route renders again in the new language
 * without a page reload; the query cache and the zustand stores stay.
 */
export function App({ queryClient, router }: ReturnType<typeof createApp>) {
  const locale = useLocale();
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider key={locale} router={router} />
    </QueryClientProvider>
  );
}
