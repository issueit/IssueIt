/**
 * Issueit report widget. No dependencies; everything lives in a shadow root
 * so the host page's styles can't leak in or out.
 *
 *   <script src="https://cdn.issueit.app/widget.js" data-project="prj_…" defer></script>
 *
 * Options (data attributes): data-mode="button|inline", data-target (inline
 * container selector), data-source, data-theme="auto|light|dark",
 * data-capture="off" (never record console, requests or steps on this page).
 * API: Issueit.open(), Issueit.close(), Issueit.identify({ email, name }),
 * Issueit.setMetadata({ … }), Issueit.mount(options).
 *
 * Everything else (launcher, look, words, fields, behaviour) comes from the
 * project's widget settings in the dashboard.
 */

type FieldMode = "off" | "optional" | "required";
type WidgetField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "email" | "url" | "number";
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
};
type Position = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "middle-right" | "middle-left";

type WidgetConfig = {
  showButton: boolean;
  buttonLabel: string;
  buttonIcon: "bug" | "chat" | "flag" | "help" | "logo" | "none";
  buttonStyle: "pill" | "square" | "icon";
  buttonSize: "sm" | "md" | "lg";
  position: Position;
  offsetX: number;
  offsetY: number;
  theme: "auto" | "light" | "dark";
  accent: string | null;
  radius: number;
  panelWidth: number;
  font: "system" | "inherit";
  shadow: "none" | "soft" | "strong";
  backdrop: boolean;
  logo: string | null;
  brandName: string;
  headerStyle: "plain" | "filled";
  poweredBy: boolean;
  title: string;
  intro: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  footerNote: string;
  privacyUrl: string | null;
  updatesLabel: string;
  duplicateMessage: string;
  collectEmail: FieldMode;
  collectName: FieldMode;
  descriptionRequired: boolean;
  askPriority: boolean;
  defaultPriority: "low" | "medium" | "high" | "critical";
  categories: string[];
  categoryLabel: string;
  customFields: WidgetField[];
  allowAttachments: boolean;
  allowScreenshot: boolean;
  maxFiles: number;
  shortcut: string | null;
  autoCloseSeconds: number;
  hideOnMobile: boolean;
  includePages: string[];
  excludePages: string[];
  sendContext: boolean;
  captureConsole: boolean;
  captureNetwork: boolean;
  captureSteps: boolean;
  environment: string | null;
};

/** Kept in step with the server's defaults, for older settings and odd embeds. */
const DEFAULTS: WidgetConfig = {
  showButton: true,
  buttonLabel: "Report a bug",
  buttonIcon: "bug",
  buttonStyle: "pill",
  buttonSize: "md",
  position: "bottom-right",
  offsetX: 18,
  offsetY: 18,
  theme: "auto",
  accent: null,
  radius: 12,
  panelWidth: 360,
  font: "system",
  shadow: "soft",
  backdrop: false,
  logo: null,
  brandName: "",
  headerStyle: "plain",
  poweredBy: true,
  title: "Report a bug",
  intro: "",
  titleLabel: "What went wrong?",
  titlePlaceholder: "A short summary",
  descriptionLabel: "Details",
  descriptionPlaceholder: "What did you expect, and what happened instead?",
  submitLabel: "Send report",
  successTitle: "Report sent",
  successMessage: "Thanks. The team has it.",
  footerNote: "Sends this page's address, browser details and recent errors with your report.",
  privacyUrl: null,
  updatesLabel: "Email me updates about this report",
  duplicateMessage: "Others have reported this too, so it's already with the team.",
  collectEmail: "optional",
  collectName: "off",
  descriptionRequired: false,
  askPriority: false,
  defaultPriority: "medium",
  categories: [],
  categoryLabel: "Type",
  customFields: [],
  allowAttachments: true,
  allowScreenshot: true,
  maxFiles: 5,
  shortcut: null,
  autoCloseSeconds: 0,
  hideOnMobile: false,
  includePages: [],
  excludePages: [],
  sendContext: true,
  captureConsole: true,
  captureNetwork: true,
  captureSteps: true,
  environment: null,
};

type Remote = {
  project: { id: string; name: string };
  widget: WidgetConfig;
  /** Whether the project emails reporters who ask for updates. */
  emails?: { updates: boolean };
  limits: { attachmentBytes: number; attachmentsPerReport: number };
};

type PreviewState = "closed" | "form" | "done";

type MountOptions = {
  project: string;
  mode?: "button" | "inline";
  target?: Element | null;
  source?: string;
  api?: string;
  theme?: WidgetConfig["theme"];
  /** Dashboard preview: draws with this config and never sends anything. */
  preview?: { config: Partial<WidgetConfig>; projectName: string; state?: PreviewState; emailUpdates?: boolean };
};

type Instance = {
  open(): void;
  close(): void;
  update(config: Partial<WidgetConfig>, extra?: { emailUpdates?: boolean }): void;
  setPreviewState(state: PreviewState): void;
  destroy(): void;
};

const ICON = {
  bug: `<path d="M5 10C5 6.13401 8.13401 3 12 3C15.866 3 19 6.13401 19 10V15C19 18.866 15.866 22 12 22C8.13401 22 5 18.866 5 15V10Z"/><path d="M19 13H22"/><path d="M5 13H2"/><path d="M20.4999 7L18.7021 7.71909"/><path d="M3.50012 7L5.29785 7.71909"/><path d="M14.5 3.5L17 2"/><path d="M9.5 3.5L7 2"/><path d="M20.5 19.0002L18.5 18.2002"/><path d="M3.5 19.0002L5.5 18.2002"/><path d="M10.5 10.5H13.5"/><path d="M10.5 15.5H13.5"/>`,
  chat: `<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22Z"/><path d="M8 10.5H16"/><path d="M8 14H13.5"/>`,
  flag: `<path d="M5 22V14M5 14V4M5 14L7.47067 13.5059C9.1212 13.1758 10.8321 13.3328 12.3949 13.958C14.0885 14.6354 15.9524 14.7619 17.722 14.3195L17.8221 14.2945C18.4082 14.148 18.6861 13.4769 18.3753 12.9589L16.8147 10.3578C16.4732 9.78863 16.3024 9.50405 16.2619 9.19451C16.2451 9.06539 16.2451 8.93461 16.2619 8.80549C16.3024 8.49595 16.4732 8.21137 16.8147 7.64221L18.0932 5.51132C18.4278 4.9536 17.9211 4.26972 17.2901 4.42746C15.8013 4.79967 14.2331 4.69323 12.8082 4.12329L12.3949 3.95797C10.8321 3.33284 9.1212 3.17576 7.47067 3.50587L5 4M5 4V2"/>`,
  help: `<circle cx="12" cy="12" r="10"/><path d="M10.125 8.875C10.125 7.83947 10.9645 7 12 7C13.0355 7 13.875 7.83947 13.875 8.875C13.875 9.56245 13.505 10.1635 12.9534 10.4899C12.478 10.7711 12 11.1977 12 11.75V13"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/>`,
  camera: `<circle cx="12" cy="13" r="3"/><path d="M10.0001 19.9999H14.0001C16.809 19.9999 18.2135 19.9999 19.2224 19.3258C19.6591 19.0339 20.0341 18.6589 20.326 18.2222C21.0001 17.2133 21.0001 15.8088 21.0001 12.9999C21.0001 10.191 21 8.78673 20.3258 7.77783C20.034 7.34107 19.659 6.96607 19.2222 6.67423C18.2133 6.00011 16.8089 6.00011 14 6.00011H9.99995C7.19103 6.00011 5.78656 6.00011 4.77767 6.67423C4.34091 6.96607 3.96591 7.34107 3.67407 7.77783C3.0001 8.7865 3.0001 10.1903 3.0001 12.998L3.0001 12.9999C3.0001 15.8088 3.0001 17.2133 3.67422 18.2222C3.96605 18.6589 4.34106 19.0339 4.77782 19.3258C5.78671 19.9999 7.19117 19.9999 10.0001 19.9999Z"/><path d="M18 10H17.5"/><path d="M15 3H9"/>`,
  clip: `<path d="M7.9175 17.8068L15.8084 10.2535C16.7558 9.34668 16.7558 7.87637 15.8084 6.96951C14.861 6.06265 13.325 6.06265 12.3776 6.96951L4.54387 14.4681C2.74382 16.1911 2.74382 18.9847 4.54387 20.7077C6.34391 22.4308 9.26237 22.4308 11.0624 20.7077L19.0105 13.0997C21.6632 10.5605 21.6632 6.44362 19.0105 3.90441C16.3578 1.3652 12.0569 1.3652 9.40419 3.90441L3 10.0346"/>`,
  close: `<path d="M19.0068 5L5.00684 19"/><path d="M19 19L5 5"/>`,
  check: `<circle cx="12" cy="12" r="10"/><path d="M8.5 12.5L10.5 14.5L15.5 9.5"/>`,
};

const svg = (name: keyof typeof ICON, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #ffffff; --sunken: #f4f4f4; --text: #171717; --text-2: #555; --text-3: #7a7a7a; --border: #e3e3e3; --border-strong: #cfcfcf;
  --accent: #1c1c1c; --accent-fg: #fff; --danger: #c4413d; --danger-soft: rgba(196,65,61,.09); --ring: #2a2a2a;
  --radius: 12px; --field-radius: 6px; --font: "Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  --shadow: 0 10px 30px rgba(0,0,0,.14), 0 0 0 1px var(--border);
  font: 13.5px/1.45 var(--font);
  color: var(--text); -webkit-font-smoothing: antialiased;
}
.root[data-theme="dark"] {
  --bg: #1c1c1c; --sunken: #111; --text: #ededed; --text-2: #a9a9a9; --text-3: #808080; --border: #2c2c2c; --border-strong: #3a3a3a;
  --accent: #e6e6e6; --accent-fg: #111; --danger: #e0716f; --danger-soft: rgba(224,113,111,.12); --ring: #d8d8d8;
  --shadow: 0 10px 32px rgba(0,0,0,.5), 0 0 0 1px var(--border);
}
.root[data-shadow="none"] { --shadow: 0 0 0 1px var(--border); }
.root[data-shadow="strong"] { --shadow: 0 24px 60px rgba(0,0,0,.28), 0 0 0 1px var(--border); }
.root[data-theme="dark"][data-shadow="strong"] { --shadow: 0 24px 60px rgba(0,0,0,.7), 0 0 0 1px var(--border); }
.launcher {
  position: fixed; z-index: 2147483000; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 36px; padding: 0 14px 0 12px; border-radius: 999px; border: 0; cursor: pointer;
  background: var(--accent); color: var(--accent-fg); font: inherit; font-size: 12.5px; font-weight: 550; white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0,0,0,.18); transition: transform .13s cubic-bezier(.2,0,0,1), opacity .15s;
}
.launcher:hover { opacity: .92; }
.launcher:active { transform: scale(.97); }
.launcher[data-size="sm"] { height: 30px; padding: 0 11px 0 10px; font-size: 12px; gap: 6px; }
.launcher[data-size="lg"] { height: 44px; padding: 0 18px 0 15px; font-size: 14px; gap: 8px; }
.launcher[data-style="square"] { border-radius: 8px; }
.launcher[data-style="icon"] { padding: 0; width: 36px; }
.launcher[data-style="icon"][data-size="sm"] { width: 30px; }
.launcher[data-style="icon"][data-size="lg"] { width: 44px; }
.launcher[data-style="icon"] span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 640px) { .launcher[data-hide-mobile] { display: none; } }
.backdrop { position: fixed; inset: 0; z-index: 2147483000; background: rgba(0,0,0,.32); animation: fade .19s ease; }
@keyframes fade { from { opacity: 0; } }
.panel {
  position: fixed; z-index: 2147483001; width: 360px; max-width: calc(100vw - 24px);
  max-height: calc(100vh - 32px); overflow: auto; border-radius: var(--radius); background: var(--bg); box-shadow: var(--shadow);
  animation: in .19s cubic-bezier(.16,1,.3,1);
}
.inline .panel { position: static; width: auto; max-width: none; max-height: none; box-shadow: none; background: transparent; animation: none; transform: none !important; }
@keyframes in { from { opacity: 0; translate: 0 6px; scale: .98; } }
@media (prefers-reduced-motion: reduce) { .panel, .launcher, .backdrop { animation: none; transition: none; } }
.head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 2px; }
.head-text { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.title { font-size: 15px; font-weight: 600; margin: 0; }
.logo { display: block; height: 22px; width: auto; max-width: 140px; object-fit: contain; object-position: left center; }
.brand-name { font-size: 11.5px; font-weight: 550; color: var(--text-2); }
.root[data-header="filled"] .head { background: var(--accent); color: var(--accent-fg); padding: 14px 16px 12px; }
.root[data-header="filled"] .head .brand-name { color: inherit; opacity: .8; }
.root[data-header="filled"] .head .btn.quiet { color: inherit; }
.root[data-header="filled"] .head + form { padding-top: 14px; }
.launcher img { width: 18px; height: 18px; object-fit: contain; border-radius: 4px; }
.launcher[data-size="sm"] img { width: 15px; height: 15px; }
.launcher[data-size="lg"] img { width: 21px; height: 21px; }
.powered { display: block; margin: -6px 0 0; padding: 0 16px 12px; text-align: center; font-size: 11px; color: var(--text-3); text-decoration: none; }
.powered:hover { color: var(--text-2); }
.inline .powered { padding-bottom: 14px; }
.inline .head { display: none; }
.intro { margin: 0; color: var(--text-2); font-size: 12.5px; }
form { display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 16px; }
.inline form { padding: 18px; }
label.field, .field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 500; }
.opt { color: var(--text-3); font-weight: 400; }
.help { color: var(--text-3); font-weight: 400; font-size: 11.5px; }
input[type=text], input[type=email], input[type=url], input[type=number], textarea, select {
  width: 100%; font: inherit; font-size: 13px; color: var(--text); background: var(--sunken);
  border: 1px solid var(--border); border-radius: var(--field-radius); padding: 7px 10px; outline: none; transition: border-color .11s;
}
select { appearance: none; padding-right: 28px; background-image: linear-gradient(45deg, transparent 50%, var(--text-3) 50%), linear-gradient(135deg, var(--text-3) 50%, transparent 50%); background-position: calc(100% - 15px) 52%, calc(100% - 10px) 52%; background-size: 5px 5px; background-repeat: no-repeat; }
input:focus, textarea:focus, select:focus { border-color: var(--border-strong); background-color: var(--bg); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 25%, transparent); }
textarea { min-height: 92px; resize: vertical; line-height: 1.5; }
label.field.check, .field.check { flex-direction: row; align-items: center; gap: 8px; font-weight: 400; }
.check input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 11px;
  border-radius: var(--field-radius); border: 1px solid var(--border); background: var(--sunken); color: var(--text);
  font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: background .11s, border-color .11s;
}
.btn:hover { border-color: var(--border-strong); }
.btn:disabled { opacity: .55; cursor: default; }
.btn.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
.btn.quiet { background: transparent; border-color: transparent; color: var(--text-2); }
.btn.icon { width: 28px; height: 28px; padding: 0; }
.btn:focus-visible, .launcher:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.files { display: flex; flex-direction: column; gap: 4px; }
.file { display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 8px; border: 1px solid var(--border); border-radius: var(--field-radius); font-size: 12px; color: var(--text-2); }
.file span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file img { width: 28px; height: 20px; object-fit: cover; border-radius: 3px; }
.note { font-size: 11.5px; color: var(--text-3); margin: 0; }
.note a { color: inherit; }
.error { font-size: 12px; color: var(--danger); background: var(--danger-soft); border-radius: var(--field-radius); padding: 7px 10px; margin: 0; }
.foot { display: flex; align-items: center; gap: 8px; }
.foot .note { flex: 1; }
.done { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 28px 18px 22px; }
.done svg { color: var(--text-2); margin-bottom: 4px; }
.done p { margin: 0; color: var(--text-2); font-size: 12.5px; }
.done strong { font-weight: 600; font-size: 14px; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.spinner { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

const scriptEl = document.currentScript as HTMLScriptElement | null;
const scriptOrigin = scriptEl?.src ? new URL(scriptEl.src).origin : location.origin;

let identity: { email?: string; name?: string } = {};
let extraMetadata: Record<string, unknown> = {};

/* ------------------------------------------------------------------ capture */

/**
 * What happened on the page before someone reported a bug: console errors
 * and warnings, uncaught errors, the requests the page made, and clicks and
 * page changes. Recording starts as soon as the script loads so the moments
 * before the form opens are there. It stays in memory and is only sent with
 * a report, if the project allows it and the person leaves it ticked. Typed
 * values, request bodies and query string values are never recorded.
 */
type ConsoleItem = { at: number; level: "error" | "warn"; message: string; stack?: string };
type NetworkItem = { at: number; method: string; url: string; status: number | null; ms: number; error?: string };
type StepItem = { at: number; kind: "click" | "navigate" | "input"; label: string };

const captured = { console: [] as ConsoleItem[], network: [] as NetworkItem[], steps: [] as StepItem[] };
const LIMITS = { console: 40, network: 40, steps: 30 };

function keep<K extends keyof typeof captured>(kind: K, item: (typeof captured)[K][number]) {
  const list = captured[kind] as Array<typeof item>;
  list.push(item);
  if (list.length > LIMITS[kind]) list.shift();
}

/** Emails, tokens and card numbers out; the server does this again. */
function scrub(value: string, max = 1000) {
  const out = value
    .slice(0, max * 2)
    .replace(/\b(bearer|basic)\s+[^\s"'&,;]{4,}/gi, "$1 [redacted]")
    .replace(/([\w-]*(?:token|secret|session|cookie|password|passwd|apikey|api[_-]key|auth|credential)[\w-]*)(["']?\s*[:=]\s*["']?)[^\s"'&,;]{4,}/gi, "$1$2[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, "[number]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

/** Origin and path, plus the names of query parameters without their values. */
function cleanUrl(raw: string) {
  try {
    const u = new URL(raw, location.href);
    const names = Array.from(new Set(Array.from(u.searchParams.keys()))).slice(0, 10);
    return scrub(`${u.origin === location.origin ? "" : u.origin}${u.pathname}`, 400) + (names.length ? `?${names.map((n) => `${n}=…`).join("&")}` : "");
  } catch {
    return scrub(raw.split("?")[0], 400);
  }
}

/** A short description of a logged value. Objects are summarised, not serialised whole. */
function describeValue(v: unknown): string {
  if (typeof v === "string") return v.slice(0, 2000);
  if (v instanceof Error) return `${v.name}: ${v.message}`.slice(0, 2000);
  if (v === null || typeof v !== "object") return String(v);
  if (Array.isArray(v)) return `[array of ${v.length}]`;
  const keys = Object.keys(v).slice(0, 8);
  return `{${keys.map((k) => {
    const x = (v as Record<string, unknown>)[k];
    return `${k}: ${typeof x === "string" ? JSON.stringify(x.slice(0, 80)) : typeof x === "number" || typeof x === "boolean" || x === null ? String(x) : "…"}`;
  }).join(", ")}${Object.keys(v).length > 8 ? ", …" : ""}}`;
}

/** Requests the widget makes itself aren't worth recording. */
const ownRequest = (url: string) => {
  try {
    const u = new URL(url, location.href);
    return (u.origin === scriptOrigin && u.pathname.startsWith("/v1/")) || u.protocol === "data:" || u.protocol === "blob:";
  } catch {
    return false;
  }
};

/**
 * "button "Save"", "link "Pricing"", "email field "Work email"". Text only
 * comes from controls' own labels; editable areas and other elements give
 * just their tag, so nothing a person wrote or was shown is recorded.
 */
function describeElement(el: Element): string | null {
  if ((el as HTMLElement).isContentEditable || el.closest("[contenteditable]:not([contenteditable=false])")) return "text editor";
  const control = el.closest("button, a, [role=button], [role=link], [role=tab], [role=menuitem], input, select, textarea, summary");
  if (!control) return el.id ? `${el.tagName.toLowerCase()}#${el.id}` : null;
  const tag = control.tagName.toLowerCase();
  if (tag === "input" && (control as HTMLInputElement).type === "password") return null;
  const field = tag === "input" || tag === "select" || tag === "textarea";
  const kind = field ? `${tag === "input" ? (control as HTMLInputElement).type : tag} field` : tag === "a" ? "link" : (control.getAttribute("role") ?? tag);
  const label = () => {
    if (field) {
      const f = control as HTMLInputElement;
      return f.labels?.[0]?.textContent || f.getAttribute("aria-label") || f.name || f.placeholder || f.id || "";
    }
    return control.getAttribute("aria-label") || control.getAttribute("title") || (control.textContent ?? "").slice(0, 200);
  };
  const text = label().slice(0, 200).replace(/\s+/g, " ").trim().slice(0, 60);
  return text ? `${kind} "${scrub(text, 80)}"` : control.id ? `${kind}#${control.id}` : kind;
}

function startCapture() {
  const now = () => Date.now();
  for (const level of ["error", "warn"] as const) {
    const original = console[level];
    console[level] = function (this: Console, ...args: unknown[]) {
      try {
        const err = args.find((a): a is Error => a instanceof Error);
        keep("console", { at: now(), level, message: scrub(args.map(describeValue).join(" ")), stack: err?.stack ? scrub(err.stack, 1500) : undefined });
      } catch {
        // Recording must never break the page's own logging.
      }
      return original.apply(this, args);
    };
  }
  window.addEventListener(
    "error",
    (e) => {
      const t = e.target as Element | null;
      if (t && t !== (window as unknown) && "tagName" in t) {
        const src = (t as HTMLImageElement).src || (t as HTMLLinkElement).href;
        if (src) keep("console", { at: now(), level: "error", message: `Couldn't load ${t.tagName.toLowerCase()} ${cleanUrl(src)}` });
        return;
      }
      const stack = e.error instanceof Error && e.error.stack ? e.error.stack : e.filename ? `at ${cleanUrl(e.filename)}:${e.lineno}:${e.colno}` : undefined;
      keep("console", { at: now(), level: "error", message: scrub(e.message || "Uncaught error"), stack: stack ? scrub(stack, 1500) : undefined });
    },
    true,
  );
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    keep("console", { at: now(), level: "error", message: scrub(`Unhandled rejection: ${describeValue(reason)}`), stack: reason instanceof Error && reason.stack ? scrub(reason.stack, 1500) : undefined });
  });

  const record = (method: string, url: string, started: number, status: number | null, error?: string) =>
    keep("network", { at: now(), method: method.toUpperCase(), url: cleanUrl(url), status, ms: Math.round(performance.now() - started), error });
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
      const call = originalFetch.call(this ?? window, input, init);
      if (ownRequest(url)) return call;
      const started = performance.now();
      return call.then(
        (res) => {
          record(method, url, started, res.status);
          return res;
        },
        (err) => {
          record(method, url, started, null, err?.name === "AbortError" ? "Cancelled" : "Network error");
          throw err;
        },
      );
    } as typeof fetch;
  }
  const xhr = XMLHttpRequest.prototype;
  const open = xhr.open;
  const send = xhr.send;
  xhr.open = function (this: XMLHttpRequest & { __issueit?: { method: string; url: string } }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__issueit = { method, url: String(url) };
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof xhr.open;
  xhr.send = function (this: XMLHttpRequest & { __issueit?: { method: string; url: string } }, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = this.__issueit;
    if (meta && !ownRequest(meta.url)) {
      const started = performance.now();
      this.addEventListener("loadend", () => record(meta.method, meta.url, started, this.status || null, this.status ? undefined : "Network error"), { once: true });
    }
    return send.call(this, body);
  };

  const step = (kind: StepItem["kind"], label: string | null) => label && keep("steps", { at: now(), kind, label });
  const outside = (e: Event) => e.target instanceof Element && !e.target.closest("[data-issueit]");
  document.addEventListener("click", (e) => outside(e) && step("click", describeElement(e.target as Element)), true);
  document.addEventListener("change", (e) => outside(e) && step("input", describeElement(e.target as Element)), true);
  let lastPage = "";
  const navigated = () => {
    const page = cleanUrl(location.href);
    if (page !== lastPage) step("navigate", (lastPage = page));
  };
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name];
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      navigated();
      return result;
    };
  }
  window.addEventListener("popstate", navigated);
  window.addEventListener("hashchange", navigated);
  navigated();
}

if (scriptEl?.dataset.capture !== "off") {
  try {
    startCapture();
  } catch {
    // An unusual page shouldn't stop the widget itself from working.
  }
}

/** The recording, with times as milliseconds before now, filtered by what the project allows. */
function diagnostics(w: WidgetConfig) {
  const at = Date.now();
  const rel = <T extends { at: number }>(list: T[]) => list.map(({ at: when, ...rest }) => ({ t: Math.max(0, at - when), ...rest }));
  const out: Record<string, unknown[]> = {};
  if (w.captureConsole && captured.console.length) out.console = rel(captured.console);
  if (w.captureNetwork && captured.network.length) out.network = rel(captured.network);
  if (w.captureSteps && captured.steps.length) out.steps = rel(captured.steps);
  return Object.keys(out).length ? out : undefined;
}

const capturing = (w: WidgetConfig) => scriptEl?.dataset.capture !== "off" && (w.captureConsole || w.captureNetwork || w.captureSteps);

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function context() {
  return {
    userAgent: navigator.userAgent,
    viewport: `${innerWidth}×${innerHeight}`,
    screen: `${screen.width}×${screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: document.referrer || undefined,
  };
}

const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** "*" matches anything. Patterns starting with "/" match the path, others the whole address. */
function pageMatches(patterns: string[]) {
  return patterns.some((p) => {
    const re = new RegExp(`^${p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    return re.test(p.startsWith("/") ? location.pathname : location.href);
  });
}

/** "mod+shift+b": mod is ⌘ on Apple devices and Ctrl elsewhere. */
function shortcutMatches(shortcut: string, e: KeyboardEvent) {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop();
  const apple = /mac|iphone|ipad/i.test(navigator.platform);
  const want = { ctrl: false, alt: false, shift: false, meta: false };
  for (const p of parts) {
    if (p === "mod") want[apple ? "meta" : "ctrl"] = true;
    else if (p in want) want[p as keyof typeof want] = true;
  }
  return e.key.toLowerCase() === key && e.ctrlKey === want.ctrl && e.altKey === want.alt && e.shiftKey === want.shift && e.metaKey === want.meta;
}

const priorityNames = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const launcherHeight = { sm: 30, md: 36, lg: 44 };

function mount(opts: MountOptions): Instance {
  const api = (opts.api ?? scriptOrigin).replace(/\/$/, "");
  const inline = opts.mode === "inline";
  const host = document.createElement("div");
  host.setAttribute("data-issueit", "");
  if (inline && opts.target) opts.target.appendChild(host);
  else document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${STYLES}</style><div class="root${inline ? " inline" : ""}"></div>`;
  const root = shadow.querySelector(".root") as HTMLDivElement;

  let remote: Remote | null = opts.preview
    ? { project: { id: opts.project, name: opts.preview.projectName }, widget: { ...DEFAULTS, ...opts.preview.config }, limits: { attachmentBytes: 10 * 1024 * 1024, attachmentsPerReport: 5 } }
    : null;
  if (remote && opts.preview) remote.emails = { updates: !!opts.preview.emailUpdates };
  let isOpen = inline || opts.preview?.state === "form" || opts.preview?.state === "done";
  let files: File[] = [];
  let state: "form" | "sending" | "done" = opts.preview?.state === "done" ? "done" : "form";
  let error = "";
  let draft: {
    title: string;
    description: string;
    email: string;
    name: string;
    category: string;
    priority: string;
    fields: Record<string, string | boolean>;
    notify: boolean;
    diagnostics: boolean;
  } = {
    title: "",
    description: "",
    email: identity.email ?? "",
    name: identity.name ?? "",
    category: "",
    priority: "",
    fields: {},
    notify: true,
    diagnostics: true,
  };
  let wasDuplicate = false;
  let launcherEl: HTMLButtonElement | null = null;
  let closeTimer: number | null = null;
  const media = matchMedia("(prefers-color-scheme: dark)");

  const theme = () => {
    const pref = opts.theme ?? remote?.widget.theme ?? "auto";
    return pref === "auto" ? (media.matches ? "dark" : "light") : pref;
  };

  /** Launcher on screen: settings allow it here, and the page rules don't hide it. */
  const showLauncher = (w: WidgetConfig) => {
    if (inline || !w.showButton) return false;
    if (opts.preview) return true;
    if (w.includePages.length && !pageMatches(w.includePages)) return false;
    if (w.excludePages.length && pageMatches(w.excludePages)) return false;
    return true;
  };

  function placement(w: WidgetConfig, withLauncher: boolean) {
    const [v, h] = w.position.split("-") as ["bottom" | "top" | "middle", "left" | "right"];
    const side = `${h}:${w.offsetX}px;`;
    const gap = withLauncher ? launcherHeight[w.buttonSize] + 12 : 0;
    const launcher = v === "middle" ? `${side}top:50%;transform:translateY(-50%);` : `${side}${v}:${w.offsetY}px;`;
    // A tall form scrolls inside itself rather than running off the far edge of the screen.
    const panel = v === "middle" ? `${side}top:50%;transform:translateY(-50%);` : `${side}${v}:${w.offsetY + gap}px;max-height:calc(100vh - ${w.offsetY + gap + 16}px);`;
    return { launcher, panel };
  }

  function render() {
    if (!remote) return;
    const w = remote.widget;
    root.dataset.theme = theme();
    root.dataset.shadow = w.shadow;
    root.dataset.header = w.headerStyle;
    root.style.setProperty("--radius", `${w.radius}px`);
    root.style.setProperty("--field-radius", `${Math.min(8, Math.max(0, Math.round(w.radius / 2)))}px`);
    if (w.font === "inherit") root.style.setProperty("--font", getComputedStyle(opts.target ?? document.body).fontFamily || "inherit");
    else root.style.removeProperty("--font");
    if (w.accent) {
      root.style.setProperty("--accent", w.accent);
      root.style.setProperty("--accent-fg", contrast(w.accent));
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-fg");
    }
    const withLauncher = showLauncher(w);
    const pos = placement(w, withLauncher);
    const iconName = w.buttonIcon === "logo" && !w.logo ? "bug" : w.buttonIcon;
    const icon = iconName === "logo" ? `<img alt="" src="${esc(api + w.logo)}">` : iconName !== "none" ? svg(iconName, w.buttonSize === "lg" ? 17 : w.buttonSize === "sm" ? 14 : 15) : "";
    const launcher = withLauncher
      ? `<button class="launcher" style="${pos.launcher}" data-size="${w.buttonSize}" data-style="${w.buttonIcon === "none" && w.buttonStyle === "icon" ? "pill" : w.buttonStyle}" ${w.hideOnMobile ? "data-hide-mobile" : ""} aria-label="${esc(w.buttonLabel)}" aria-expanded="${isOpen}" aria-haspopup="dialog">${icon}<span>${esc(w.buttonLabel)}</span></button>`
      : "";
    const backdrop = isOpen && !inline && w.backdrop ? `<div class="backdrop" data-act="close"></div>` : "";
    const panel = isOpen
      ? `<div class="panel" style="${inline ? "" : `${pos.panel}width:${w.panelWidth}px;`}" role="${inline ? "region" : "dialog"}" aria-label="${esc(w.title)} - ${esc(w.brandName || remote.project.name)}">${state === "done" ? doneView(w) : formView(w)}${poweredBy(w)}</div>`
      : "";
    root.innerHTML = backdrop + launcher + panel;
    wire();
  }

  function poweredBy(w: WidgetConfig) {
    return w.poweredBy ? `<a class="powered" href="https://issueit.app/?ref=widget" target="_blank" rel="noopener">Powered by Issueit</a>` : "";
  }

  /** The logo, or the brand's name when there's no logo, above the heading. */
  function brandMark(w: WidgetConfig) {
    if (w.logo) return `<img class="logo" alt="${esc(w.brandName || remote!.project.name)}" src="${esc(api + w.logo)}">`;
    return w.brandName ? `<span class="brand-name">${esc(w.brandName)}</span>` : "";
  }

  function modeLabel(text: string, mode: FieldMode | boolean) {
    return `${esc(text)}${mode === "optional" || mode === false ? ' <span class="opt">(optional)</span>' : ""}`;
  }

  function customField(f: WidgetField) {
    const value = draft.fields[f.key];
    const name = `f_${esc(f.key)}`;
    const help = f.help ? `<span class="help">${esc(f.help)}</span>` : "";
    const req = f.required ? "required" : "";
    const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "";
    if (f.type === "checkbox")
      return `<label class="field check"><input type="checkbox" name="${name}" ${value ? "checked" : ""} ${req}><span>${esc(f.label)}${f.required ? "" : ' <span class="opt">(optional)</span>'}</span></label>${help}`;
    if (f.type === "select")
      return `<label class="field"><span>${modeLabel(f.label, f.required)}</span><select name="${name}" ${req}><option value="">${esc(f.placeholder || "Choose…")}</option>${(f.options ?? []).map((o) => `<option ${value === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>${help}</label>`;
    if (f.type === "textarea")
      return `<label class="field"><span>${modeLabel(f.label, f.required)}</span><textarea name="${name}" maxlength="4000" ${ph} ${req}>${esc(String(value ?? ""))}</textarea>${help}</label>`;
    return `<label class="field"><span>${modeLabel(f.label, f.required)}</span><input type="${f.type}" name="${name}" maxlength="500" value="${esc(String(value ?? ""))}" ${ph} ${req}>${help}</label>`;
  }

  function formView(w: WidgetConfig) {
    const sending = state === "sending";
    const maxFiles = Math.min(w.maxFiles, remote!.limits.attachmentsPerReport);
    const nameField =
      w.collectName === "off" || identity.name
        ? ""
        : `<label class="field"><span>${modeLabel("Your name", w.collectName)}</span><input type="text" name="name" autocomplete="name" maxlength="80" value="${esc(draft.name)}" ${w.collectName === "required" ? "required" : ""}></label>`;
    const emailField =
      w.collectEmail === "off" || identity.email
        ? ""
        : `<label class="field"><span>${modeLabel("Your email", w.collectEmail)}</span><input type="email" name="email" autocomplete="email" maxlength="254" ${w.collectEmail === "required" ? "required" : ""} value="${esc(draft.email)}" placeholder="So the team can follow up"></label>`;
    const who = nameField && emailField ? `<div class="pair">${nameField}${emailField}</div>` : nameField + emailField;
    const category = w.categories.length
      ? `<label class="field"><span>${esc(w.categoryLabel)}</span><select name="category">${w.categories.map((c) => `<option ${draft.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`
      : "";
    const priority = w.askPriority
      ? `<label class="field"><span>How bad is it?</span><select name="priority">${(Object.keys(priorityNames) as Array<keyof typeof priorityNames>).map((p) => `<option value="${p}" ${(draft.priority || w.defaultPriority) === p ? "selected" : ""}>${priorityNames[p]}</option>`).join("")}</select></label>`
      : "";
    const meta = category && priority ? `<div class="pair">${category}${priority}</div>` : category + priority;
    const canShot = w.allowScreenshot && !!navigator.mediaDevices?.getDisplayMedia;
    const attach =
      w.allowAttachments || canShot
        ? `<div class="row">
            ${w.allowAttachments ? `<button type="button" class="btn" data-act="attach" ${files.length >= maxFiles ? "disabled" : ""}>${svg("clip", 14)}Attach file</button><input type="file" hidden multiple accept="image/*,video/mp4,video/webm,application/pdf,text/plain,.log,.txt,.json,.zip">` : ""}
            ${canShot ? `<button type="button" class="btn" data-act="shot" ${files.length >= maxFiles ? "disabled" : ""}>${svg("camera", 14)}Screenshot</button>` : ""}
          </div>
          ${files.length ? `<div class="files">${files.map((f, i) => `<div class="file">${f.type.startsWith("image/") ? `<img alt="" src="${URL.createObjectURL(f)}">` : ""}<span>${esc(f.name)} · ${formatSize(f.size)}</span><button type="button" class="btn quiet icon" data-remove="${i}" aria-label="Remove ${esc(f.name)}">${svg("close", 13)}</button></div>`).join("")}</div>` : ""}`
        : "";
    const emailOnPage = !!identity.email || w.collectEmail !== "off";
    const updates =
      remote!.emails?.updates && emailOnPage
        ? `<label class="field check"><input type="checkbox" name="notify" ${draft.notify ? "checked" : ""}><span>${esc(w.updatesLabel)}</span></label>`
        : "";
    const technical = capturing(w)
      ? `<label class="field check"><input type="checkbox" name="diagnostics" ${draft.diagnostics ? "checked" : ""}><span>Include recent errors and steps from this page</span></label>`
      : "";
    const note = opts.preview ? "Preview - nothing is sent." : w.footerNote;
    const privacy = w.privacyUrl ? ` <a href="${esc(w.privacyUrl)}" target="_blank" rel="noopener noreferrer">Privacy</a>` : "";
    return `
      <div class="head"><div class="head-text">${brandMark(w)}<h2 class="title">${esc(w.title)}</h2></div><button type="button" class="btn quiet icon" data-act="close" aria-label="Close">${svg("close", 15)}</button></div>
      <form novalidate>
        ${w.intro ? `<p class="intro">${esc(w.intro)}</p>` : ""}
        <label class="field"><span>${esc(w.titleLabel)}</span><input type="text" name="title" required maxlength="200" value="${esc(draft.title)}" placeholder="${esc(w.titlePlaceholder)}"></label>
        <label class="field"><span>${modeLabel(w.descriptionLabel, w.descriptionRequired ? "required" : "optional")}</span><textarea name="description" maxlength="20000" ${w.descriptionRequired ? "required" : ""} placeholder="${esc(w.descriptionPlaceholder)}">${esc(draft.description)}</textarea></label>
        ${meta}
        ${w.customFields.map(customField).join("")}
        ${who}
        ${updates}
        ${attach}
        ${technical}
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
        <div class="foot">
          <p class="note">${esc(note)}${opts.preview ? "" : privacy}</p>
          <button type="submit" class="btn primary" ${sending ? "disabled" : ""}>${sending ? '<span class="spinner"></span>Sending' : esc(w.submitLabel)}</button>
        </div>
      </form>`;
  }

  function doneView(w: WidgetConfig) {
    const message = w.successMessage.replace(/\{project\}/g, w.brandName || remote!.project.name);
    const known = wasDuplicate && w.duplicateMessage ? `<p>${esc(w.duplicateMessage)}</p>` : "";
    return `<div class="done" role="status">${inline ? "" : brandMark(w)}${svg("check", 26)}<strong>${esc(w.successTitle)}</strong><p>${esc(message)}</p>${known}<div class="row" style="margin-top:10px"><button type="button" class="btn" data-act="again">Send another</button>${inline ? "" : '<button type="button" class="btn quiet" data-act="close">Close</button>'}</div></div>`;
  }

  function wire() {
    launcherEl = root.querySelector(".launcher");
    launcherEl?.addEventListener("click", () => (isOpen ? close() : open()));
    root.querySelectorAll<HTMLElement>("[data-act=close]").forEach((b) => b.addEventListener("click", close));
    root.querySelectorAll<HTMLImageElement>("img").forEach((img) => img.addEventListener("error", () => img.remove()));
    root.querySelector("[data-act=again]")?.addEventListener("click", () => {
      state = "form";
      wasDuplicate = false;
      draft = { ...draft, title: "", description: "", category: "", priority: "", fields: {} };
      files = [];
      render();
      focusFirst();
    });
    const form = root.querySelector("form");
    if (!form) return;
    const capture = (t: HTMLInputElement) => {
      if (t.name === "notify" || t.name === "diagnostics") draft[t.name] = t.checked;
      else if (t.name.startsWith("f_")) draft.fields[t.name.slice(2)] = t.type === "checkbox" ? t.checked : t.value;
      else if (t.name in draft && t.name !== "fields") (draft as Record<string, unknown>)[t.name] = t.value;
    };
    form.addEventListener("input", (e) => capture(e.target as HTMLInputElement));
    form.addEventListener("change", (e) => capture(e.target as HTMLInputElement));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void submit(form);
    });
    const fileInput = form.querySelector<HTMLInputElement>("input[type=file]");
    form.querySelector("[data-act=attach]")?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => addFiles(Array.from(fileInput.files ?? [])));
    form.querySelector("[data-act=shot]")?.addEventListener("click", () => void screenshot());
    form.querySelectorAll<HTMLElement>("[data-remove]").forEach((b) =>
      b.addEventListener("click", () => {
        files.splice(Number(b.dataset.remove), 1);
        render();
      }),
    );
    form.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !inline) close();
    });
  }

  function addFiles(list: File[]) {
    if (!remote) return;
    const max = Math.min(remote.widget.maxFiles, remote.limits.attachmentsPerReport);
    error = "";
    for (const f of list) {
      if (files.length >= max) {
        error = `You can attach up to ${max} ${max === 1 ? "file" : "files"}.`;
        break;
      }
      if (f.size > remote.limits.attachmentBytes) {
        error = `${f.name} is larger than ${formatSize(remote.limits.attachmentBytes)}.`;
        continue;
      }
      files.push(f);
    }
    render();
  }

  /** Captures one frame of the screen the person chooses. The browser asks for permission first. */
  async function screenshot() {
    let stream: MediaStream | null = null;
    host.style.visibility = "hidden";
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" } as MediaTrackConstraints, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 250));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) addFiles([new File([blob], `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, { type: "image/png" })]);
    } catch {
      // Cancelled or not allowed; nothing to report.
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      host.style.visibility = "";
    }
  }

  /** The first problem with the form, and the field to focus. */
  function validate(w: WidgetConfig, data: FormData): [string, string] | null {
    if (!String(data.get("title") ?? "").trim()) return ["Add a short summary of the problem.", "title"];
    if (w.descriptionRequired && !String(data.get("description") ?? "").trim()) return [`Fill in ${w.descriptionLabel.toLowerCase()}.`, "description"];
    for (const f of w.customFields) {
      const v = f.type === "checkbox" ? data.get(`f_${f.key}`) === "on" : String(data.get(`f_${f.key}`) ?? "").trim();
      if (f.required && !v) return [`Fill in "${f.label}".`, `f_${f.key}`];
      if (typeof v === "string" && v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return [`"${f.label}" needs an email address.`, `f_${f.key}`];
      if (typeof v === "string" && v && f.type === "url" && !/^https?:\/\/\S+$/i.test(v)) return [`"${f.label}" needs a full web address.`, `f_${f.key}`];
    }
    if (w.collectName === "required" && !identity.name && !String(data.get("name") ?? "").trim()) return ["Add your name.", "name"];
    const email = String(data.get("email") ?? "").trim() || identity.email || "";
    if (w.collectEmail === "required" && !email) return ["Add your email so the team can follow up.", "email"];
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ["Check your email address.", "email"];
    return null;
  }

  async function submit(form: HTMLFormElement) {
    if (!remote || state === "sending") return;
    const w = remote.widget;
    const data = new FormData(form);
    const problem = validate(w, data);
    if (problem) {
      error = problem[0];
      render();
      root.querySelector<HTMLElement>(`[name="${problem[1]}"]`)?.focus();
      return;
    }
    if (opts.preview) {
      state = "done";
      render();
      return;
    }
    state = "sending";
    error = "";
    render();

    const fields: Record<string, string | boolean | number> = {};
    for (const f of w.customFields) {
      if (f.type === "checkbox") fields[f.key] = data.get(`f_${f.key}`) === "on";
      else {
        const v = String(data.get(`f_${f.key}`) ?? "").trim();
        if (v) fields[f.key] = f.type === "number" && !Number.isNaN(Number(v)) ? Number(v) : v;
      }
    }
    const metadata: Record<string, unknown> = { ...extraMetadata };
    if (w.categories.length && data.get("category")) metadata.category = String(data.get("category"));
    if (Object.keys(fields).length) metadata.fields = fields;

    const body = new FormData();
    body.set(
      "report",
      JSON.stringify({
        title: String(data.get("title") ?? "").trim(),
        description: String(data.get("description") ?? ""),
        email: String(data.get("email") ?? "").trim() || identity.email || undefined,
        name: String(data.get("name") ?? "").trim() || identity.name || undefined,
        priority: w.askPriority ? String(data.get("priority") ?? w.defaultPriority) : undefined,
        environment: w.environment || undefined,
        page_url: w.sendContext ? location.href.slice(0, 2000) : undefined,
        source: opts.source ?? "widget",
        // The time zone stays even without the rest, so reports can be placed on the map.
        context: w.sendContext ? context() : { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        metadata: Object.keys(metadata).length ? metadata : undefined,
        diagnostics: capturing(w) && data.get("diagnostics") === "on" ? diagnostics(w) : undefined,
        notify: remote.emails?.updates ? data.get("notify") === "on" : undefined,
        website: String(data.get("website") ?? ""),
      }),
    );
    for (const f of files) body.append("attachments", f, f.name);
    try {
      const res = await fetch(`${api}/v1/${encodeURIComponent(opts.project)}/reports`, { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Couldn't send the report. Try again.");
      state = "done";
      wasDuplicate = !!json?.duplicate;
      files = [];
      if (w.autoCloseSeconds && !inline) closeTimer = window.setTimeout(close, w.autoCloseSeconds * 1000);
    } catch (err) {
      state = "form";
      error = err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : (err as Error).message;
    }
    render();
  }

  function focusFirst() {
    requestAnimationFrame(() => root.querySelector<HTMLElement>("input[name=title], .done .btn")?.focus());
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    render();
    focusFirst();
  }

  function close() {
    if (inline) return;
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    isOpen = false;
    if (state === "done") {
      state = "form";
      draft = { ...draft, title: "", description: "", category: "", priority: "", fields: {} };
    }
    render();
    launcherEl?.focus();
  }

  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isOpen && !inline) close();
    const shortcut = remote?.widget.shortcut;
    if (shortcut && !inline && !opts.preview && shortcutMatches(shortcut, e)) {
      e.preventDefault();
      if (isOpen) close();
      else open();
    }
  };
  document.addEventListener("keydown", onDocKey);
  media.addEventListener("change", render);

  if (remote) render();
  else {
    fetch(`${api}/v1/${encodeURIComponent(opts.project)}/widget`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: Remote) => {
        remote = { ...json, widget: { ...DEFAULTS, ...json.widget } };
        render();
      })
      .catch(() => {
        if (inline) root.innerHTML = `<p class="error" style="margin:16px">This report form isn't available right now.</p>`;
        console.warn("[Issueit] Couldn't load the widget for project", opts.project);
      });
  }

  return {
    open,
    close,
    update(config, extra) {
      if (remote) remote = { ...remote, widget: { ...DEFAULTS, ...config }, ...(extra?.emailUpdates !== undefined ? { emails: { updates: extra.emailUpdates } } : {}) };
      render();
    },
    /** Dashboard preview only: show the launcher alone, the form, or the thank-you. */
    setPreviewState(next) {
      if (closeTimer) window.clearTimeout(closeTimer);
      isOpen = inline || next !== "closed";
      state = next === "done" ? "done" : "form";
      error = "";
      render();
    },
    destroy() {
      if (closeTimer) window.clearTimeout(closeTimer);
      document.removeEventListener("keydown", onDocKey);
      media.removeEventListener("change", render);
      host.remove();
    },
  };
}

/** Black or white text, whichever reads better on the accent. */
function contrast(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

let primary: Instance | null = null;

const Issueit = {
  mount,
  open: () => primary?.open(),
  close: () => primary?.close(),
  identify(user: { email?: string; name?: string }) {
    identity = { ...identity, ...user };
  },
  setMetadata(metadata: Record<string, unknown>) {
    extraMetadata = { ...extraMetadata, ...metadata };
  },
};

(window as unknown as { Issueit: typeof Issueit }).Issueit = Issueit;

if (scriptEl?.dataset.project) {
  const d = scriptEl.dataset;
  const start = () => {
    primary = mount({
      project: d.project!,
      mode: d.mode === "inline" ? "inline" : "button",
      target: d.target ? document.querySelector(d.target) : null,
      source: d.source,
      theme: d.theme as WidgetConfig["theme"] | undefined,
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
