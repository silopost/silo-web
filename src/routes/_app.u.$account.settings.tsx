import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "../features/settings/SettingsLayout";

export const Route = createFileRoute("/_app/u/$account/settings")({
  component: SettingsLayout,
});
