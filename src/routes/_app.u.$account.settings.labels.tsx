import { createFileRoute } from "@tanstack/react-router";
import { LabelsPanel } from "../features/settings/LabelsPanel";

export const Route = createFileRoute("/_app/u/$account/settings/labels")({
  component: LabelsPanel,
});
