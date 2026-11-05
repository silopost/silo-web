import { createFileRoute, redirect } from "@tanstack/react-router";

/** /u/<n>/settings opens the first tab. */
export const Route = createFileRoute("/_app/u/$account/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/u/$account/settings/general", params, replace: true });
  },
});
