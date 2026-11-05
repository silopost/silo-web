import { createFileRoute } from "@tanstack/react-router";
import { FiltersPanel } from "../features/settings/FiltersPanel";

type SearchParams = { criteria?: string };

/** ?criteria= (from "Utwórz filtr" of the search) opens the editor with that text. */
export const Route = createFileRoute("/_app/u/$account/settings/filters")({
  validateSearch: (search: Record<string, unknown>): SearchParams =>
    typeof search.criteria === "string" ? { criteria: search.criteria } : {},
  component: FiltersRoute,
});

function FiltersRoute() {
  const { criteria } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <FiltersPanel
      initialCriteria={criteria}
      onInitialHandled={() => void navigate({ search: {}, replace: true })}
    />
  );
}
