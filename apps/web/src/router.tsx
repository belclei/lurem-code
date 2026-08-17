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
import { LoginPage } from "./routes/LoginPage";
import { RecurringPage } from "./routes/RecurringPage";
import { RegisterPage } from "./routes/RegisterPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { SettingsPage } from "./routes/SettingsPage";
import { TimelinePage } from "./routes/TimelinePage";
import { TransactionsPage } from "./routes/TransactionsPage";
import { UpdatesPage } from "./routes/UpdatesPage";
import { WaitlistPage } from "./routes/WaitlistPage";
import { FlagsPage } from "./routes/admin/FlagsPage";

const rootRoute = createRootRoute({
  component: Outlet,
});

// The real home is the Timeline (§6.12) — it's both the activation surface
// when empty (§6.11, arriving Sprint 7) and the history when full; the
// dashboard is the separate "Análise" screen reached from the Timeline's
// side panel (§6.9). Built in Sprint 10 — "/" now lands here instead of
// /dashboard. The target itself redirects to /login when there's no session.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/timeline" });
  },
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

// Not part of the sidebar's nav (superseded by Timeline, per US-6.1) — kept
// reachable by direct URL but outside AppLayout, standalone like login/register.
const transactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/transactions",
  component: TransactionsPage,
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

const waitlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/waitlist",
  component: WaitlistPage,
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
  transactionsRoute,
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
