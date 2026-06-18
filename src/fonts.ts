// Self-hosted webfonts (latin + latin-ext subsets only).
//
// We vendor the exact families the UI and canvas use — Inter, Space Grotesk and
// JetBrains Mono — via @fontsource. This drops the render-blocking Google Fonts
// <link> from index.html: the woff2 files are bundled by Vite into dist/assets and
// served same-origin, so the page needs no third-party CDN at runtime. That keeps
// the Content-Security-Policy tight (no fonts.googleapis.com / fonts.gstatic.com
// allowances needed) and removes a network dependency that could block first paint.
//
// Only the weights actually referenced in style.css / render.ts are imported, and
// only the latin + latin-ext subsets, to keep the payload small. Each @fontsource
// file ships `font-display: swap`, so text renders immediately in a fallback and
// upgrades when the webfont arrives.

// Inter — body / general UI (weights 400, 500, 600, 700)
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';

// Space Grotesk — display / headings (weights 500, 600, 700)
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-ext-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-ext-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/space-grotesk/latin-ext-700.css';

// Orbitron — the wordmark + hero/mode titles (the mock's identity face; weights 400/700/900).
// No latin-ext subset is published for Orbitron, so latin only.
import '@fontsource/orbitron/latin-400.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';

// Rajdhani — the condensed display label/stat face the mock uses everywhere (weights 500/600/700).
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-ext-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-ext-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/rajdhani/latin-ext-700.css';

// JetBrains Mono — numerics / mono UI (weights 400, 500, 700)
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-ext-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-ext-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-ext-700.css';
