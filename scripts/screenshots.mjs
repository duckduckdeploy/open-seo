// Takes the product screenshots used on the website (apps/web/public/screens), in light and dark.
//
//   SHOT_EMAIL=you@example.com SHOT_PASSWORD=... node scripts/screenshots.mjs [name ...]
//
// Needs the app and API running locally (pnpm dev) with a signed-up account that has a YepAPI
// key, and Chrome or Edge installed (set CHROME_PATH if it is somewhere unusual). Each view runs
// real lookups the first time, so a full run spends a few dollars of YepAPI credit; repeats are
// served from the cache. Pass shot names to retake only those.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.SHOT_APP_URL ?? 'http://localhost:3200';
const OUT = join(import.meta.dirname, '..', 'apps', 'web', 'public', 'screens');
// Sizes of the light images, so the site can reserve their space before they load.
const MANIFEST = join(import.meta.dirname, '..', 'apps', 'web', 'src', 'content', 'screens.json');
const WIDTH = 1440;
const HEIGHT = 900;
const SCALE = 2;
const PORT = 9333;

// sharp comes with Next; resolve it through the web app's Next.
const fromWeb = createRequire(join(import.meta.dirname, '..', 'apps', 'web', 'package.json'));
const sharp = createRequire(fromWeb.resolve('next/package.json'))('sharp');

const chromePath = () =>
  [
    process.env.CHROME_PATH,
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((path) => path && existsSync(path));

// ── Views and their crops ─────────────────────────────────────────────────────
// `crop` runs in the page and returns the element to capture; "viewport" takes the first screen.
// `before` runs first (open a tab, switch a setting). Heights are capped so a crop stays readable.

const kw = '/tools/keyword-overview?q=standing+desk&country=us&lang=en';
const VIEWS = [
  {
    url: kw,
    before: 'authority',
    shots: {
      'keyword-overview': 'viewport',
      'keyword-overview-cards': `heading("h3", "Keyword difficulty").closest(".grid")`,
      'keyword-overview-ideas': `heading("h2", "Keyword ideas").closest("section")`,
      'keyword-overview-serp': `heading("h2", "SERP overview").closest("section")`,
      'search-bar': `document.querySelector("main form")`,
    },
  },
  {
    url: '/tools/keyword-overview?q=dentist&country=us&lang=en&loc=1026201',
    shots: {
      'search-bar-city': `document.querySelector("main form")`,
      'keyword-overview-local': `heading("h3", "Keyword difficulty").closest(".grid")`,
    },
  },
  {
    url: '/tools/keyword-ideas?q=standing+desk&country=us&lang=en',
    shots: { 'keyword-ideas': 'viewport' },
  },
  {
    url: '/tools/serp-checker?q=standing+desk&country=us&lang=en',
    before: 'authority',
    shots: { 'serp-checker': 'viewport', 'serp-checker-table': `heading("h2", "standing desk").closest("section")` },
  },
  {
    url: '/tools/domain-overview?domain=zapier.com&country=us&lang=en',
    shots: {
      'domain-overview': 'viewport',
      'domain-overview-metrics': `text("p", "Domain Rating").closest(".grid")`,
      'domain-overview-positions': `heading("h2", "Organic positions").closest("section")`,
      'domain-overview-keywords': `document.querySelector("[role=tablist]").parentElement`,
    },
  },
  {
    url: '/tools/page-analyser?url=https%3A%2F%2Fzapier.com%2Fblog%2Fbest-note-taking-apps%2F&country=us&lang=en',
    shots: {
      'page-analyser': 'viewport',
      'page-analyser-onpage': `box(text("h2,h3,p", "On-page"))`,
      'page-analyser-keywords': `box(heading("h2", "Keywords this page ranks for"))`,
    },
  },
  {
    url: '/tools/backlink-checker?target=zapier.com',
    shots: {
      'backlinks': 'viewport',
      'backlinks-history': `heading("h2", "History").closest("section")`,
      'backlinks-list': `document.querySelector("[role=tablist]").parentElement`,
    },
  },
  {
    url: '/tools/competitors?domain=zapier.com&country=us&lang=en',
    shots: { 'competitors': 'viewport' },
  },
  {
    url: '/tools/competitors?domain=todoist.com&vs=ticktick.com&country=us&lang=en',
    shots: { 'keyword-gap': `document.querySelector("[role=tablist]").parentElement` },
  },
  // More parts, for the tools' own landing pages.
  {
    url: '/tools/keyword-ideas?q=standing+desk&country=us&lang=en&view=questions',
    shots: { 'keyword-ideas-questions': `document.querySelector('nav[aria-label="Idea lists"]').parentElement` },
  },
  {
    url: '/tools/serp-checker?q=standing+desk&country=us&lang=en&device=mobile',
    before: 'authority',
    shots: { 'serp-checker-mobile': `heading("h2", "standing desk").closest("section")` },
  },
  {
    url: '/tools/domain-overview?domain=zapier.com&country=us&lang=en&tab=pages',
    shots: { 'domain-overview-pages': `document.querySelector("[role=tablist]").parentElement` },
  },
  {
    url: '/tools/domain-overview?domain=zapier.com&country=us&lang=en&tab=competitors',
    shots: { 'domain-overview-competitors': `document.querySelector("[role=tablist]").parentElement` },
  },
  {
    url: '/tools/page-analyser?url=https%3A%2F%2Fzapier.com%2Fblog%2Fbest-note-taking-apps%2F&country=us&lang=en',
    shots: { 'page-analyser-links': `box(heading("h2", "Strongest backlinks"))` },
  },
  {
    url: '/tools/backlink-checker?target=zapier.com&tab=domains',
    shots: { 'backlinks-domains': `document.querySelector("[role=tablist]").parentElement` },
  },
  {
    url: '/tools/backlink-checker?target=zapier.com&tab=anchors',
    shots: { 'backlinks-anchors': `document.querySelector("[role=tablist]").parentElement` },
  },
  {
    url: '/tools/backlink-checker?target=zapier.com&tab=intersect&vs=make.com,ifttt.com',
    shots: { 'backlinks-intersect': `document.querySelector("[role=tablist]").parentElement` },
  },
  {
    url: '/tools/competitors?tab=serp&keywords=standing+desk%0Aadjustable+desk%0Aergonomic+chair%0Adesk+converter%0Amonitor+arm&country=us&lang=en',
    shots: { 'competitors-serp': `document.querySelector("[role=tablist]").parentElement` },
  },
];

// Helpers available to `crop` expressions.
const HELPERS = `
  window.heading = (tags, start) => [...document.querySelectorAll(tags)].find((el) => el.textContent.trim().startsWith(start));
  window.text = (tags, start) => [...document.querySelectorAll(tags)].find((el) => el.textContent.trim().startsWith(start));
  window.box = (el) => { let node = el; while (node && !(String(node.className).includes("bg-surface") && String(node.className).includes("border"))) node = node.parentElement; return node ?? el; };
`;

// Hides what is private to the account (its balance and email) and the dev-only Next badge.
const PRIVATE_CSS = `
  section[aria-label="YepAPI balance"], nextjs-portal { display: none !important; }
  aside p.font-mono.truncate { visibility: hidden !important; }
`;

// ── Chrome DevTools Protocol, without dependencies ────────────────────────────

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        socket.send(JSON.stringify({ id: n, method, params }));
      }),
    on: (listener) => listeners.add(listener),
    close: () => socket.close(),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn() {
  const email = process.env.SHOT_EMAIL;
  const password = process.env.SHOT_PASSWORD;
  if (!email || !password) throw new Error('Set SHOT_EMAIL and SHOT_PASSWORD for an account with a YepAPI key.');
  const res = await fetch(`${APP}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return res.headers.getSetCookie().map((line) => {
    const [pair] = line.split(';');
    const [name, ...value] = pair.split('=');
    return { name, value: value.join('=') };
  });
}

async function main() {
  const only = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const sizes = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const cookies = await signIn();

  const chrome = chromePath();
  if (!chrome) throw new Error('Chrome or Edge not found. Set CHROME_PATH.');
  const profile = mkdtempSync(join(tmpdir(), 'openseo-shots-'));
  const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).then((list) => list.find((t) => t.type === 'page')).catch(() => undefined);
    }
    if (!target) throw new Error('Chrome did not start.');
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE, mobile: false });
    const host = new URL(APP).hostname;
    for (const cookie of cookies) await page.send('Network.setCookie', { ...cookie, domain: host, path: '/' });

    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };

    // Ready when nothing is loading: no busy region, no skeleton, no spinner, for a second.
    const settle = async () => {
      let quiet = 0;
      for (let i = 0; i < 240 && quiet < 5; i++) {
        await sleep(250);
        const busy = await evaluate(`!!document.querySelector('[aria-busy="true"], .animate-pulse, .animate-spin')`);
        quiet = busy ? 0 : quiet + 1;
      }
      // Charts animate in after their data arrives.
      await sleep(2000);
    };

    for (const view of VIEWS) {
      const names = Object.keys(view.shots).filter((name) => !only.length || only.includes(name));
      if (!names.length) continue;
      for (const theme of ['light', 'dark']) {
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await page.send('Page.navigate', { url: `${APP}${view.url}` });
        await sleep(1500);
        // Save the theme, then load again so the app (and its theme switcher) starts in it.
        await evaluate(`localStorage.setItem("openseo_theme", "${theme}"); true`);
        await page.send('Page.reload');
        await sleep(1500);
        await evaluate(`${HELPERS}
          const style = document.createElement("style"); style.textContent = ${JSON.stringify(PRIVATE_CSS)}; document.head.append(style); true`);
        if (view.before === 'authority') {
          await evaluate(`(() => { const s = document.querySelector('[role=switch]'); if (s && s.getAttribute('aria-checked') !== 'true') s.click(); return true; })()`);
        }
        await settle();

        for (const name of names) {
          const crop = view.shots[name];
          let clip;
          if (crop === 'viewport') {
            await evaluate('window.scrollTo(0, 0)');
            clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 };
          } else {
            const rect = await evaluate(`(() => { const el = ${crop}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: Math.min(r.height, 1400) }; })()`);
            if (!rect) {
              console.warn(`  ${name} (${theme}): element not found, skipped`);
              continue;
            }
            const pad = 16;
            clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: rect.width + pad * 2, height: rect.height + pad * 2, scale: 1 };
          }
          const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
          const file = join(OUT, `${name}${theme === 'dark' ? '-dark' : ''}.webp`);
          const info = await sharp(Buffer.from(data, 'base64')).webp({ quality: 86 }).toFile(file);
          console.log(`  ${name}${theme === 'dark' ? '-dark' : ''}.webp ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
          if (theme === 'light') sizes[name] = { width: info.width / SCALE, height: info.height / SCALE };
        }
      }
    }
    page.close();
    const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}
`);
  } finally {
    browser.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
