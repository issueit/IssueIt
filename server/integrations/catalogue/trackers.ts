import { htmlBody, markdownBody, plainBody, plainMarkdownBody, titleFor } from "../format";
import { bearer, graphqlErrors, IntegrationError } from "../http";
import type { Provider } from "../types";
import { baseUrl, basic, call, define, optional, secret, seg, text, type Spec } from "./define";

/** Issue trackers and project tools: each new report becomes an issue, task or card. */

const repo = text("repo", "Repository", "As owner/name.", "acme/web");
const bug = (s: { id: string; name: string; summary?: string }) => s.summary ?? `Opens an issue in ${s.name} for each new report.`;

/* ------------------------------------------------------------------ Gitea family */

function giteaLike(id: string, name: string, opts: { fixedBase?: string; keywords?: string[]; tokenUrl?: string } = {}): Provider {
  const base = (creds: Record<string, string>) => opts.fixedBase ?? baseUrl(creds.url);
  const headers = (token: string) => ({ authorization: `token ${token}` });
  return define({
    id,
    name,
    category: "tracker",
    keywords: opts.keywords,
    summary: bug({ id, name }),
    fields: [...(opts.fixedBase ? [] : [text("url", "Server URL", undefined, "https://git.example.com")]), secret("token", "Access token", "Needs permission to write issues.")],
    help: opts.tokenUrl ? { text: `Create a token on ${name}`, url: opts.tokenUrl } : undefined,
    target: { label: "Repository", fields: [repo] },
    async check(creds) {
      const { data } = await call(name, `${base(creds)}/api/v1/user`, { headers: headers(creds.token) });
      return { label: data.login ?? data.username, avatarUrl: data.avatar_url };
    },
    async send({ report, creds, target, isTest }) {
      const root = base(creds);
      const [owner, repoName] = target.repo.split("/");
      const { data, status } = await call(name, `${root}/api/v1/repos/${seg(owner)}/${seg(repoName ?? "")}/issues`, {
        method: "POST",
        headers: headers(creds.token),
        json: { title: titleFor(report, isTest), body: markdownBody(report) },
        thing: "repository",
      });
      return { externalId: `#${data.number}`, externalUrl: data.html_url ?? `${root}/${target.repo}/issues/${data.number}`, responseStatus: status };
    },
  });
}

/* ------------------------------------------------------------------ specs */

const specs: Spec[] = [
  {
    id: "asana",
    name: "Asana",
    category: "tracker",
    summary: "Creates a task in an Asana project for each new report.",
    fields: [secret("token", "Personal access token")],
    help: { text: "Create a token in the Asana developer console", url: "https://app.asana.com/0/my-apps" },
    target: { label: "Project", fields: [text("project", "Project ID", "The number in the project's URL, after /project/.", "1204567890123456")] },
    async check(creds) {
      const { data } = await call("Asana", "https://app.asana.com/api/1.0/users/me", { headers: bearer(creds.token) });
      return { label: data.data.name, extra: { email: data.data.email ?? "" } };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Asana", "https://app.asana.com/api/1.0/tasks", {
        method: "POST",
        headers: bearer(creds.token),
        json: { data: { name: titleFor(report, isTest), notes: plainBody(report, 60_000), projects: [target.project] } },
        thing: "project",
      });
      return { externalId: data.data.gid, externalUrl: data.data.permalink_url, responseStatus: status };
    },
  },
  {
    id: "monday",
    name: "monday.com",
    category: "tracker",
    keywords: ["monday"],
    summary: "Adds an item to a monday.com board, with the report as its first update.",
    fields: [secret("token", "API token", "In monday.com, open your avatar, then Developers, then My access tokens.")],
    help: { text: "Where to find your API token", url: "https://developer.monday.com/api-reference/docs/authentication" },
    target: { label: "Board", fields: [text("board", "Board ID", "The number in the board's URL.", "1234567890")] },
    async check(creds) {
      const data = await monday(creds.token, "query { me { name account { name } } }", {});
      return { label: `${data.me.name} · ${data.me.account.name}` };
    },
    async send({ report, creds, target, isTest }) {
      const created = await monday(creds.token, "mutation ($board: ID!, $name: String!) { create_item(board_id: $board, item_name: $name) { id url } }", {
        board: target.board,
        name: titleFor(report, isTest),
      });
      await monday(creds.token, "mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }", { item: created.create_item.id, body: htmlBody(report) });
      return { externalId: created.create_item.id, externalUrl: created.create_item.url };
    },
  },
  {
    id: "shortcut",
    name: "Shortcut",
    category: "tracker",
    keywords: ["clubhouse"],
    summary: "Creates a bug story in Shortcut for each new report.",
    fields: [secret("token", "API token", "In Shortcut, open Settings, then API Tokens.")],
    help: { text: "Create an API token", url: "https://app.shortcut.com/settings/account/api-tokens" },
    target: { label: "Workflow state", fields: [optional(text("state", "Workflow state ID", "Leave empty to use the first state of your default workflow."))] },
    async check(creds) {
      const { data } = await call("Shortcut", "https://api.app.shortcut.com/api/v3/member", { headers: { "shortcut-token": creds.token } });
      return { label: data.profile?.name ?? data.profile?.mention_name ?? "Shortcut member" };
    },
    async send({ report, creds, target, isTest }) {
      const headers = { "shortcut-token": creds.token };
      let state = Number(target.state) || undefined;
      if (!state) {
        const { data } = await call<any[]>("Shortcut", "https://api.app.shortcut.com/api/v3/workflows", { headers });
        state = data[0]?.default_state_id;
      }
      const { data, status } = await call("Shortcut", "https://api.app.shortcut.com/api/v3/stories", {
        method: "POST",
        headers,
        json: { name: titleFor(report, isTest), description: plainMarkdownBody(report), story_type: "bug", workflow_state_id: state, external_links: [report.dashboardUrl] },
      });
      return { externalId: `sc-${data.id}`, externalUrl: data.app_url, responseStatus: status };
    },
  },
  {
    id: "youtrack",
    name: "YouTrack",
    category: "tracker",
    keywords: ["jetbrains"],
    summary: "Creates an issue in a YouTrack project for each new report.",
    fields: [text("url", "YouTrack URL", undefined, "https://acme.youtrack.cloud"), secret("token", "Permanent token", "In YouTrack, open your profile, then Account security, then New token.")],
    target: { label: "Project", fields: [text("project", "Project short name", "The prefix on the project's issue ids.", "WEB")] },
    async check(creds) {
      const { data } = await call("YouTrack", `${baseUrl(creds.url)}/api/users/me?fields=login,name`, { headers: bearer(creds.token) });
      return { label: data.name || data.login };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data: projects } = await call<any[]>("YouTrack", `${root}/api/admin/projects?fields=id,shortName&$top=1000`, { headers: bearer(creds.token) });
      const project = projects.find((p) => p.shortName?.toLowerCase() === target.project.toLowerCase());
      if (!project) throw new IntegrationError(`YouTrack has no project with the short name ${target.project}.`, { retryable: false });
      const { data, status } = await call("YouTrack", `${root}/api/issues?fields=idReadable`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { project: { id: project.id }, summary: titleFor(report, isTest), description: plainMarkdownBody(report) },
      });
      return { externalId: data.idReadable, externalUrl: `${root}/issue/${data.idReadable}`, responseStatus: status };
    },
  },
  {
    id: "azuredevops",
    name: "Azure DevOps",
    category: "tracker",
    keywords: ["azure boards", "vsts", "tfs", "work item"],
    summary: "Creates a bug work item in Azure Boards for each new report.",
    fields: [text("organisation", "Organisation", "The name after dev.azure.com/.", "acme"), secret("token", "Personal access token", "Needs the Work Items (read and write) scope.")],
    help: { text: "Create a personal access token", url: "https://learn.microsoft.com/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate" },
    target: { label: "Project", fields: [text("project", "Project", undefined, "Web"), optional(text("type", "Work item type", "Bug unless your process uses another name.", "Bug"))] },
    async check(creds) {
      const { data } = await call("Azure DevOps", `https://dev.azure.com/${seg(creds.organisation)}/_apis/projects?api-version=7.1&$top=1`, { headers: basic("", creds.token) });
      return { label: `${creds.organisation} · ${data.count ?? 0} projects` };
    },
    async send({ report, creds, target, isTest }) {
      const type = target.type || "Bug";
      const bodyField = type.toLowerCase() === "bug" ? "Microsoft.VSTS.TCM.ReproSteps" : "System.Description";
      const priority = { critical: 1, high: 2, medium: 3, low: 4 }[report.priority];
      const { data, status } = await call("Azure DevOps", `https://dev.azure.com/${seg(creds.organisation)}/${seg(target.project)}/_apis/wit/workitems/$${seg(type)}?api-version=7.1`, {
        method: "POST",
        headers: { ...basic("", creds.token), "content-type": "application/json-patch+json" },
        body: JSON.stringify([
          { op: "add", path: "/fields/System.Title", value: titleFor(report, isTest) },
          { op: "add", path: `/fields/${bodyField}`, value: htmlBody(report) },
          { op: "add", path: "/fields/Microsoft.VSTS.Common.Priority", value: priority },
          { op: "add", path: "/fields/System.Tags", value: "issueit" },
        ]),
        thing: "project",
      });
      return { externalId: `#${data.id}`, externalUrl: data._links?.html?.href, responseStatus: status };
    },
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    category: "tracker",
    summary: "Opens an issue in a Bitbucket Cloud repository for each new report.",
    fields: [text("email", "Atlassian email"), secret("token", "API token", "An Atlassian API token with the Bitbucket issue write scope.")],
    help: { text: "Create an API token", url: "https://id.atlassian.com/manage-profile/security/api-tokens" },
    target: { label: "Repository", fields: [text("repo", "Repository", "As workspace/repository.", "acme/web")] },
    async check(creds) {
      const { data } = await call("Bitbucket", "https://api.bitbucket.org/2.0/user", { headers: basic(creds.email, creds.token) });
      return { label: data.display_name, avatarUrl: data.links?.avatar?.href };
    },
    async send({ report, creds, target, isTest }) {
      const priority = { critical: "critical", high: "major", medium: "minor", low: "trivial" }[report.priority];
      const { data, status } = await call("Bitbucket", `https://api.bitbucket.org/2.0/repositories/${target.repo.split("/").map(seg).join("/")}/issues`, {
        method: "POST",
        headers: basic(creds.email, creds.token),
        json: { title: titleFor(report, isTest), content: { raw: plainMarkdownBody(report) }, kind: "bug", priority },
        thing: "repository",
      });
      return { externalId: `#${data.id}`, externalUrl: data.links?.html?.href, responseStatus: status };
    },
  },
  {
    id: "sourcehut",
    name: "SourceHut",
    category: "tracker",
    keywords: ["sr.ht", "todo.sr.ht"],
    summary: "Submits a ticket to a todo.sr.ht tracker for each new report.",
    fields: [secret("token", "Personal access token", "A token with TODO tickets read and write access.")],
    help: { text: "Create a personal access token", url: "https://meta.sr.ht/oauth2/personal-token" },
    target: { label: "Tracker", fields: [text("tracker", "Tracker name", "Your tracker's name, as in todo.sr.ht/~you/name.", "web")] },
    async check(creds) {
      const data = await srht(creds.token, "query { me { canonicalName } }", {});
      return { label: data.me.canonicalName };
    },
    async send({ report, creds, target, isTest }) {
      const found = await srht(creds.token, "query ($name: String!) { me { canonicalName tracker(name: $name) { id } } }", { name: target.tracker });
      if (!found.me.tracker) throw new IntegrationError(`You have no tracker called ${target.tracker} on todo.sr.ht.`, { retryable: false });
      const data = await srht(creds.token, "mutation ($id: Int!, $input: SubmitTicketInput!) { submitTicket(trackerId: $id, input: $input) { id } }", {
        id: found.me.tracker.id,
        input: { subject: titleFor(report, isTest), body: plainMarkdownBody(report) },
      });
      const id = data.submitTicket.id;
      return { externalId: `#${id}`, externalUrl: `https://todo.sr.ht/${found.me.canonicalName}/${target.tracker}/${id}` };
    },
  },
  {
    id: "githubenterprise",
    name: "GitHub Enterprise Server",
    category: "tracker",
    keywords: ["ghes", "github"],
    summary: "Opens an issue on your own GitHub Enterprise Server for each new report.",
    fields: [text("url", "Server URL", undefined, "https://github.example.com"), secret("token", "Personal access token", "Needs the repo scope, or Issues read and write.")],
    target: { label: "Repository", fields: [repo] },
    async check(creds) {
      const { data } = await call("GitHub Enterprise", `${baseUrl(creds.url)}/api/v3/user`, { headers: bearer(creds.token) });
      return { label: data.login, url: data.html_url, avatarUrl: data.avatar_url };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("GitHub Enterprise", `${baseUrl(creds.url)}/api/v3/repos/${target.repo.split("/").map(seg).join("/")}/issues`, {
        method: "POST",
        headers: { ...bearer(creds.token), accept: "application/vnd.github+json" },
        json: { title: titleFor(report, isTest), body: markdownBody(report) },
        thing: "repository",
      });
      return { externalId: `#${data.number}`, externalUrl: data.html_url, responseStatus: status };
    },
  },
  {
    id: "jiradc",
    name: "Jira Data Center",
    category: "tracker",
    keywords: ["jira server", "self-hosted jira"],
    summary: "Creates an issue on your own Jira Data Center for each new report.",
    fields: [text("url", "Jira URL", undefined, "https://jira.example.com"), secret("token", "Personal access token")],
    target: { label: "Project", fields: [text("project", "Project key", undefined, "WEB"), optional(text("type", "Issue type", "Bug unless your project uses another name.", "Bug"))] },
    async check(creds) {
      const { data } = await call("Jira", `${baseUrl(creds.url)}/rest/api/2/myself`, { headers: bearer(creds.token) });
      return { label: data.displayName ?? data.name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("Jira", `${root}/rest/api/2/issue`, {
        method: "POST",
        headers: bearer(creds.token),
        json: {
          fields: { project: { key: target.project }, summary: titleFor(report, isTest), description: plainBody(report, 30_000), issuetype: { name: target.type || "Bug" }, labels: ["issueit"] },
        },
        thing: "project",
      });
      return { externalId: data.key, externalUrl: `${root}/browse/${data.key}`, responseStatus: status };
    },
  },
  {
    id: "redmine",
    name: "Redmine",
    category: "tracker",
    summary: "Creates an issue in a Redmine project for each new report.",
    fields: [text("url", "Redmine URL", undefined, "https://redmine.example.com"), secret("token", "API key", "In Redmine, open My account, then show the API access key.")],
    target: { label: "Project", fields: [text("project", "Project identifier", undefined, "web"), optional(text("tracker", "Tracker ID", "Leave empty for the project's default tracker."))] },
    async check(creds) {
      const { data } = await call("Redmine", `${baseUrl(creds.url)}/users/current.json`, { headers: { "x-redmine-api-key": creds.token } });
      return { label: data.user.login };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("Redmine", `${root}/issues.json`, {
        method: "POST",
        headers: { "x-redmine-api-key": creds.token },
        json: { issue: { project_id: target.project, subject: titleFor(report, isTest), description: plainMarkdownBody(report), ...(target.tracker ? { tracker_id: Number(target.tracker) } : {}) } },
        thing: "project",
      });
      return { externalId: `#${data.issue.id}`, externalUrl: `${root}/issues/${data.issue.id}`, responseStatus: status };
    },
  },
  {
    id: "plane",
    name: "Plane",
    category: "tracker",
    summary: "Creates a work item in a Plane project for each new report.",
    fields: [
      optional(text("url", "API URL", "Only for self-hosted Plane. Leave empty for Plane Cloud.", "https://api.plane.so")),
      secret("token", "API key", "In Plane, open Workspace settings, then API tokens."),
    ],
    target: { label: "Project", fields: [text("workspace", "Workspace slug", undefined, "acme"), text("project", "Project ID", "The UUID in the project's URL.")] },
    async check(creds) {
      const { data } = await call("Plane", `${baseUrl(creds.url || "https://api.plane.so")}/api/v1/users/me/`, { headers: { "x-api-key": creds.token } });
      return { label: data.display_name ?? data.email };
    },
    async send({ report, creds, target, isTest }) {
      const priority = { critical: "urgent", high: "high", medium: "medium", low: "low" }[report.priority];
      const { data, status } = await call("Plane", `${baseUrl(creds.url || "https://api.plane.so")}/api/v1/workspaces/${seg(target.workspace)}/projects/${seg(target.project)}/work-items/`, {
        method: "POST",
        headers: { "x-api-key": creds.token },
        json: { name: titleFor(report, isTest), description_html: htmlBody(report), priority },
        thing: "project",
      });
      return { externalId: data.sequence_id ? `#${data.sequence_id}` : data.id, responseStatus: status };
    },
  },
  {
    id: "wrike",
    name: "Wrike",
    category: "tracker",
    summary: "Creates a task in a Wrike folder or project for each new report.",
    fields: [
      secret("token", "Permanent access token", "In Wrike, open Apps & Integrations, then API, then create a permanent token."),
      optional(text("host", "API host", "Only if your account lives elsewhere, e.g. app-eu.wrike.com.", "www.wrike.com")),
    ],
    target: { label: "Folder", fields: [text("folder", "Folder or project ID", "The id from the folder's link (the number after ?id=), or its API id.")] },
    async check(creds) {
      const { data } = await call("Wrike", `https://${creds.host || "www.wrike.com"}/api/v4/contacts?me=true`, { headers: bearer(creds.token) });
      const me = data.data?.[0];
      return { label: [me?.firstName, me?.lastName].filter(Boolean).join(" ") || "Wrike" };
    },
    async send({ report, creds, target, isTest }) {
      const api = `https://${creds.host || "www.wrike.com"}/api/v4`;
      let folder = target.folder;
      if (/^\d+$/.test(folder)) {
        const { data } = await call("Wrike", `${api}/ids?ids=[${folder}]&type=ApiV2Folder`, { headers: bearer(creds.token) });
        folder = data.data?.[0]?.id ?? folder;
      }
      const importance = report.priority === "critical" || report.priority === "high" ? "High" : report.priority === "low" ? "Low" : "Normal";
      const { data, status } = await call("Wrike", `${api}/folders/${seg(folder)}/tasks`, {
        method: "POST",
        headers: bearer(creds.token),
        form: { title: titleFor(report, isTest), description: htmlBody(report), importance },
        thing: "folder",
      });
      const task = data.data?.[0];
      return { externalId: task?.id, externalUrl: task?.permalink, responseStatus: status };
    },
  },
  {
    id: "todoist",
    name: "Todoist",
    category: "tracker",
    summary: "Adds a task to a Todoist project for each new report.",
    fields: [secret("token", "API token", "In Todoist, open Settings, then Integrations, then Developer.")],
    target: { label: "Project", fields: [optional(text("project", "Project ID", "Leave empty for your Inbox."))] },
    async check(creds) {
      await call("Todoist", "https://api.todoist.com/api/v1/projects?limit=1", { headers: bearer(creds.token) });
      return { label: "Todoist account" };
    },
    async send({ report, creds, target, isTest }) {
      const priority = { critical: 4, high: 3, medium: 2, low: 1 }[report.priority];
      const { data, status } = await call("Todoist", "https://api.todoist.com/api/v1/tasks", {
        method: "POST",
        headers: bearer(creds.token),
        json: { content: titleFor(report, isTest), description: plainBody(report, 15_000), priority, labels: ["issueit"], ...(target.project ? { project_id: target.project } : {}) },
      });
      return { externalId: data.id, externalUrl: `https://app.todoist.com/app/task/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "teamwork",
    name: "Teamwork.com",
    category: "tracker",
    keywords: ["teamwork projects"],
    summary: "Adds a task to a Teamwork.com task list for each new report.",
    fields: [text("site", "Site address", undefined, "acme.teamwork.com"), secret("token", "API key", "In Teamwork.com, open your profile, then Edit my details, then API & mobile.")],
    target: { label: "Task list", fields: [text("list", "Task list ID", "The number in the task list's URL.")] },
    async send({ report, creds, target, isTest }) {
      const site = baseUrl(creds.site, "site address");
      const priority = report.priority === "critical" || report.priority === "high" ? "high" : report.priority === "low" ? "low" : "medium";
      const { data, status } = await call("Teamwork.com", `${site}/projects/api/v3/tasklists/${seg(target.list)}/tasks.json`, {
        method: "POST",
        headers: basic(creds.token, "x"),
        json: { task: { name: titleFor(report, isTest), description: plainMarkdownBody(report), priority } },
        thing: "task list",
      });
      return { externalId: String(data.task?.id ?? ""), externalUrl: data.task?.id ? `${site}/app/tasks/${data.task.id}` : undefined, responseStatus: status };
    },
  },
  {
    id: "bugzilla",
    name: "Bugzilla",
    category: "tracker",
    summary: "Files a bug in Bugzilla for each new report.",
    fields: [text("url", "Bugzilla URL", undefined, "https://bugzilla.example.com"), secret("token", "API key", "In Bugzilla, open Preferences, then API keys.")],
    target: { label: "Product", fields: [text("product", "Product"), text("component", "Component"), optional(text("version", "Version", "Leave empty for unspecified.", "unspecified"))] },
    async check(creds) {
      const { data } = await call("Bugzilla", `${baseUrl(creds.url)}/rest/whoami`, { headers: { "x-bugzilla-api-key": creds.token } });
      return { label: data.real_name || data.name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("Bugzilla", `${root}/rest/bug`, {
        method: "POST",
        headers: { "x-bugzilla-api-key": creds.token },
        json: {
          product: target.product,
          component: target.component,
          version: target.version || "unspecified",
          summary: titleFor(report, isTest),
          description: plainBody(report, 60_000),
          op_sys: "All",
          rep_platform: "All",
        },
        thing: "product",
      });
      return { externalId: `#${data.id}`, externalUrl: `${root}/show_bug.cgi?id=${data.id}`, responseStatus: status };
    },
  },
  {
    id: "mantisbt",
    name: "MantisBT",
    category: "tracker",
    keywords: ["mantis"],
    summary: "Reports an issue in MantisBT for each new report.",
    fields: [text("url", "MantisBT URL", undefined, "https://bugs.example.com"), secret("token", "API token", "In MantisBT, open My account, then API tokens.")],
    target: { label: "Project", fields: [text("project", "Project name"), optional(text("category", "Category", "Leave empty for General.", "General"))] },
    async check(creds) {
      const { data } = await call("MantisBT", `${baseUrl(creds.url)}/api/rest/users/me`, { headers: { authorization: creds.token } });
      return { label: data.real_name || data.name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("MantisBT", `${root}/api/rest/issues`, {
        method: "POST",
        headers: { authorization: creds.token },
        json: { summary: titleFor(report, isTest), description: plainBody(report, 60_000), category: { name: target.category || "General" }, project: { name: target.project } },
        thing: "project",
      });
      return { externalId: `#${data.issue.id}`, externalUrl: `${root}/view.php?id=${data.issue.id}`, responseStatus: status };
    },
  },
  {
    id: "openproject",
    name: "OpenProject",
    category: "tracker",
    summary: "Creates a work package in OpenProject for each new report.",
    fields: [text("url", "OpenProject URL", undefined, "https://acme.openproject.com"), secret("token", "API key", "In OpenProject, open My account, then Access tokens.")],
    target: { label: "Project", fields: [text("project", "Project identifier", undefined, "web"), optional(text("type", "Type ID", "Leave empty for the project's default type."))] },
    async check(creds) {
      const { data } = await call("OpenProject", `${baseUrl(creds.url)}/api/v3/users/me`, { headers: basic("apikey", creds.token) });
      return { label: data.name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const { data, status } = await call("OpenProject", `${root}/api/v3/projects/${seg(target.project)}/work_packages`, {
        method: "POST",
        headers: basic("apikey", creds.token),
        json: {
          subject: titleFor(report, isTest),
          description: { format: "markdown", raw: plainMarkdownBody(report) },
          ...(target.type ? { _links: { type: { href: `/api/v3/types/${seg(target.type)}` } } } : {}),
        },
        thing: "project",
      });
      return { externalId: `#${data.id}`, externalUrl: `${root}/work_packages/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "phorge",
    name: "Phorge",
    category: "tracker",
    keywords: ["phabricator", "maniphest"],
    summary: "Creates a Maniphest task in Phorge or Phabricator for each new report.",
    fields: [text("url", "Phorge URL", undefined, "https://phorge.example.com"), secret("token", "Conduit API token", "In Phorge, open Settings, then Conduit API tokens.", "api-…")],
    target: { label: "Tag", fields: [optional(text("project", "Project tag PHID", "Adds the task to this project. Leave empty for none.", "PHID-PROJ-…"))] },
    async check(creds) {
      const result = await conduit(baseUrl(creds.url), creds.token, "user.whoami", {});
      return { label: result.userName };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const tx: Record<string, string> = {
        "transactions[0][type]": "title",
        "transactions[0][value]": titleFor(report, isTest),
        "transactions[1][type]": "description",
        "transactions[1][value]": plainMarkdownBody(report),
      };
      if (target.project) Object.assign(tx, { "transactions[2][type]": "projects.add", "transactions[2][value][0]": target.project });
      const result = await conduit(root, creds.token, "maniphest.edit", tx);
      const id = result.object?.id;
      return { externalId: id ? `T${id}` : undefined, externalUrl: id ? `${root}/T${id}` : undefined };
    },
  },
  {
    id: "kanboard",
    name: "Kanboard",
    category: "tracker",
    summary: "Creates a task on a Kanboard project for each new report.",
    fields: [text("url", "Kanboard URL", undefined, "https://kanboard.example.com"), secret("token", "API token", "In Kanboard, open Settings, then API. Issueit signs in as the jsonrpc user.")],
    target: { label: "Project", fields: [text("project", "Project ID", "The number in the project's URL.")] },
    async check(creds) {
      await kanboard(baseUrl(creds.url), creds.token, "getVersion", {});
      return { label: new URL(baseUrl(creds.url)).host };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const id = await kanboard(root, creds.token, "createTask", { title: titleFor(report, isTest), project_id: Number(target.project), description: plainMarkdownBody(report), tags: ["issueit"] });
      if (!id) throw new IntegrationError("Kanboard didn't create the task. Check the project id.", { retryable: false });
      return { externalId: `#${id}`, externalUrl: `${root}/?controller=TaskViewController&action=show&task_id=${id}` };
    },
  },
  {
    id: "vikunja",
    name: "Vikunja",
    category: "tracker",
    summary: "Adds a task to a Vikunja project for each new report.",
    fields: [text("url", "Vikunja URL", undefined, "https://vikunja.example.com"), secret("token", "API token", "In Vikunja, open Settings, then API tokens, with permission to create tasks.")],
    target: { label: "Project", fields: [text("project", "Project ID", "The number in the project's URL.")] },
    async check(creds) {
      const { data } = await call("Vikunja", `${baseUrl(creds.url)}/api/v1/projects?per_page=1`, { headers: bearer(creds.token) });
      return { label: `${new URL(baseUrl(creds.url)).host} · ${Array.isArray(data) ? "connected" : "ready"}` };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url);
      const priority = { critical: 5, high: 3, medium: 2, low: 1 }[report.priority];
      const { data, status } = await call("Vikunja", `${root}/api/v1/projects/${seg(target.project)}/tasks`, {
        method: "PUT",
        headers: bearer(creds.token),
        json: { title: titleFor(report, isTest), description: htmlBody(report), priority },
        thing: "project",
      });
      return { externalId: `#${data.id}`, externalUrl: `${root}/tasks/${data.id}`, responseStatus: status };
    },
  },
  {
    id: "favro",
    name: "Favro",
    category: "tracker",
    summary: "Adds a card to a Favro board for each new report.",
    fields: [
      text("email", "Favro email"),
      secret("token", "API token", "In Favro, open My profile, then API tokens."),
      text("organisation", "Organisation ID", "From Organisation settings, or the first id in any Favro URL."),
    ],
    target: { label: "Board", fields: [text("widget", "Board ID", "The widgetCommonId of the board, from the board's share link.")] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Favro", "https://favro.com/api/v1/cards", {
        method: "POST",
        headers: { ...basic(creds.email, creds.token), organizationid: creds.organisation },
        json: { widgetCommonId: target.widget, name: titleFor(report, isTest), detailedDescription: plainMarkdownBody(report) },
        thing: "board",
      });
      return { externalId: data.sequentialId ? `#${data.sequentialId}` : data.cardCommonId, responseStatus: status };
    },
  },
  {
    id: "meistertask",
    name: "MeisterTask",
    category: "tracker",
    summary: "Adds a task to a MeisterTask section for each new report.",
    fields: [secret("token", "Personal access token", "Create one in the Meister developer settings.")],
    help: { text: "Create a personal access token", url: "https://www.mindmeister.com/api" },
    target: { label: "Section", fields: [text("section", "Section ID", "The column the task lands in.")] },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("MeisterTask", `https://www.meistertask.com/api/sections/${seg(target.section)}/tasks`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { name: titleFor(report, isTest), notes: plainMarkdownBody(report) },
        thing: "section",
      });
      return { externalId: String(data.id ?? ""), externalUrl: data.token ? `https://www.meistertask.com/app/task/${data.token}` : undefined, responseStatus: status };
    },
  },
  {
    id: "backlog",
    name: "Backlog",
    category: "tracker",
    keywords: ["nulab"],
    summary: "Adds an issue to a Backlog project for each new report.",
    fields: [text("space", "Space address", undefined, "acme.backlog.com"), secret("token", "API key", "In Backlog, open Personal settings, then API.")],
    target: { label: "Project", fields: [text("project", "Project key", undefined, "WEB"), optional(text("type", "Issue type", "Bug unless your project uses another name.", "Bug"))] },
    async check(creds) {
      const { data } = await call("Backlog", `${baseUrl(creds.space, "space address")}/api/v2/users/myself?apiKey=${seg(creds.token)}`);
      return { label: data.name };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.space, "space address");
      const key = `apiKey=${seg(creds.token)}`;
      const { data: project } = await call("Backlog", `${root}/api/v2/projects/${seg(target.project)}?${key}`, { thing: "project" });
      const { data: types } = await call<any[]>("Backlog", `${root}/api/v2/projects/${project.id}/issueTypes?${key}`);
      const wanted = (target.type || "Bug").toLowerCase();
      const type = types.find((t) => t.name.toLowerCase() === wanted) ?? types[0];
      const priorityId = report.priority === "critical" || report.priority === "high" ? "2" : report.priority === "low" ? "4" : "3";
      const { data, status } = await call("Backlog", `${root}/api/v2/issues?${key}`, {
        method: "POST",
        form: { projectId: String(project.id), summary: titleFor(report, isTest), issueTypeId: String(type?.id ?? ""), priorityId, description: plainMarkdownBody(report) },
      });
      return { externalId: data.issueKey, externalUrl: `${root}/view/${data.issueKey}`, responseStatus: status };
    },
  },
  {
    id: "canny",
    name: "Canny",
    category: "tracker",
    summary: "Posts each new report to a Canny board.",
    fields: [secret("token", "API key", "In Canny, open Settings, then API & webhooks."), text("author", "Author ID", "The Canny user posts appear from, e.g. your own user id.")],
    target: { label: "Board", fields: [text("board", "Board ID")] },
    async check(creds) {
      const { data } = await call("Canny", "https://canny.io/api/v1/boards/list", { method: "POST", json: { apiKey: creds.token } });
      return { label: `Canny · ${data.boards?.length ?? 0} boards` };
    },
    async send({ report, creds, target, isTest }) {
      const { data, status } = await call("Canny", "https://canny.io/api/v1/posts/create", {
        method: "POST",
        json: { apiKey: creds.token, authorID: creds.author, boardID: target.board, title: titleFor(report, isTest), details: plainBody(report) },
        thing: "board",
      });
      return { externalId: data.id, responseStatus: status };
    },
  },
  {
    id: "productboard",
    name: "Productboard",
    category: "tracker",
    summary: "Adds each new report to Productboard as a note.",
    fields: [secret("token", "Access token", "In Productboard, open Integrations, then Public APIs.")],
    async send({ report, creds, isTest }) {
      const { data, status } = await call("Productboard", "https://api.productboard.com/notes", {
        method: "POST",
        headers: { ...bearer(creds.token), "x-version": "1" },
        json: { title: titleFor(report, isTest), content: htmlBody(report), display_url: report.dashboardUrl, tags: ["issueit", "bug"] },
      });
      return { externalId: data.data?.id, externalUrl: data.links?.html, responseStatus: status };
    },
  },
  {
    id: "taiga",
    name: "Taiga",
    category: "tracker",
    summary: "Creates an issue in a Taiga project for each new report.",
    fields: [
      optional(text("url", "Taiga API URL", "Only for self-hosted Taiga.", "https://api.taiga.io")),
      secret("token", "Auth token", "A Taiga application or auth token for a user who can create issues."),
    ],
    target: { label: "Project", fields: [text("project", "Project slug", "From the project's URL.", "acme-web")] },
    async check(creds) {
      const { data } = await call("Taiga", `${baseUrl(creds.url || "https://api.taiga.io")}/api/v1/users/me`, { headers: bearer(creds.token) });
      return { label: data.full_name_display ?? data.username };
    },
    async send({ report, creds, target, isTest }) {
      const root = baseUrl(creds.url || "https://api.taiga.io");
      const { data: project } = await call("Taiga", `${root}/api/v1/projects/by_slug?slug=${seg(target.project)}`, { headers: bearer(creds.token), thing: "project" });
      const { data, status } = await call("Taiga", `${root}/api/v1/issues`, {
        method: "POST",
        headers: bearer(creds.token),
        json: { project: project.id, subject: titleFor(report, isTest), description: plainMarkdownBody(report), tags: ["issueit"] },
      });
      return { externalId: `#${data.ref}`, responseStatus: status };
    },
  },
];

/* ------------------------------------------------------------------ small clients */

async function monday(token: string, query: string, variables: Record<string, unknown>) {
  const { data } = await call("monday.com", "https://api.monday.com/v2", { method: "POST", headers: { authorization: token, "api-version": "2025-04" }, json: { query, variables } });
  if (data?.error_message) throw new IntegrationError(`monday.com didn't accept the request. monday.com said: "${String(data.error_message).slice(0, 200)}".`, { retryable: false });
  graphqlErrors("monday.com", data);
  return data.data;
}

async function srht(token: string, query: string, variables: Record<string, unknown>) {
  const { data } = await call("SourceHut", "https://todo.sr.ht/query", { method: "POST", headers: bearer(token), json: { query, variables } });
  graphqlErrors("SourceHut", data);
  return data.data;
}

async function conduit(root: string, token: string, method: string, params: Record<string, string>) {
  const { data } = await call("Phorge", `${root}/api/${method}`, { method: "POST", form: { "api.token": token, ...params } });
  if (data?.error_code) {
    const auth = /token|session|auth/i.test(String(data.error_code));
    throw new IntegrationError(auth ? "Phorge rejected the saved token. Reconnect the account." : `Phorge didn't accept the request. Phorge said: "${String(data.error_info).slice(0, 200)}".`, {
      retryable: false,
      reconnect: auth,
    });
  }
  return data.result;
}

async function kanboard(root: string, token: string, method: string, params: Record<string, unknown>) {
  const { data } = await call("Kanboard", `${root}/jsonrpc.php`, { method: "POST", headers: basic("jsonrpc", token), json: { jsonrpc: "2.0", method, id: 1, params } });
  if (data?.error) throw new IntegrationError(`Kanboard didn't accept the request. Kanboard said: "${String(data.error.message).slice(0, 200)}".`, { retryable: false });
  return data.result;
}

export const trackers: Provider[] = [
  ...specs.map(define),
  giteaLike("gitea", "Gitea"),
  giteaLike("forgejo", "Forgejo"),
  giteaLike("codeberg", "Codeberg", { fixedBase: "https://codeberg.org", tokenUrl: "https://codeberg.org/user/settings/applications" }),
  giteaLike("gogs", "Gogs"),
];
