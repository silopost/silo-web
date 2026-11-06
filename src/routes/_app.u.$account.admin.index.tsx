import { createFileRoute, redirect } from "@tanstack/react-router";

/** /u/<n>/admin opens Użytkownicy. */
export const Route = createFileRoute("/_app/u/$account/admin/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/u/$account/admin/users", params, replace: true });
  },
});
