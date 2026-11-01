import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { OrgProvider, useMe } from "./lib/session";
import { ToastHost } from "./components/ui/Toast";
import { DialogHost } from "./components/ui/Dialog";
import { TipHost } from "./components/ui/Tooltip";
import { Shell } from "./components/app/Shell";
import { CreateOrganisation, Forgot, Login, Reset, Signup, VerifyEmail } from "./pages/auth/Auth";
import { InvitePage } from "./pages/auth/Invite";
import { DevicePage } from "./pages/auth/Device";
import { InboxPage } from "./pages/inbox/Inbox";
import { ProjectsPage } from "./pages/projects/Projects";
import { ProjectLayout } from "./pages/projects/ProjectLayout";
import { ProjectOverview } from "./pages/projects/Overview";
import { ProjectReports } from "./pages/projects/Reports";
import { ProjectIntegrations } from "./pages/projects/Integrations";
import { ProjectKeys } from "./pages/projects/Keys";
import { ProjectRules } from "./pages/projects/Rules";
import { ProjectReleases } from "./pages/projects/Releases";
import { WidgetStudio } from "./pages/projects/WidgetStudio";
import { WidgetHome } from "./pages/projects/WidgetHome";
import { ProjectSettings } from "./pages/projects/ProjectSettings";
import { UsageSettings } from "./pages/Usage";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { OrganisationSettings } from "./pages/settings/Organisation";
import { MembersSettings } from "./pages/settings/Members";
import { ConnectionsSettings } from "./pages/settings/Connections";
import { AccountSettings } from "./pages/settings/Account";
import { NotificationSettings } from "./pages/settings/Notifications";
import { AppearanceSettings } from "./pages/settings/AppearanceSettings";
import { GeneralSettings } from "./pages/settings/General";
import { KeyboardSettings } from "./pages/settings/Keyboard";
import { AboutSettings } from "./pages/settings/About";
import { DashboardSettings } from "./pages/settings/DashboardSettings";
import { DeliverySettings } from "./pages/settings/DeliverySettings";
import { TokensSettings } from "./pages/settings/Tokens";
import { AuditSettings } from "./pages/settings/Audit";
import { IntegrationsDirectory, IntegrationsLayout, IntegrationsLog, IntegrationsOverview } from "./pages/integrations/Integrations";
import { IntegrationProvider } from "./pages/integrations/Provider";
import { TrelloReturn } from "./pages/TrelloReturn";
import { NotFound } from "./pages/NotFound";
import { usePreferences } from "./lib/preferences";
import { onDocsHost } from "./lib/hosts";
import { hostedRedirects, hostedRoutes, hostedSettings } from "./hosted";
import { Skeleton } from "./components/ui/feedback";

const Docs = lazy(() => import("./pages/docs/Docs"));
/** Charts and the world map are heavy, so the dashboard loads on demand. */
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const Landing = lazy(() => import("./pages/site/Landing"));
const Llm = lazy(() => import("./pages/site/pages/Llm"));
const Mcp = lazy(() => import("./pages/site/pages/Mcp"));
const Platform = lazy(() => import("./pages/site/pages/Platform"));
// The marketing pages as they were before the 2026-10-31 redesign, kept for comparison.
const ClassicLanding = lazy(() => import("./pages/site/legacy/Landing"));
const ClassicLlm = lazy(() => import("./pages/site/legacy/Llm"));
const Support = lazy(() => import("./pages/support/Support"));
const SupportArticle = lazy(() => import("./pages/support/Article"));

/** Public pages load on demand; the dashboard never pays for them. */
const page = (Page: ComponentType) => (
  <Suspense fallback={null}>
    <Page />
  </Suspense>
);

export function App() {
  // On the documentation subdomain these routes would compete with the
  // documentation's own, so that host gets a router of its own instead.
  if (onDocsHost) return <DocsSite />;
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
        <Route path="/llm" element={page(Llm)} />
        <Route path="/mcp" element={page(Mcp)} />
        <Route path="/platform" element={page(Platform)} />
        <Route path="/classic" element={page(ClassicLanding)} />
        <Route path="/classic/llm" element={page(ClassicLlm)} />
        {/* The pages the hosted service adds: pricing, the company, the legal documents. */}
        {hostedRoutes.map(({ path, Page }) => (
          <Route key={path} path={path} element={page(Page)} />
        ))}
        {hostedRedirects.map(({ from, to }) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/verify" element={<VerifyEmail />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/device" element={<DevicePage />} />
        <Route path="/docs/*" element={page(Docs)} />
        <Route path="/support" element={<Navigate to="/articles/en" replace />} />
        <Route path="/articles" element={<Navigate to="/articles/en" replace />} />
        <Route path="/articles/:locale" element={page(Support)} />
        <Route path="/articles/:locale/:slug" element={page(SupportArticle)} />
        <Route element={<Authenticated />}>
          <Route path="/oauth/trello" element={<TrelloReturn />} />
          <Route element={<Shell />}>
            <Route path="/start" element={<StartPage />} />
            <Route path="/dashboard" element={page(Dashboard)} />
            <Route path="/inbox/:reportId?" element={<InboxPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:projectId" element={<ProjectLayout />}>
              <Route index element={<ProjectOverview />} />
              <Route path="reports/:reportId?" element={<ProjectReports />} />
              <Route path="integrations" element={<ProjectIntegrations />} />
              <Route path="keys" element={<ProjectKeys />} />
              <Route path="rules" element={<ProjectRules />} />
              <Route path="releases" element={<ProjectReleases />} />
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
              <Route index element={<Navigate to="general" replace />} />
              <Route path="general" element={<GeneralSettings />} />
              <Route path="keyboard" element={<KeyboardSettings />} />
              <Route path="about" element={<AboutSettings />} />
              <Route path="organisation" element={<OrganisationSettings />} />
              <Route path="members" element={<MembersSettings />} />
              <Route path="connections" element={<ConnectionsSettings />} />
              <Route path="usage" element={<UsageSettings />} />
              {hostedSettings.map(({ path, Page }) => (
                <Route key={path} path={path} element={page(Page)} />
              ))}
              <Route path="notifications" element={<NotificationSettings />} />
              <Route path="delivery" element={<DeliverySettings />} />
              <Route path="tokens" element={<TokensSettings />} />
              <Route path="audit" element={<AuditSettings />} />
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
      <TipHost />
    </BrowserRouter>
  );
}

/**
 * The documentation subdomain. Every address is a documentation page, with
 * `/docs/...` kept working for anyone who pasted an address from the app's
 * own host. The toast host comes along because the copy buttons use it.
 */
function DocsSite() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/docs/*" element={<StripDocsPrefix />} />
        <Route path="/*" element={page(Docs)} />
      </Routes>
      <ToastHost />
      <TipHost />
    </BrowserRouter>
  );
}

/** docs.example.com/docs/collect/widget is the same page as /collect/widget. */
function StripDocsPrefix() {
  const { pathname, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/docs/, "") || "/"}${hash}`} replace />;
}

/** Where signing in lands, which is whichever page the settings name. */
function StartPage() {
  const { ready, app } = usePreferences();
  if (!ready) return null;
  return <Navigate to={`/${app.startPage}`} replace />;
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
