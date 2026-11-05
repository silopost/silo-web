import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/u/$account/$label", params: { account: "0", label: "inbox" } });
  },
});
