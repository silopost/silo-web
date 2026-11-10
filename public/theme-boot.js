// Applies the last colour theme of this browser (src/lib/theme.ts, localStorage "silo.theme")
// before the first paint, so neither the app nor the login screen flashes the default colours.
// A classic script in <head>: the CSP allows only 'self' scripts, not inline ones.
(function () {
  try {
    var theme = localStorage.getItem("silo.theme");
    if (theme && /^[a-z-]{1,32}$/.test(theme)) document.documentElement.dataset.theme = theme;
  } catch (e) {
    // Storage blocked: the default theme.
  }
})();
