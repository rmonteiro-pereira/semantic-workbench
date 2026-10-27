// Applies the stored light or dark choice before the first paint, so a dark page never flashes
// light. It runs as a plain script in the page head. Its key and values match
// src/app/theme/theme-preference.ts.
try {
  var stored = localStorage.getItem('workbench.theme');
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }
} catch (error) {
  // Blocked storage leaves the page on the system setting.
}
