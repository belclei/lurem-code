// apps/web/src/router.tsx
//
// Code-based route tree (not the file-based router plugin) — this is the
// seed of the app shell, just two routes, so the extra route-tree-generator
// build step isn't worth it yet. Revisit once there are enough routes that
// hand-maintaining this file gets annoying.
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { AppLayout } from "./components/AppLayout";
import { AccountsPage } from "./routes/AccountsPage";
import { AdminPage } from "./routes/AdminPage";
import { ConnectionsPage } from "./routes/ConnectionsPage";
import { DashboardPage } from "./routes/DashboardPage";
import { ForgotPasswordPage } from "./routes/ForgotPasswordPage";
import { ImportPage } from "./routes/ImportPage";
import { ImportReviewPage } from "./routes/ImportReviewPage";
import { IndexPage } from "./routes/LandingPage";
import { LoginPage } from "./routes/LoginPage";
import { RecurringPage } from "./routes/RecurringPage";
import { RegisterPage } from "./routes/RegisterPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { SettingsPage } from "./routes/SettingsPage";
import { TimelinePage } from "./routes/TimelinePage";
import { UpdatesPage } from "./routes/UpdatesPage";
import { FlagsPage } from "./routes/admin/FlagsPage";

const rootRoute = createRootRoute({
  component: Outlet,
});

// "/" is the public landing page for logged-out visitors (the closed-access
// waitlist pitch); IndexPage redirects a logged-in visitor straight to
// /timeline, the real app home (§6.12), so nobody signed in ever sees the
// sales page by accident.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

// Wraps the sidebar shell (design_handoff_lurem README "Shell do app")
// around every route that needs it. Login/register/waitlist stay outside —
// full-screen, no nav — per the same doc's screen list.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-layout",
  component: AppLayout,
});

const timelineRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/timeline",
  component: TimelinePage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const accountsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/accounts",
  component: AccountsPage,
});

const recurringRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/recurring",
  component: RecurringPage,
  // `?edit=<id>` — TimelineFeed's "recurringPreview" card (a not-yet-due
  // occurrence with no real Transaction row to click into) deep-links here
  // to open that series' edit form already focused, instead of just the
  // bare list (see RecurringPage.tsx).
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsPage,
});

const connectionsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/connections",
  component: ConnectionsPage,
});

const adminRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin",
  component: AdminPage,
});

const flagsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/admin/flags",
  component: FlagsPage,
});

const updatesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/updates",
  component: UpdatesPage,
});

const importRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/imports",
  component: ImportPage,
});

const importReviewRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/imports/$id",
  component: ImportReviewPage,
});

// The waitlist form now lives inline on the landing at "/" (surface brief:
// .impeccable/surfaces/landing.md) — redirect instead of maintaining the
// form/honeypot/validation logic in two places.
const waitlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/waitlist",
  beforeLoad: () => {
    throw redirect({ to: "/", hash: "fila" });
  },
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPasswordPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  waitlistRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  appLayoutRoute.addChildren([
    timelineRoute,
    dashboardRoute,
    accountsRoute,
    recurringRoute,
    settingsRoute,
    connectionsRoute,
    adminRoute,
    flagsRoute,
    updatesRoute,
    importRoute,
    importReviewRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
