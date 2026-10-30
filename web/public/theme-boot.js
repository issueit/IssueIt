// Applies the saved theme before first paint so the page doesn't flash.
(function () {
  try {
    var pref = localStorage.getItem("issueit.theme") || "system";
    var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    var accent = localStorage.getItem("issueit.accent");
    if (accent && accent !== "none") document.documentElement.dataset.accent = accent;
    if (localStorage.getItem("issueit.density") === "compact") document.documentElement.dataset.density = "compact";
  } catch (e) {}
})();
