// Apply the saved theme before first paint to avoid a light flash in dark mode (loaded by index.html).
// Keep the storage key in sync with src/providers/theme-provider.tsx.
try {
  var t = localStorage.getItem('influencehub-theme')
  var dark = t === 'dark' || ((!t || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch {}
