/** Speaks a change that doesn't move focus, for screen readers. */
let region: HTMLDivElement | null = null;

export function announce(text: string) {
  if (!region) {
    region = document.createElement("div");
    region.className = "sr-only";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  region.textContent = "";
  window.setTimeout(() => {
    if (region) region.textContent = text;
  }, 50);
}
