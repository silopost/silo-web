import { createFileRoute } from "@tanstack/react-router";
import { UsersPanel } from "../features/admin/UsersPanel";

export const Route = createFileRoute("/_app/u/$account/admin/users")({
  component: UsersPanel,
});
