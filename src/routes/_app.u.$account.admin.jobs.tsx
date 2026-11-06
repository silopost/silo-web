import { createFileRoute } from "@tanstack/react-router";
import { JobsPanel, type JobsSearch } from "../features/admin/JobsPanel";

/** ?status=pending (dead when absent) and ?accountId= filter the job list. */
export const Route = createFileRoute("/_app/u/$account/admin/jobs")({
  validateSearch: (s: Record<string, unknown>): JobsSearch => ({
    ...(s.status === "pending" || s.status === "dead" ? { status: s.status } : {}),
    ...(typeof s.accountId === "string" && s.accountId ? { accountId: s.accountId } : {}),
  }),
  component: JobsRoute,
});

function JobsRoute() {
  return <JobsPanel search={Route.useSearch()} />;
}
