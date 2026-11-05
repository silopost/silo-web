import * as Tooltip from "@radix-ui/react-tooltip";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RouterContext } from "../router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

function Root() {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Outlet />
    </Tooltip.Provider>
  );
}
