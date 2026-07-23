(() => {
  const root = document.documentElement;
  const watchedAttributes = ['class', 'data-theme', 'data-color-scheme', 'data-mode'];
  const knownThemeNames = ['data-theme', 'data-color-scheme', 'data-mode'];

  function themeFrom(element) {
    if (!element) return null;
    const values = [
      ...knownThemeNames.map((name) => element.getAttribute?.(name)),
      element.className,
    ].filter(Boolean).join(' ').toLowerCase();
    if (/(^|[\s_-])(dark|night|v-theme--dark)(?=$|[\s_-])/.test(values)) return 'dark';
    if (/(^|[\s_-])(light|day|v-theme--light)(?=$|[\s_-])/.test(values)) return 'light';
    return null;
  }

  function syncTheme() {
    // Only an embedded workbench inherits fnOS desktop's setting. A browser
    // tab is intentionally left to its own prefers-color-scheme preference.
    if (window.top === window) {
      delete root.dataset.fnosTheme;
      return;
    }
    try {
      const hostDocument = window.parent.document;
      // fnOS stores the desktop color scheme as 10 (light) or 20 (dark).
      // Read it from this same-origin application frame before falling back
      // to any host DOM marker used by a particular fnOS release.
      const storedMode = window.localStorage.getItem('fnos-theme-mode');
      const storedTheme = { 10: 'light', 20: 'dark' }[storedMode];
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      // The "follow system" option has a mode value other than 10/20. Do not
      // let the desktop's current light DOM class override that mode.
      const theme = storedMode !== null
        ? (storedTheme || systemTheme)
        : (themeFrom(hostDocument.documentElement) || themeFrom(hostDocument.body) || systemTheme);
      if (theme) root.dataset.fnosTheme = theme;
      else delete root.dataset.fnosTheme;
    } catch (_) {
      delete root.dataset.fnosTheme;
    }
  }

  syncTheme();
  if (window.top !== window) {
    try {
      const hostDocument = window.parent.document;
      const observer = new MutationObserver(syncTheme);
      for (const element of [hostDocument.documentElement, hostDocument.body]) {
        if (element) observer.observe(element, { attributes: true, attributeFilter: watchedAttributes });
      }
    } catch (_) {
      // Cross-origin embeddings use the browser theme as a safe fallback.
    }
    window.addEventListener('storage', (event) => {
      if (event.key === 'fnos-theme-mode') syncTheme();
    });
    window.addEventListener('focus', syncTheme);
  }
})();
