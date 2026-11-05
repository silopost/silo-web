import { createFileRoute } from "@tanstack/react-router";
import { AccountsPanel } from "../features/settings/AccountsPanel";

export const Route = createFileRoute("/_app/u/$account/settings/accounts")({
  component: AccountsPanel,
});
