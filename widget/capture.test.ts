import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Recording wraps the page's own fetch, console and history so a report can
 * say what happened before it. Wrapping someone else's page is a loan, so
 * this checks it gets given back: when nothing is mounted any more, and when
 * the project's settings say it was never wanted. The one case it must not
 * "tidy" is a wrapper somebody else added on top of ours — unhooking that
 * would break the page rather than leave it alone.
 */
type Capture = { console: boolean; network: boolean; steps: boolean };
type Widget = {
  startCapture(): void;
  stopEverything(): void;
  honourSettings(w: never): void;
  forgetSettings(w: never | null): void;
  recording: Capture;
};

let widget: Widget;
let page: Record<string, any>;
const originalFetch = () => Promise.resolve("original");

/** What the page looked like before anything was wrapped. */
let untouched: { open: unknown; send: unknown; error: unknown; pushState: unknown };

/**
 * Every listener still registered, so a leak shows up as a number. Matched
 * on the pair, because one function can listen for two different events —
 * the same handler covers popstate and hashchange.
 */
const listeners: Array<{ type: string; fn: unknown }> = [];
const register = (type: string, fn: unknown) => {
  listeners.push({ type, fn });
};
const unregister = (type: string, fn: unknown) => {
  const at = listeners.findIndex((l) => l.type === type && l.fn === fn);
  if (at >= 0) listeners.splice(at, 1);
};

/** The project's three capture switches, as the widget's settings carry them. */
const settings = (capture: Capture) => ({ captureConsole: capture.console, captureNetwork: capture.network, captureSteps: capture.steps }) as never;

beforeAll(async () => {
  page = globalThis as Record<string, any>;
  page.location = new URL("https://shop.example.com/checkout");
  page.document = {
    currentScript: { src: "https://cdn.issueit.app/widget.js", dataset: { capture: "off" } },
    addEventListener: register,
    removeEventListener: unregister,
  };
  page.addEventListener = register;
  page.removeEventListener = unregister;
  page.history = { pushState: () => {}, replaceState: () => {} };
  page.XMLHttpRequest = class {
    open() {}
    send() {}
  };
  page.window = page;
  page.fetch = originalFetch;
  untouched = { open: page.XMLHttpRequest.prototype.open, send: page.XMLHttpRequest.prototype.send, error: console.error, pushState: page.history.pushState };
  widget = (await import("./widget")) as unknown as Widget;
});

// No test may leave the recorder running, or the next one inherits its state.
afterEach(() => widget.stopEverything());

describe("giving the page back its own functions", () => {
  it("wraps fetch, console, history and XHR while it records", () => {
    widget.startCapture();

    expect(page.fetch).not.toBe(originalFetch);
    expect(page.XMLHttpRequest.prototype.open).not.toBe(untouched.open);
    expect(console.error).not.toBe(untouched.error);
    expect(page.history.pushState).not.toBe(untouched.pushState);
    expect(listeners.length).toBeGreaterThan(0);

    widget.stopEverything();

    // Everything back as it was, so destroying the widget really stops it.
    expect(page.fetch).toBe(originalFetch);
    expect(page.XMLHttpRequest.prototype.open).toBe(untouched.open);
    expect(page.XMLHttpRequest.prototype.send).toBe(untouched.send);
    expect(console.error).toBe(untouched.error);
    expect(page.history.pushState).toBe(untouched.pushState);
    expect(listeners.length).toBe(0);
  });

  it("doesn't pile up listeners over a mount, destroy, mount again", () => {
    widget.startCapture();
    const installed = listeners.length;
    widget.stopEverything();
    widget.startCapture();
    expect(listeners.length).toBe(installed);
  });

  it("records again after a remount, rather than staying quietly switched off", () => {
    widget.startCapture();
    widget.honourSettings(settings({ console: true, network: false, steps: true }));
    widget.stopEverything();

    widget.startCapture();
    expect(widget.recording).toEqual({ console: true, network: true, steps: true });
  });

  it("leaves a wrapper that arrived after ours alone", () => {
    widget.startCapture();
    const ours = page.fetch;
    // Some other library wraps fetch after we did; ours is now mid-chain.
    const theirs = (...args: unknown[]) => (ours as (...a: unknown[]) => unknown)(...args);
    page.fetch = theirs;

    widget.stopEverything();

    // Putting the original back here would drop their wrapper off the page.
    expect(page.fetch).toBe(theirs);
    page.fetch = originalFetch;
  });

  it("can be stopped twice without taking anything else with it", () => {
    widget.startCapture();
    widget.stopEverything();
    widget.stopEverything();
    expect(page.fetch).toBe(originalFetch);
  });
});

describe("what the project asked for", () => {
  it("stops recording what the project doesn't want, and keeps what it does", () => {
    widget.startCapture();
    widget.honourSettings(settings({ console: true, network: false, steps: false }));

    expect(widget.recording.console).toBe(true);
    expect(widget.recording.network).toBe(false);
    expect(widget.recording.steps).toBe(false);
    // Nothing from the network list will ever be sent, so fetch and XHR go straight back.
    expect(page.fetch).toBe(originalFetch);
    expect(page.XMLHttpRequest.prototype.open).toBe(untouched.open);
    // Console is still wanted, so that wrapper stays on.
    expect(console.error).not.toBe(untouched.error);
  });

  it("keeps a kind while any widget on the page still wants it", () => {
    widget.startCapture();
    const generous = settings({ console: true, network: true, steps: true });
    const strict = settings({ console: true, network: false, steps: false });

    widget.honourSettings(generous);
    widget.honourSettings(strict);

    // The stricter project answering second mustn't empty the first one's reports.
    expect(widget.recording.network).toBe(true);
    expect(widget.recording.steps).toBe(true);

    // With the generous one destroyed, nobody is asking for requests any more.
    widget.forgetSettings(generous);
    expect(widget.recording.network).toBe(false);
    expect(widget.recording.console).toBe(true);
  });

  it("leaves everything alone until a project has actually answered", () => {
    widget.startCapture();
    widget.forgetSettings(null);
    expect(widget.recording).toEqual({ console: true, network: true, steps: true });
  });
});
