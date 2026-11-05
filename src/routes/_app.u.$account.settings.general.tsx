import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettings } from "../features/settings/GeneralSettings";

export const Route = createFileRoute("/_app/u/$account/settings/general")({
  component: GeneralSettings,
});
