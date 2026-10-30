import { useState } from "react";
import { IconButton } from "./Button";
import { CheckIcon, CopyIcon, EyeClosedIcon, EyeIcon } from "./icons";
import { toast, toastError } from "./Toast";

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${what}`);
    return true;
  } catch {
    // Clipboard access needs a secure context; fall back to a hidden textarea.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    if (ok) toast(`Copied ${what}`);
    else toastError(`Couldn't copy the ${what}. Select it and copy it yourself.`);
    return ok;
  }
}

export function CopyButton({ text, what, size = "sm" }: { text: string; what: string; size?: "sm" | "md" }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      icon={done ? CheckIcon : CopyIcon}
      label={`Copy ${what}`}
      size={size}
      onClick={async () => {
        if (await copyText(text, what)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }
      }}
    />
  );
}

export function CodeBlock({ code, what = "code" }: { code: string; what?: string }) {
  return (
    <div className="code-block">
      <pre>{code}</pre>
      <CopyButton text={code} what={what} />
    </div>
  );
}

/** A value shown in full with a copy action. For things that aren't secret. */
export function CopyField({ value, what }: { value: string; what: string }) {
  return (
    <div className="input-group">
      <input className="input mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={what} />
      <CopyButton text={value} what={what} size="md" />
    </div>
  );
}

/**
 * Masked by default. Revealing may need a request (the server decrypts on
 * demand), so `reveal` is async; the value is kept only while shown.
 */
export function SecretField({ preview, reveal, what }: { preview: string; reveal: () => Promise<string>; what: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    if (value) return value;
    setBusy(true);
    try {
      const v = await reveal();
      return v;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="input-group">
      <input className="input mono" readOnly value={value ?? preview} aria-label={what} onFocus={(e) => value && e.currentTarget.select()} />
      <IconButton
        icon={value ? EyeClosedIcon : EyeIcon}
        label={value ? `Hide ${what}` : `Show ${what}`}
        busy={busy && !value}
        onClick={async () => {
          if (value) return setValue(null);
          try {
            setValue(await load());
          } catch {
            toastError(`Couldn't show the ${what}.`);
          }
        }}
      />
      <IconButton
        icon={CopyIcon}
        label={`Copy ${what}`}
        onClick={async () => {
          try {
            await copyText(await load(), `${what} (it's a password - keep it private)`);
          } catch {
            toastError(`Couldn't copy the ${what}.`);
          }
        }}
      />
    </div>
  );
}
