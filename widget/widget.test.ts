import { beforeAll, describe, expect, it } from "vitest";

/**
 * The widget builds its markup out of settings it fetched over the network,
 * so cleanConfig is what stands between a template and whatever the other
 * end sent. These check it on the values that would matter: ones that would
 * break out of an attribute, and ones that would run if clicked.
 *
 * The module reads the page at load, so just enough of one is stubbed first.
 * data-capture="off" keeps it from wrapping this process's own console, and
 * no data-project means it doesn't try to mount itself.
 */
let cleanConfig: (raw: unknown) => Record<string, unknown>;

beforeAll(async () => {
  const page = globalThis as Record<string, unknown>;
  page.location = new URL("https://shop.example.com/checkout");
  page.document = { currentScript: { src: "https://cdn.issueit.app/widget.js", dataset: { capture: "off" } } };
  page.window = page;
  ({ cleanConfig } = (await import("./widget")) as unknown as { cleanConfig: typeof cleanConfig });
});

describe("settings off the wire", () => {
  it("only lets a field be one of the types the form knows", () => {
    const fields = cleanConfig({
      customFields: [
        { key: "order", label: "Order", type: 'text" onfocus="alert(1)', required: false },
        { key: "size", label: "Size", type: "select", required: true, options: ["S", "M"] },
      ],
    }).customFields as Array<Record<string, unknown>>;
    // Nothing that isn't a known type survives to be interpolated into type="…".
    expect(fields[0].type).toBe("text");
    expect(fields[1].type).toBe("select");
  });

  it("drops a field whose key couldn't be a form name", () => {
    const fields = cleanConfig({
      customFields: [{ key: 'x" autofocus onfocus="alert(1)', label: "X", type: "text" }, { key: "ok", label: "OK", type: "text" }],
    }).customFields as Array<Record<string, unknown>>;
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe("ok");
  });

  it("refuses a privacy link that would run instead of open", () => {
    expect(cleanConfig({ privacyUrl: "javascript:alert(document.cookie)" }).privacyUrl).toBeNull();
    expect(cleanConfig({ privacyUrl: "data:text/html,<script>x</script>" }).privacyUrl).toBeNull();
    expect(cleanConfig({ privacyUrl: "https://example.com/privacy" }).privacyUrl).toBe("https://example.com/privacy");
  });

  it("takes the logo only from a path the API minted", () => {
    expect(cleanConfig({ logo: "/v1/prj_abc/logo?v=ff00aa" }).logo).toBe("/v1/prj_abc/logo?v=ff00aa");
    expect(cleanConfig({ logo: "https://evil.example/x.svg" }).logo).toBeNull();
    expect(cleanConfig({ logo: '/v1/prj_abc/logo?v=a" onerror="alert(1)' }).logo).toBeNull();
  });

  it("falls back to the default for anything it doesn't recognise", () => {
    const w = cleanConfig({ position: "middle-nowhere", buttonSize: 'md" data-x="', theme: "neon", accent: "red", shortcut: "mod+shift+b" });
    expect(w.position).toBe("bottom-right");
    expect(w.buttonSize).toBe("md");
    expect(w.theme).toBe("auto");
    expect(w.accent).toBeNull();
    expect(w.shortcut).toBe("mod+shift+b");
  });

  it("keeps a number a number, since the offsets go into a style attribute", () => {
    const w = cleanConfig({ offsetX: '18px;position:fixed;background:url("x")', offsetY: 10_000, radius: -5, maxFiles: 999 });
    expect(w.offsetX).toBe(18);
    expect(w.offsetY).toBe(200);
    expect(w.radius).toBe(0);
    expect(w.maxFiles).toBe(20);
  });

  it("passes ordinary settings through unchanged", () => {
    const w = cleanConfig({ title: "Tell us what broke", accent: "#3f6fb5", categories: ["Bug", "Idea"], captureNetwork: false, panelWidth: 420 });
    expect(w.title).toBe("Tell us what broke");
    expect(w.accent).toBe("#3f6fb5");
    expect(w.categories).toEqual(["Bug", "Idea"]);
    expect(w.captureNetwork).toBe(false);
    expect(w.panelWidth).toBe(420);
  });

  it("survives settings that aren't settings at all", () => {
    for (const raw of [null, undefined, "nope", 7, [], { customFields: "lots", categories: { a: 1 } }]) {
      expect(cleanConfig(raw).title, JSON.stringify(raw)).toBe("Report a bug");
    }
  });
});
