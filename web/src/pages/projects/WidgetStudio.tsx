import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, describeError } from "../../lib/api";
import { useUsage } from "../../lib/queries";
import { useOrg } from "../../lib/session";
import type { FieldMode, Priority, WidgetConfig, WidgetField, WidgetPosition } from "../../lib/types";
import { Button, ButtonLink, IconButton } from "../../components/ui/Button";
import { CodeBlock, copyText } from "../../components/ui/Copy";
import { Segmented, Slider, Switch } from "../../components/ui/controls";
import { confirm, Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Field";
import { Callout } from "../../components/ui/feedback";
import {
  AddIcon,
  AltArrowDownIcon,
  ExportIcon,
  ImportIcon,
  MagicWandIcon,
  MenuDotsIcon,
  MonitorIcon,
  SmartphoneIcon,
  SquareArrowRightUpIcon,
  TrashBin2Icon,
  UndoLeftIcon,
} from "../../components/ui/icons";
import { Menu } from "../../components/ui/Menu";
import { SetGroup, SetRow } from "../../components/ui/layout";
import { toast, toastError } from "../../components/ui/Toast";
import { useProjectContext } from "./ProjectLayout";
import { widgetSnippet } from "./snippets";

/* ------------------------------------------------------------------ model */

export const widgetDefaults: WidgetConfig = {
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

const presets: Array<{ id: string; name: string; hint: string; config: Partial<WidgetConfig> }> = [
  { id: "minimal", name: "Minimal", hint: "A title and nothing else to fill in.", config: { collectEmail: "off", allowScreenshot: false, descriptionLabel: "Anything else?", footerNote: "" } },
  {
    id: "qa",
    name: "QA team",
    hint: "Priority, type, steps to reproduce and build.",
    config: {
      buttonLabel: "Log a bug",
      askPriority: true,
      categories: ["Bug", "Visual glitch", "Performance", "Crash"],
      categoryLabel: "Kind of problem",
      collectName: "optional",
      descriptionRequired: true,
      descriptionLabel: "What happened",
      customFields: [
        { key: "steps", label: "Steps to reproduce", type: "textarea", required: false, placeholder: "1. Go to…\n2. Click…" },
        { key: "build", label: "Build or version", type: "text", required: false, placeholder: "e.g. 2.14.0" },
      ],
      environment: "staging",
      shortcut: "mod+shift+b",
    },
  },
  {
    id: "feedback",
    name: "Customer feedback",
    hint: "Friendly words, ideas as well as bugs.",
    config: {
      buttonLabel: "Feedback",
      buttonIcon: "chat",
      title: "Send feedback",
      titleLabel: "What's on your mind?",
      titlePlaceholder: "A sentence is plenty",
      descriptionLabel: "Tell us more",
      submitLabel: "Send",
      successTitle: "Thank you",
      successMessage: "We read every message.",
      categories: ["Something's broken", "Idea", "Question"],
      categoryLabel: "This is about",
    },
  },
  { id: "support", name: "Help button", hint: "A round help button on the right edge.", config: { buttonIcon: "help", buttonStyle: "icon", buttonLabel: "Get help", position: "middle-right", offsetX: 14, title: "Get help" } },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "field";

/** Accepts exported settings: only known keys, and only values of the right type. */
function fromJson(text: string): WidgetConfig {
  const raw = JSON.parse(text);
  const source = raw && typeof raw === "object" && "widget" in raw ? raw.widget : raw;
  if (!source || typeof source !== "object") throw new Error("That isn't a widget configuration.");
  const out: Record<string, unknown> = { ...widgetDefaults };
  for (const [k, v] of Object.entries(source)) {
    if (!(k in widgetDefaults)) continue;
    const d = (widgetDefaults as Record<string, unknown>)[k];
    if (d === null || typeof v === typeof d || (Array.isArray(d) && Array.isArray(v))) out[k] = v;
  }
  return out as WidgetConfig;
}

/* ------------------------------------------------------------------ preview */

type WidgetInstance = { update(c: WidgetConfig, extra?: { emailUpdates?: boolean }): void; setPreviewState(s: PreviewState): void; destroy(): void };
type IssueitGlobal = { mount(opts: unknown): WidgetInstance };
type PreviewState = "closed" | "form" | "done";

const pageDoc = (dark: boolean, hosted: boolean, projectName: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:${dark ? "#121212" : "#f4f4f2"};color:${dark ? "#ddd" : "#222"};overflow:hidden}
  .nav{display:flex;align-items:center;gap:14px;height:46px;padding:0 20px;border-bottom:1px solid ${dark ? "#262626" : "#e4e4e0"};background:${dark ? "#181818" : "#fff"}}
  .logo{width:22px;height:22px;border-radius:6px;background:${dark ? "#333" : "#d9d9d4"}}
  .bar{height:8px;border-radius:4px;background:${dark ? "#2a2a2a" : "#e2e2dd"}}
  main{padding:28px 24px;display:grid;gap:14px;max-width:760px}
  .card{height:120px;border-radius:12px;background:${dark ? "#1b1b1b" : "#fff"};border:1px solid ${dark ? "#262626" : "#e8e8e4"}}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .hosted{max-width:520px;margin:0 auto;padding:40px 20px}
  .hosted h1{font-size:21px;margin:0 0 6px}.hosted p{margin:0 0 18px;color:${dark ? "#999" : "#666"}}
  #form{background:${dark ? "#161616" : "#fff"};border:1px solid ${dark ? "#282828" : "#e3e3e3"};border-radius:12px}
</style></head><body>${
  hosted
    ? `<div class="hosted"><p style="margin:0 0 4px;font-size:11.5px">Report a bug</p><h1>${projectName.replace(/[<>&]/g, "")}</h1><p>Tell the team what went wrong. You don't need an account.</p><div id="form"></div></div>`
    : `<div class="nav"><span class="logo"></span><span class="bar" style="width:70px"></span><span class="bar" style="width:50px"></span><span class="bar" style="width:60px"></span></div><main><span class="bar" style="width:40%;height:14px"></span><span class="bar" style="width:70%"></span><div class="grid"><div class="card"></div><div class="card"></div></div><div class="card" style="height:160px"></div></main>`
}<script src="/widget.js"></script></body></html>`;

function Preview({ config, projectId, projectName, emailUpdates }: { config: WidgetConfig; projectId: string; projectName: string; emailUpdates: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const instance = useRef<WidgetInstance | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [page, setPage] = useState<"light" | "dark">("light");
  const [where, setWhere] = useState<"site" | "hosted">("site");
  const [state, setState] = useState<PreviewState>("form");
  const latest = useRef({ config, state, emailUpdates });
  latest.current = { config, state, emailUpdates };
  const doc = useMemo(() => pageDoc(page === "dark", where === "hosted", projectName), [page, where, projectName]);

  // Each page or mode change reloads the frame; the widget mounts once it's ready.
  const onLoad = () => {
    const win = frame.current?.contentWindow as (Window & { Issueit?: IssueitGlobal }) | null;
    if (!win) return;
    let tries = 0;
    const attach = () => {
      if (!win.Issueit) {
        if (tries++ < 50) window.setTimeout(attach, 60);
        return;
      }
      const hosted = where === "hosted";
      instance.current = win.Issueit.mount({
        project: projectId,
        mode: hosted ? "inline" : "button",
        target: hosted ? win.document.getElementById("form") : null,
        theme: latest.current.config.theme === "auto" ? page : undefined,
        preview: { config: latest.current.config, projectName, state: hosted ? "form" : latest.current.state, emailUpdates: latest.current.emailUpdates },
      });
    };
    attach();
  };

  useEffect(() => instance.current?.update(config, { emailUpdates }), [config, emailUpdates]);
  useEffect(() => instance.current?.setPreviewState(state), [state]);
  useEffect(() => () => instance.current?.destroy(), []);

  const hiddenOnMobile = device === "mobile" && config.hideOnMobile && where === "site";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<"site" | "hosted">
          ariaLabel="Where"
          value={where}
          onChange={(v) => {
            instance.current = null;
            setWhere(v);
          }}
          options={[
            { value: "site", label: "On your site" },
            { value: "hosted", label: "Hosted form" },
          ]}
        />
        {where === "site" && (
          <Segmented<PreviewState>
            ariaLabel="State"
            value={state}
            onChange={setState}
            options={[
              { value: "closed", label: "Button" },
              { value: "form", label: "Form" },
              { value: "done", label: "Sent" },
            ]}
          />
        )}
        <span className="ml-auto" />
        <Segmented<"light" | "dark">
          ariaLabel="Page colour"
          value={page}
          onChange={(v) => {
            instance.current = null;
            setPage(v);
          }}
          options={[
            { value: "light", label: "Light page" },
            { value: "dark", label: "Dark page" },
          ]}
        />
        <IconButton size="sm" icon={device === "desktop" ? SmartphoneIcon : MonitorIcon} label={device === "desktop" ? "Preview on a phone" : "Preview on a desktop"} onClick={() => setDevice(device === "desktop" ? "mobile" : "desktop")} />
      </div>
      <div className="studio-stage" data-device={device}>
        <iframe
          key={`${where}-${page}`}
          ref={frame}
          title="Widget preview"
          className="studio-frame"
          srcDoc={doc}
          onLoad={onLoad}
          style={device === "mobile" ? { width: 375, height: 667 } : undefined}
        />
      </div>
      <p className="hint">
        {hiddenOnMobile
          ? "The button is hidden on small screens with your current settings. Issueit.open() still works."
          : "The preview never sends anything. Page rules and the keyboard shortcut only apply on your site."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ editor pieces */

const positions: WidgetPosition[] = ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"];

function PositionPicker({ value, onChange }: { value: WidgetPosition; onChange: (p: WidgetPosition) => void }) {
  return (
    <div className="pos-picker" role="radiogroup" aria-label="Position">
      {positions.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} aria-label={p.replace("-", " ")} className="pos-picker__spot" data-pos={p} onClick={() => onChange(p)} />
      ))}
    </div>
  );
}

function ModeControl({ value, onChange, label }: { value: FieldMode; onChange: (v: FieldMode) => void; label: string }) {
  return (
    <Segmented<FieldMode>
      ariaLabel={label}
      value={value}
      onChange={onChange}
      options={[
        { value: "off", label: "Don't ask" },
        { value: "optional", label: "Optional" },
        { value: "required", label: "Required" },
      ]}
    />
  );
}

/** Text that saves into the draft as you type. */
function TextRow({ label, hint, value, onChange, max, placeholder, wide }: { label: string; hint?: ReactNode; value: string; onChange: (v: string) => void; max: number; placeholder?: string; wide?: boolean }) {
  return (
    <SetRow label={label} hint={hint}>
      <Input size_="sm" aria-label={label} className={wide ? "!w-[260px]" : "!w-[200px]"} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </SetRow>
  );
}

function FieldEditor({ field, onChange, onRemove, onMove, first, last, keys }: { field: WidgetField; onChange: (f: WidgetField) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean; keys: string[] }) {
  const clash = keys.filter((k) => k === field.key).length > 1;
  return (
    <div className="studio-field">
      <div className="flex items-center gap-2">
        <Input size_="sm" aria-label="Question" placeholder="Question" className="flex-1" value={field.label} maxLength={80} onChange={(e) => onChange({ ...field, label: e.target.value })} />
        <Select
          small
          aria-label="Answer type"
          className="!w-[120px]"
          value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value as WidgetField["type"] })}
          options={[
            { value: "text", label: "Short text" },
            { value: "textarea", label: "Long text" },
            { value: "select", label: "Choice" },
            { value: "checkbox", label: "Tick box" },
            { value: "email", label: "Email" },
            { value: "url", label: "Web address" },
            { value: "number", label: "Number" },
          ]}
        />
        <Menu
          trigger={<IconButton size="sm" icon={MenuDotsIcon} label={`Options for ${field.label || "field"}`} />}
          items={[
            ...(!first ? [{ label: "Move up", onSelect: () => onMove(-1) }] : []),
            ...(!last ? [{ label: "Move down", onSelect: () => onMove(1) }] : []),
            "separator" as const,
            { label: "Remove", icon: TrashBin2Icon, danger: true, onSelect: onRemove },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field.type !== "checkbox" && <Input size_="sm" aria-label="Placeholder" placeholder="Placeholder (optional)" value={field.placeholder ?? ""} maxLength={120} onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })} />}
        <Input size_="sm" aria-label="Help text" placeholder="Help text (optional)" value={field.help ?? ""} maxLength={200} onChange={(e) => onChange({ ...field, help: e.target.value || undefined })} />
      </div>
      {field.type === "select" && (
        <Textarea
          aria-label="Choices, one per line"
          placeholder={"Choices, one per line\nChrome\nSafari"}
          className="!min-h-[70px] text-xs"
          value={(field.options ?? []).join("\n")}
          onChange={(e) => onChange({ ...field, options: e.target.value.split("\n").map((s) => s.trimStart()).slice(0, 30) })}
        />
      )}
      <div className="flex items-center gap-3 text-xs text-text-3">
        <label className="checkbox">
          <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
          <span>Required</span>
        </label>
        <span className="ml-auto inline-flex items-center gap-1.5">
          Sent as
          <Input
            size_="sm"
            aria-label="Metadata key"
            className={`mono !w-[130px] ${clash ? "!border-danger" : ""}`}
            value={field.key}
            maxLength={40}
            onChange={(e) => onChange({ ...field, key: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
          />
        </span>
      </div>
      {clash && <p className="field__error">Another field already uses this key.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

type Section = "launcher" | "look" | "brand" | "words" | "fields" | "files" | "behaviour" | "install";
const sections: Array<{ id: Section; label: string }> = [
  { id: "launcher", label: "Button" },
  { id: "look", label: "Look" },
  { id: "brand", label: "Brand" },
  { id: "words", label: "Words" },
  { id: "fields", label: "Fields" },
  { id: "files", label: "Attachments" },
  { id: "behaviour", label: "Behaviour" },
  { id: "install", label: "Install" },
];

export function WidgetStudio() {
  const { project, links } = useProjectContext();
  const { orgId, path } = useOrg();
  const qc = useQueryClient();
  const usage = useUsage();
  const saved = useMemo(() => ({ ...widgetDefaults, ...project.widget }), [project.widget]);
  const [draft, setDraft] = useState<WidgetConfig>(saved);
  const [section, setSection] = useState<Section>("launcher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const maxFiles = usage.data?.limits.attachmentsPerReport ?? 5;
  const emailUpdates = project.emails.enabled && (project.emails.receipt || project.emails.resolved);

  /** Logos are files, so they apply straight away rather than waiting for Save. */
  const uploadLogo = async (file: File) => {
    if (file.size > 512 * 1024) return toastError("Use a logo under 512 KB.");
    setLogoBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const out = await api<{ logo: string }>(path(`/projects/${project.id}/logo`), { body: { data } });
      setDraft((d) => ({ ...d, logo: out.logo }));
      await qc.invalidateQueries({ queryKey: ["org", orgId, "projects", project.id] });
      toast("Logo uploaded. It's live on your site now.");
    } catch (err) {
      toastError(describeError(err, "Couldn't upload the logo."));
    } finally {
      setLogoBusy(false);
      if (logoInput.current) logoInput.current.value = "";
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      await api(path(`/projects/${project.id}/logo`), { method: "DELETE" });
      setDraft((d) => ({ ...d, logo: null, buttonIcon: d.buttonIcon === "logo" ? "bug" : d.buttonIcon }));
      await qc.invalidateQueries({ queryKey: ["org", orgId, "projects", project.id] });
      toast("Removed the logo");
    } catch (err) {
      toastError(describeError(err, "Couldn't remove the logo."));
    } finally {
      setLogoBusy(false);
    }
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const list = (text: string) =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  // Picks up saves made elsewhere, unless you're in the middle of editing.
  useEffect(() => {
    if (!dirty) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const clean: WidgetConfig = {
      ...draft,
      buttonLabel: draft.buttonLabel.trim() || widgetDefaults.buttonLabel,
      categories: draft.categories.map((c) => c.trim()).filter(Boolean),
      customFields: draft.customFields.map((f) => ({ ...f, label: f.label.trim(), options: f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
      maxFiles: Math.min(draft.maxFiles, maxFiles),
      environment: draft.environment?.trim() || null,
      privacyUrl: draft.privacyUrl?.trim() || null,
      shortcut: draft.shortcut?.trim() || null,
    };
    try {
      await api(path(`/projects/${project.id}`), { method: "PATCH", body: { widget: clean, replaceWidget: true } });
      await qc.invalidateQueries({ queryKey: ["org", orgId, "projects", project.id] });
      toast("Widget saved. Sites pick it up within a minute.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (await confirm({ title: "Discard your changes?", message: "The widget goes back to how it was last saved.", confirmLabel: "Discard", danger: true })) setDraft(saved);
  };

  const applyPreset = (preset: (typeof presets)[number]) => {
    setDraft({ ...widgetDefaults, accent: draft.accent, theme: draft.theme, ...preset.config });
    toast(`Applied ${preset.name}. Save to publish it.`, { label: "Undo", run: () => setDraft(draft) });
  };

  const exportJson = JSON.stringify(draft, null, 2);
  const fieldKeys = draft.customFields.map((f) => f.key);
  const fieldsInvalid = draft.customFields.some((f) => !f.label.trim() || !f.key || (f.type === "select" && !(f.options ?? []).some((o) => o.trim()))) || new Set(fieldKeys).size !== fieldKeys.length;

  return (
    <div className="page-body studio">
      <div className="studio-bar">
        <Menu
          align="start"
          trigger={
            <Button size="sm" icon={MagicWandIcon}>
              Presets
              <AltArrowDownIcon size={12} />
            </Button>
          }
          items={presets.map((p) => ({ label: `${p.name} - ${p.hint}`, onSelect: () => applyPreset(p) }))}
        />
        <Menu
          align="start"
          trigger={<IconButton size="sm" icon={MenuDotsIcon} label="More" />}
          items={[
            { label: "Copy settings as JSON", icon: ExportIcon, onSelect: () => copyText(exportJson, "widget settings") },
            {
              label: "Import settings…",
              icon: ImportIcon,
              onSelect: () => {
                setImportText("");
                setImportError(null);
                setImporting(true);
              },
            },
            "separator",
            { label: "Reset to defaults", icon: UndoLeftIcon, onSelect: () => setDraft(widgetDefaults) },
          ]}
        />
        <span className="ml-auto text-xs text-text-3">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button size="sm" variant="quiet" disabled={!dirty || busy} onClick={discard}>
          Discard
        </Button>
        <Button size="sm" variant="primary" busy={busy} disabled={!dirty || fieldsInvalid} onClick={save}>
          Save and publish
        </Button>
      </div>

      {!project.publicSubmissions && (
        <Callout tone="warning" title="Public reports are off">
          The widget and hosted form won't accept reports until you turn public reports back on in{" "}
          <Link to={`/projects/${project.id}/settings`} className="underline underline-offset-2">
            Settings
          </Link>
          .
        </Callout>
      )}
      {error ? <Callout tone="danger">{describeError(error, "Couldn't save the widget.")}</Callout> : null}

      <div className="studio-grid">
        <div className="min-w-0">
          <nav className="studio-nav" role="tablist" aria-label="Widget settings">
            {sections.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>
                {s.label}
              </button>
            ))}
          </nav>

          {section === "launcher" && (
            <>
              <SetGroup title="Button">
                <SetRow label="Show the button" hint="Turn off to open the form only from your own button with Issueit.open().">
                  <Switch label="Show the button" checked={draft.showButton} onChange={(v) => set("showButton", v)} />
                </SetRow>
                <TextRow label="Label" hint="Keep it short; it sits on top of your page." value={draft.buttonLabel} max={40} onChange={(v) => set("buttonLabel", v)} />
                <SetRow label="Icon">
                  <Segmented
                    ariaLabel="Icon"
                    value={draft.buttonIcon}
                    onChange={(v) => set("buttonIcon", v)}
                    options={[
                      { value: "bug", label: "Bug" },
                      { value: "chat", label: "Chat" },
                      { value: "flag", label: "Flag" },
                      { value: "help", label: "Help" },
                      ...(draft.logo ? [{ value: "logo" as const, label: "Logo" }] : []),
                      { value: "none", label: "None" },
                    ]}
                  />
                </SetRow>
                <SetRow label="Shape" hint={draft.buttonStyle === "icon" ? "The label is still read out by screen readers." : undefined}>
                  <Segmented
                    ariaLabel="Shape"
                    value={draft.buttonStyle}
                    onChange={(v) => set("buttonStyle", v)}
                    options={[
                      { value: "pill", label: "Pill" },
                      { value: "square", label: "Rounded" },
                      { value: "icon", label: "Icon only" },
                    ]}
                  />
                </SetRow>
                <SetRow label="Size">
                  <Segmented
                    ariaLabel="Size"
                    value={draft.buttonSize}
                    onChange={(v) => set("buttonSize", v)}
                    options={[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Medium" },
                      { value: "lg", label: "Large" },
                    ]}
                  />
                </SetRow>
              </SetGroup>
              <SetGroup title="Placement">
                <SetRow label="Position" hint={`${draft.position.replace("-", " ").replace(/^./, (c) => c.toUpperCase())}. The form opens beside the button.`}>
                  <PositionPicker value={draft.position} onChange={(v) => set("position", v)} />
                </SetRow>
                <SetRow label="Distance from the side">
                  <Slider label="Distance from the side" value={draft.offsetX} min={0} max={120} unit="px" onChange={(v) => set("offsetX", v)} />
                </SetRow>
                {!draft.position.startsWith("middle") && (
                  <SetRow label={`Distance from the ${draft.position.split("-")[0]}`}>
                    <Slider label="Distance from the edge" value={draft.offsetY} min={0} max={120} unit="px" onChange={(v) => set("offsetY", v)} />
                  </SetRow>
                )}
              </SetGroup>
            </>
          )}

          {section === "look" && (
            <>
              <SetGroup title="Colour">
                <SetRow label="Theme" hint="Automatic follows each visitor's system setting.">
                  <Segmented
                    ariaLabel="Theme"
                    value={draft.theme}
                    onChange={(v) => set("theme", v)}
                    options={[
                      { value: "auto", label: "Automatic" },
                      { value: "light", label: "Light" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </SetRow>
                <SetRow label="Accent colour" hint={draft.accent ? "Used for the button and the send action. Text picks black or white to stay readable." : "Greyscale, to sit quietly on any site."}>
                  <div className="flex items-center gap-1.5">
                    {["#2a78d6", "#6250d6", "#1baf7a", "#eb6834", "#e34948"].map((c) => (
                      <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Use ${c}`} aria-pressed={draft.accent === c} onClick={() => set("accent", c)} />
                    ))}
                    <input type="color" aria-label="Custom accent colour" value={draft.accent ?? "#1c1c1c"} onChange={(e) => set("accent", e.target.value)} className="h-[26px] w-9 rounded border border-border bg-transparent p-0.5" />
                    {draft.accent && <IconButton size="sm" icon={UndoLeftIcon} label="Back to greyscale" onClick={() => set("accent", null)} />}
                  </div>
                </SetRow>
              </SetGroup>
              <SetGroup title="Shape and type">
                <SetRow label="Corner radius">
                  <Slider label="Corner radius" value={draft.radius} min={0} max={24} unit="px" onChange={(v) => set("radius", v)} />
                </SetRow>
                <SetRow label="Form width" hint="Phones always use the screen's width.">
                  <Slider label="Form width" value={draft.panelWidth} min={300} max={560} step={10} unit="px" onChange={(v) => set("panelWidth", v)} />
                </SetRow>
                <SetRow label="Shadow">
                  <Segmented
                    ariaLabel="Shadow"
                    value={draft.shadow}
                    onChange={(v) => set("shadow", v)}
                    options={[
                      { value: "none", label: "None" },
                      { value: "soft", label: "Soft" },
                      { value: "strong", label: "Strong" },
                    ]}
                  />
                </SetRow>
                <SetRow label="Font" hint="Your site's font is read from the page the widget is on.">
                  <Segmented
                    ariaLabel="Font"
                    value={draft.font}
                    onChange={(v) => set("font", v)}
                    options={[
                      { value: "system", label: "Issueit" },
                      { value: "inherit", label: "Your site's" },
                    ]}
                  />
                </SetRow>
                <SetRow label="Dim the page" hint="Darken the page behind the open form.">
                  <Switch label="Dim the page" checked={draft.backdrop} onChange={(v) => set("backdrop", v)} />
                </SetRow>
              </SetGroup>
            </>
          )}

          {section === "brand" && (
            <>
              <SetGroup title="Your brand">
                <SetRow label="Logo" hint={draft.logo ? "Shown above the form's heading, on the hosted form and in emails to reporters." : "PNG, JPEG, WebP or GIF, up to 512 KB. A wide logo about 28px tall works best."}>
                  <div className="flex items-center gap-2">
                    {draft.logo && <img src={draft.logo} alt="" className="h-7 max-w-[120px] object-contain rounded-sm bg-sunken" />}
                    <input
                      ref={logoInput}
                      type="file"
                      hidden
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadLogo(file);
                      }}
                    />
                    <Button size="sm" busy={logoBusy} onClick={() => logoInput.current?.click()}>
                      {draft.logo ? "Replace…" : "Upload…"}
                    </Button>
                    {draft.logo && <IconButton size="sm" icon={TrashBin2Icon} label="Remove the logo" disabled={logoBusy} onClick={removeLogo} />}
                  </div>
                </SetRow>
                <TextRow
                  label="Brand name"
                  hint={draft.brandName ? "Used in the form's label, the thank-you message and emails." : `Empty uses the project's name, ${project.name}.`}
                  value={draft.brandName}
                  max={60}
                  placeholder={project.name}
                  onChange={(v) => set("brandName", v)}
                />
                <SetRow label="Header" hint={draft.headerStyle === "filled" ? (draft.accent ? "Filled with your accent colour." : "Filled in dark grey. Set an accent colour under Look to use yours.") : "Plain, like the rest of the form."}>
                  <Segmented
                    ariaLabel="Header"
                    value={draft.headerStyle}
                    onChange={(v) => set("headerStyle", v)}
                    options={[
                      { value: "plain", label: "Plain" },
                      { value: "filled", label: "Filled" },
                    ]}
                  />
                </SetRow>
              </SetGroup>
              <SetGroup title="Issueit">
                <SetRow label="Powered by Issueit" hint="A small link under the form and in reporter emails.">
                  <Switch label="Powered by Issueit" checked={draft.poweredBy} onChange={(v) => set("poweredBy", v)} />
                </SetRow>
              </SetGroup>
            </>
          )}

          {section === "words" && (
            <>
              <SetGroup title="Form">
                <TextRow label="Heading" value={draft.title} max={60} onChange={(v) => set("title", v)} />
                <SetRow label="Introduction" hint="A line above the fields. Leave empty for none.">
                  <Textarea aria-label="Introduction" className="!w-[260px] !min-h-[60px]" maxLength={300} value={draft.intro} onChange={(e) => set("intro", e.target.value)} />
                </SetRow>
                <TextRow label="Summary label" value={draft.titleLabel} max={60} onChange={(v) => set("titleLabel", v)} />
                <TextRow label="Summary placeholder" value={draft.titlePlaceholder} max={80} onChange={(v) => set("titlePlaceholder", v)} />
                <TextRow label="Details label" value={draft.descriptionLabel} max={60} onChange={(v) => set("descriptionLabel", v)} />
                <TextRow label="Details placeholder" value={draft.descriptionPlaceholder} max={160} wide onChange={(v) => set("descriptionPlaceholder", v)} />
                <TextRow label="Send button" value={draft.submitLabel} max={30} onChange={(v) => set("submitLabel", v)} />
              </SetGroup>
              <SetGroup title="After sending">
                <TextRow label="Heading" value={draft.successTitle} max={60} onChange={(v) => set("successTitle", v)} />
                <SetRow label="Message" hint="{project} becomes your brand or project name.">
                  <Textarea aria-label="Message" className="!w-[260px] !min-h-[60px]" maxLength={300} value={draft.successMessage} onChange={(e) => set("successMessage", e.target.value)} />
                </SetRow>
                <SetRow label="When it's already known" hint="Added when the report joins one that's still open. Leave empty to say nothing.">
                  <Textarea aria-label="When it's already known" className="!w-[260px] !min-h-[60px]" maxLength={200} value={draft.duplicateMessage} onChange={(e) => set("duplicateMessage", e.target.value)} />
                </SetRow>
              </SetGroup>
              <SetGroup title="Updates by email">
                <TextRow
                  label="Tick box"
                  hint={
                    emailUpdates ? (
                      "Shown under the email field. Ticked to start with."
                    ) : (
                      <>
                        Shown once reporter emails are on in{" "}
                        <Link to={`/projects/${project.id}/settings`} className="underline underline-offset-2">
                          Settings
                        </Link>
                        .
                      </>
                    )
                  }
                  value={draft.updatesLabel}
                  max={80}
                  wide
                  onChange={(v) => set("updatesLabel", v)}
                />
              </SetGroup>
              <SetGroup title="Small print">
                <TextRow label="Note beside the button" hint="Tell people what's sent with their report." value={draft.footerNote} max={200} wide onChange={(v) => set("footerNote", v)} />
                <TextRow label="Privacy link" hint="Adds a Privacy link to the note." value={draft.privacyUrl ?? ""} max={500} placeholder="https://" wide onChange={(v) => set("privacyUrl", v || null)} />
              </SetGroup>
            </>
          )}

          {section === "fields" && (
            <>
              <SetGroup title="Built-in fields">
                <SetRow label="Details required" hint="Make people describe the problem, not just name it.">
                  <Switch label="Details required" checked={draft.descriptionRequired} onChange={(v) => set("descriptionRequired", v)} />
                </SetRow>
                <SetRow label="Name" hint="Skipped when your page calls Issueit.identify().">
                  <ModeControl label="Name" value={draft.collectName} onChange={(v) => set("collectName", v)} />
                </SetRow>
                <SetRow label="Email" hint="Lets you follow up. Required makes it harder for people to report.">
                  <ModeControl label="Email" value={draft.collectEmail} onChange={(v) => set("collectEmail", v)} />
                </SetRow>
                <SetRow label="Ask for priority" hint={draft.askPriority ? "People choose; routing rules use it." : `Every report arrives as ${draft.defaultPriority}.`}>
                  <Select
                    small
                    aria-label="Default priority"
                    className="!w-[110px]"
                    value={draft.defaultPriority}
                    onChange={(e) => set("defaultPriority", e.target.value as Priority)}
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                      { value: "critical", label: "Critical" },
                    ]}
                  />
                  <Switch label="Ask for priority" checked={draft.askPriority} onChange={(v) => set("askPriority", v)} />
                </SetRow>
              </SetGroup>
              <SetGroup title="Categories">
                <SetRow label="Choices" hint="One per line. Sent as metadata.category. Leave empty to not ask.">
                  <Textarea
                    aria-label="Categories, one per line"
                    className="!w-[220px] !min-h-[80px]"
                    placeholder={"Bug\nIdea\nQuestion"}
                    value={draft.categories.join("\n")}
                    onChange={(e) => set("categories", e.target.value.split("\n").slice(0, 20))}
                  />
                </SetRow>
                {draft.categories.some((c) => c.trim()) && <TextRow label="Label" value={draft.categoryLabel} max={40} onChange={(v) => set("categoryLabel", v)} />}
              </SetGroup>
              <section className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="set-group__title !m-0">Your own questions</h2>
                  <Button
                    size="sm"
                    icon={AddIcon}
                    disabled={draft.customFields.length >= 12}
                    onClick={() => {
                      const n = draft.customFields.length + 1;
                      let key = `field_${n}`;
                      while (fieldKeys.includes(key)) key += "_";
                      set("customFields", [...draft.customFields, { key, label: "", type: "text", required: false }]);
                    }}
                  >
                    Add question
                  </Button>
                </div>
                {draft.customFields.length ? (
                  <div className="flex flex-col gap-2">
                    {draft.customFields.map((f, i) => (
                      <FieldEditor
                        key={i}
                        field={f}
                        keys={fieldKeys}
                        first={i === 0}
                        last={i === draft.customFields.length - 1}
                        onChange={(next) => {
                          // A fresh question takes its key from its label until you set one.
                          const auto = f.key === slug(f.label) || /^field_\d+_*$/.test(f.key);
                          const key = auto && next.label !== f.label ? slug(next.label) : next.key;
                          set("customFields", draft.customFields.map((x, j) => (j === i ? { ...next, key } : x)));
                        }}
                        onRemove={() => set("customFields", draft.customFields.filter((_, j) => j !== i))}
                        onMove={(d) => {
                          const arr = [...draft.customFields];
                          [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
                          set("customFields", arr);
                        }}
                      />
                    ))}
                    {fieldsInvalid && <p className="field__error">Every question needs a label and its own key; choices need at least one option.</p>}
                  </div>
                ) : (
                  <p className="text-sm text-text-3 set-group p-4">Ask for a build number, an order id, steps to reproduce - anything. Answers arrive in the report's metadata and go to your destinations.</p>
                )}
              </section>
            </>
          )}

          {section === "files" && (
            <SetGroup title="Attachments">
              <SetRow label="File attachments" hint="Images, video, PDFs, text files and zips.">
                <Switch label="File attachments" checked={draft.allowAttachments} onChange={(v) => set("allowAttachments", v)} />
              </SetRow>
              <SetRow label="Screenshots" hint="Lets people capture their screen. Their browser asks for permission first.">
                <Switch label="Screenshots" checked={draft.allowScreenshot} onChange={(v) => set("allowScreenshot", v)} />
              </SetRow>
              <SetRow label="Most files per report" hint={`This server allows up to ${maxFiles}.`}>
                <Slider label="Most files per report" value={Math.min(draft.maxFiles, maxFiles)} min={1} max={maxFiles} onChange={(v) => set("maxFiles", v)} />
              </SetRow>
            </SetGroup>
          )}

          {section === "behaviour" && (
            <>
              <SetGroup title="Opening and closing">
                <SetRow label="Keyboard shortcut" hint={draft.shortcut ? `${draft.shortcut.replace("mod", "Ctrl/⌘")} opens and closes the form.` : "Off. Try mod+shift+b; mod is ⌘ on a Mac and Ctrl elsewhere."}>
                  <Input size_="sm" aria-label="Keyboard shortcut" className="mono !w-[150px]" placeholder="mod+shift+b" maxLength={40} value={draft.shortcut ?? ""} onChange={(e) => set("shortcut", e.target.value.toLowerCase().replace(/\s/g, "") || null)} />
                </SetRow>
                <SetRow label="Close after sending" hint={draft.autoCloseSeconds ? `Closes ${draft.autoCloseSeconds} seconds after the thank-you appears.` : "Stays open until closed."}>
                  <Slider label="Close after sending" value={draft.autoCloseSeconds} min={0} max={30} unit="s" onChange={(v) => set("autoCloseSeconds", v)} />
                </SetRow>
                <SetRow label="Hide the button on phones" hint="Screens narrower than 640px.">
                  <Switch label="Hide the button on phones" checked={draft.hideOnMobile} onChange={(v) => set("hideOnMobile", v)} />
                </SetRow>
              </SetGroup>
              <SetGroup title="Pages">
                <SetRow label="Only show on" hint="One pattern per line; * matches anything. /app/* matches paths, full addresses match whole URLs. Empty means every page.">
                  <Textarea aria-label="Only show on" className="!w-[220px] !min-h-[70px] mono text-xs" placeholder="/app/*" value={draft.includePages.join("\n")} onChange={(e) => set("includePages", list(e.target.value).slice(0, 30))} />
                </SetRow>
                <SetRow label="Never show on" hint="Wins over the list above.">
                  <Textarea aria-label="Never show on" className="!w-[220px] !min-h-[70px] mono text-xs" placeholder="/checkout/*" value={draft.excludePages.join("\n")} onChange={(e) => set("excludePages", list(e.target.value).slice(0, 30))} />
                </SetRow>
              </SetGroup>
              <SetGroup title="What's sent">
                <SetRow label="Page address and browser details" hint="Browser, OS, screen size, language and referrer. The time zone is always sent so reports show on the map.">
                  <Switch label="Page address and browser details" checked={draft.sendContext} onChange={(v) => set("sendContext", v)} />
                </SetRow>
                <TextRow label="Environment" hint="Tags every report, e.g. production. Routing rules can use it." value={draft.environment ?? ""} max={40} placeholder="Not set" onChange={(v) => set("environment", v || null)} />
              </SetGroup>
              <SetGroup title="What happened before">
                <SetRow label="Console errors" hint="Errors and warnings from the console, and uncaught errors, with stack traces.">
                  <Switch label="Console errors" checked={draft.captureConsole} onChange={(v) => set("captureConsole", v)} />
                </SetRow>
                <SetRow label="Requests" hint="Method, address, status and timing. Never bodies, headers or query values.">
                  <Switch label="Requests" checked={draft.captureNetwork} onChange={(v) => set("captureNetwork", v)} />
                </SetRow>
                <SetRow label="Steps" hint="Clicks, page changes and which fields changed. Never what was typed.">
                  <Switch label="Steps" checked={draft.captureSteps} onChange={(v) => set("captureSteps", v)} />
                </SetRow>
                <p className="hint px-3.5 py-2.5">
                  The last 40 of each, kept in the visitor's browser and sent only with a report. People can untick it on the form. Emails, tokens and card numbers are removed before sending. Add{" "}
                  <span className="mono">data-capture="off"</span> to the script tag to never record on a page.
                </p>
              </SetGroup>
            </>
          )}

          {section === "install" && (
            <>
              <SetGroup title="Install">
                <div className="p-3.5 flex flex-col gap-2.5">
                  <p className="text-sm text-text-2">Paste this before the closing &lt;/body&gt; tag on every page where people should be able to report bugs. Settings you save here apply without changing the snippet.</p>
                  <CodeBlock code={widgetSnippet(project.id, links)} what="widget code" />
                </div>
              </SetGroup>
              <SetGroup title="From your code">
                <div className="p-3.5 flex flex-col gap-2.5">
                  <CodeBlock
                    what="example"
                    code={`// Who's reporting, so you can follow up\nIssueit.identify({ email: user.email, name: user.name });\n\n// Anything else useful, sent with every report\nIssueit.setMetadata({ plan: "pro", build: "2.14.0" });\n\n// Open from your own button or menu\nIssueit.open();`}
                  />
                </div>
              </SetGroup>
              <SetGroup title="Hosted form">
                <SetRow label="A page anyone can use" hint={links.formUrl}>
                  <ButtonLink to={links.formUrl} size="sm" external icon={SquareArrowRightUpIcon}>
                    Open
                  </ButtonLink>
                </SetRow>
              </SetGroup>
            </>
          )}
        </div>

        <div className="studio-preview">
          <Preview config={draft} projectId={project.id} projectName={draft.brandName || project.name} emailUpdates={emailUpdates} />
        </div>
      </div>

      {importing && (
        <Dialog
          open
          onClose={() => setImporting(false)}
          title="Import widget settings"
          description="Paste settings copied from another project. Unknown or invalid values are ignored. Nothing is saved until you save."
          footer={
            <>
              <span className="mr-auto" />
              <Button onClick={() => setImporting(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!importText.trim()}
                onClick={() => {
                  try {
                    setDraft(fromJson(importText));
                    setImporting(false);
                    toast("Imported. Save to publish it.");
                  } catch (err) {
                    setImportError(err instanceof SyntaxError ? "That isn't valid JSON." : (err as Error).message);
                  }
                }}
              >
                Import
              </Button>
            </>
          }
        >
          <Field label="Settings" error={importError ?? undefined}>
            <Textarea className="mono text-xs !min-h-[220px]" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "buttonLabel": "Report a bug", … }' />
          </Field>
        </Dialog>
      )}
    </div>
  );
}
