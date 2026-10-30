import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { OrgProvider, useMe } from "./lib/session";
import { ToastHost } from "./components/ui/Toast";
import { DialogHost } from "./components/ui/Dialog";
import { Shell } from "./components/app/Shell";
import { CreateOrganisation, Login, Signup } from "./pages/auth/Auth";
import { InvitePage } from "./pages/auth/Invite";
import { InboxPage } from "./pages/inbox/Inbox";
import { ProjectsPage } from "./pages/projects/Projects";
import { ProjectLayout } from "./pages/projects/ProjectLayout";
import { ProjectOverview } from "./pages/projects/Overview";
import { ProjectReports } from "./pages/projects/Reports";
import { ProjectIntegrations } from "./pages/projects/Integrations";
import { ProjectKeys } from "./pages/projects/Keys";
import { WidgetStudio } from "./pages/projects/WidgetStudio";
import { WidgetHome } from "./pages/projects/WidgetHome";
import { ProjectSettings } from "./pages/projects/ProjectSettings";
import { UsageSettings } from "./pages/Usage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { OrganisationSettings } from "./pages/settings/Organisation";
import { MembersSettings } from "./pages/settings/Members";
import { ConnectionsSettings } from "./pages/settings/Connections";
import { AccountSettings } from "./pages/settings/Account";
import { AppearanceSettings } from "./pages/settings/AppearanceSettings";
import { DashboardSettings } from "./pages/settings/DashboardSettings";
import { DeliverySettings } from "./pages/settings/DeliverySettings";
import { IntegrationsDirectory, IntegrationsLayout, IntegrationsLog, IntegrationsOverview } from "./pages/integrations/Integrations";
import { IntegrationProvider } from "./pages/integrations/Provider";
import { TrelloReturn } from "./pages/TrelloReturn";
import { NotFound } from "./pages/NotFound";
import { Skeleton } from "./components/ui/feedback";

const Docs = lazy(() => import("./pages/Docs"));
/** Charts and the world map are heavy, so the dashboard loads on demand. */
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Landing = lazy(() => import("./pages/site/Landing"));
const About = lazy(() => import("./pages/site/pages/About"));
const Blog = lazy(() => import("./pages/site/pages/Blog"));
const Careers = lazy(() => import("./pages/site/pages/Careers"));
const Legal = lazy(() => import("./pages/site/pages/Legal"));
const Platform = lazy(() => import("./pages/site/pages/Platform"));

/** Public pages load on demand; the dashboard never pays for them. */
const page = (Page: ComponentType) => (
  <Suspense fallback={null}>
    <Page />
  </Suspense>
);

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          index
          element={
            <Suspense fallback={null}>
              <Landing />
            </Suspense>
          }
        />
        <Route path="/about" element={page(About)} />
        <Route path="/blog/:slug?" element={page(Blog)} />
        <Route path="/careers" element={page(Careers)} />
        <Route path="/platform" element={page(Platform)} />
        <Route path="/legal" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/legal/:doc" element={page(Legal)} />
        <Route path="/terms" element={<Navigate to="/legal/terms" replace />} />
        <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
        <Route path="/cookies" element={<Navigate to="/legal/cookies" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="/docs"
          element={
            <Suspense fallback={null}>
              <Docs />
            </Suspense>
          }
        />
        <Route element={<Authenticated />}>
          <Route path="/oauth/trello" element={<TrelloReturn />} />
          <Route element={<Shell />}>
            <Route path="/dashboard" element={page(Dashboard)} />
            <Route path="/inbox/:reportId?" element={<InboxPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectLayout />}>
              <Route index element={<ProjectOverview />} />
              <Route path="reports/:reportId?" element={<ProjectReports />} />
              <Route path="integrations" element={<ProjectIntegrations />} />
              <Route path="keys" element={<ProjectKeys />} />
              <Route path="widget" element={<WidgetStudio />} />
              <Route path="settings" element={<ProjectSettings />} />
            </Route>
            <Route path="/integrations" element={<IntegrationsLayout />}>
              <Route index element={<IntegrationsOverview />} />
              <Route path="directory" element={<IntegrationsDirectory />} />
              <Route path="log" element={<IntegrationsLog />} />
              <Route path=":provider" element={<IntegrationProvider />} />
            </Route>
            <Route path="/widget" element={<WidgetHome />} />
            <Route path="/usage" element={<Navigate to="/settings/usage" replace />} />
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="organisation" replace />} />
              <Route path="organisation" element={<OrganisationSettings />} />
              <Route path="members" element={<MembersSettings />} />
              <Route path="connections" element={<ConnectionsSettings />} />
              <Route path="usage" element={<UsageSettings />} />
              <Route path="delivery" element={<DeliverySettings />} />
              <Route path="account" element={<AccountSettings />} />
              <Route path="appearance" element={<AppearanceSettings />} />
              <Route path="dashboard" element={<DashboardSettings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
      <ToastHost />
      <DialogHost />
    </BrowserRouter>
  );
}

/** Loads the signed-in person; sends everyone else to sign in, keeping where they were going. */
function Authenticated() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const onSignedOut = () => {
      qc.clear();
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
    };
    window.addEventListener("issueit:signed-out", onSignedOut);
    return () => window.removeEventListener("issueit:signed-out", onSignedOut);
  }, [navigate, location, qc]);

  if (me.isPending) {
    return (
      <div className="flex h-full">
        <div className="hidden md:flex flex-col gap-3 p-4 border-r border-border-subtle" style={{ width: "var(--sidebar-w)" }}>
          <Skeleton h={22} w={120} />
          <Skeleton h={14} w={140} />
          <Skeleton h={14} w={110} />
          <Skeleton h={14} w={130} />
        </div>
      </div>
    );
  }
  if (me.isError || !me.data) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!me.data.organisations.length) return <CreateOrganisation />;
  return (
    <OrgProvider me={me.data}>
      <Outlet />
    </OrgProvider>
  );
}
