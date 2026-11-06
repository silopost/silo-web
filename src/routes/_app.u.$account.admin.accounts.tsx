import { createFileRoute } from "@tanstack/react-router";
import { AdminAccountsPanel } from "../features/admin/AdminAccountsPanel";

export const Route = createFileRoute("/_app/u/$account/admin/accounts")({
  component: AdminAccountsPanel,
});
