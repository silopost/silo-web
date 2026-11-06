import { createFileRoute } from "@tanstack/react-router";
import { SecurityPanel } from "../features/settings/SecurityPanel";

export const Route = createFileRoute("/_app/u/$account/settings/security")({
  component: SecurityPanel,
});
