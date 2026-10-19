// Social cards + shareable post pages.
//
//   npm install --prefix tools/og        (once)
//   node tools/og/build.mjs
//
// Writes, from blog/posts.json + blog/<slug>.md:
//   og-image.png                 home share card (tools/og/og.html)
//   me/og.png                    the long page's card (tools/og/og.html?v=me)
//   blog/<slug>/og.png           per-post share card (tools/og/post.html)
//   blog/<slug>/index.html       a real page per post: its own Open Graph / Twitter tags (so WhatsApp,
//                                LinkedIn, X, Telegram … show the post's card) and the full article
//   sitemap.xml                  home, /me/ and every post page
// The GitHub Action in .github/workflows/social-cards.yml runs this on every push that touches blog/.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = 'https://mukhayyar.my.id';
const AUTHOR = 'Muhammad Tsaqif Mukhayyar';

const load = async (name, local) => {
  try { return await import(name); } catch (e) { if (local) return import(pathToFileURL(local).href); throw e; }
};
const pw = await load('playwright', process.env.PLAYWRIGHT_MODULE);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
const mk = await load('marked', process.env.MARKED_MODULE);
const marked = mk.marked || (mk.default && mk.default.marked) || mk.default;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : String(s || ''); };

// ---- tiny static server so the card templates load fonts and scripts like the real site
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('outside');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

async function card(url, out) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(250);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: 'png' });
}

const posts = JSON.parse(await readFile(join(ROOT, 'blog/posts.json'), 'utf8'));

await card('/tools/og/og.html', join(ROOT, 'og-image.png'));
console.log('og-image.png');
await mkdir(join(ROOT, 'me'), { recursive: true });
await card('/tools/og/og.html?v=me', join(ROOT, 'me', 'og.png'));
console.log('me/og.png');

const ICON = `<svg class="brand__mark" viewBox="0 0 22 22" aria-hidden="true"><circle cx="2.2" cy="2.2" r="1.95"/><circle cx="6.6" cy="2.2" r="1.95"/><circle class="a" cx="11" cy="2.2" r="1.95"/><circle cx="15.4" cy="2.2" r="1.95"/><circle cx="19.8" cy="2.2" r="1.95"/><circle cx="2.2" cy="6.6" r="1.68"/><circle class="s" cx="6.6" cy="6.6" r="0.97"/><circle cx="11" cy="6.6" r="1.95"/><circle class="s" cx="15.4" cy="6.6" r="0.97"/><circle cx="19.8" cy="6.6" r="1.68"/><circle cx="2.2" cy="11" r="1.68"/><circle cx="11" cy="11" r="1.95"/><circle cx="19.8" cy="11" r="1.68"/><circle cx="2.2" cy="15.4" r="1.68"/><circle cx="11" cy="15.4" r="1.95"/><circle cx="19.8" cy="15.4" r="1.68"/><circle cx="2.2" cy="19.8" r="1.68"/><circle cx="11" cy="19.8" r="1.95"/><circle cx="19.8" cy="19.8" r="1.68"/></svg>`;

function shareLinks(url, title) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  return [
    ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['X', `https://twitter.com/intent/tweet?text=${t}&url=${u}`],
    ['Telegram', `https://t.me/share/url?url=${u}&text=${t}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ].map(([n, h]) => `<a class="share__btn" href="${esc(h)}" target="_blank" rel="noopener">${n}</a>`).join('');
}

function postPage(p, html, minutes) {
  const url = `${SITE}/blog/${p.slug}/`;
  const img = `${SITE}/blog/${p.slug}/og.png`;
  const desc = p.excerpt || '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: desc,
    datePublished: p.date, image: img, url, mainEntityOfPage: url, keywords: (p.tags || []).join(', '),
    author: { '@type': 'Person', name: AUTHOR, url: SITE + '/' },
  };
  return `<!doctype html>
<!-- Generated by tools/og/build.mjs from blog/${esc(p.slug)}.md — edit the markdown, not this file. -->
<html lang="en" class="js reduced is-article">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(p.title)} — Tsaqif Mukhayyar</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="author" content="${AUTHOR}">
  <meta name="theme-color" content="#F1F0EB">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Tsaqif Mukhayyar">
  <meta property="og:locale" content="en_US">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:secure_url" content="${img}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(p.title)} — Tsaqif Mukhayyar">
  <meta property="article:published_time" content="${esc(p.date)}">
  <meta property="article:author" content="${SITE}/">
${(p.tags || []).map((t) => `  <meta property="article:tag" content="${esc(t)}">`).join('\n')}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(p.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${img}">
  <meta name="twitter:image:alt" content="${esc(p.title)}">
  <link rel="image_src" href="${img}">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400..600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/main.css">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body class="is-article">
  <header class="nav is-solid" id="nav">
    <div class="wrap nav__bar">
      <a class="brand" href="/">${ICON}<span>Tsaqif Mukhayyar</span></a>
      <a class="btn btn--ghost" href="/me/#writing">All writing</a>
    </div>
  </header>
  <main id="main">
    <article class="article wrap" id="article">
      <a class="article__back mono" href="/me/#writing">← All writing</a>
      <header class="article__head">
        <p class="article__meta mono"><span>${esc(fmtDate(p.date))}</span><span>${(p.tags || []).map(esc).join('&nbsp;· ')}</span><span>${minutes} min read</span></p>
        <h1 class="article__title">${esc(p.title)}</h1>
      </header>
      <div class="article__cover"><canvas id="article-cover" aria-hidden="true"></canvas></div>
      <div class="prose">${html}</div>
      <div class="article__end share" aria-label="Share this post">
        <span class="mono">Share</span>
        <span class="share__row">${shareLinks(url, p.title)}</span>
      </div>
    </article>
  </main>
  <footer class="post-foot wrap mono"><span>© ${new Date().getFullYear()} ${AUTHOR}</span><a class="ul" href="/">mukhayyar.my.id</a></footer>
  <script src="/assets/js/halftone.js" defer></script>
  <script src="/assets/js/scenes/projects.js" defer></script>
  <script>
    // Same live dot cover as the article view on the home page.
    addEventListener('DOMContentLoaded', () => {
      try {
        if (localStorage.getItem('ht-mode') === 'color') document.documentElement.setAttribute('data-ht-mode', 'color');
        const sc = Halftone.scenes.projectArt(${JSON.stringify(p.title)}, ${JSON.stringify((p.tags || []).join(' '))});
        new Halftone(document.getElementById('article-cover'), sc);
      } catch (e) { document.querySelector('.article__cover').hidden = true; }
    });
  </script>
</body>
</html>
`;
}

const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: SITE + '/', lastmod: today, priority: '1.0' }, { loc: SITE + '/me/', lastmod: today, priority: '0.9' }];
for (const p of posts) {
  if (!p.slug) continue;
  const md = await readFile(join(ROOT, 'blog', p.slug + '.md'), 'utf8').catch(() => null);
  if (md == null) { console.warn('skip (no markdown):', p.slug); continue; }
  const fixed = md.replace(/!\[([^\]]*)\]\((?!https?:|\/)([^)]+)\)/g, '![$1](/blog/images/$2)');
  const html = marked.parse(fixed).replace(/^\s*<h1[^>]*>.*?<\/h1>\s*/s, '');
  const minutes = Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 220));
  const qs = new URLSearchParams({ title: p.title, date: fmtDate(p.date), tags: (p.tags || []).join(','), slug: p.slug });
  await card('/tools/og/post.html?' + qs, join(ROOT, 'blog', p.slug, 'og.png'));
  await writeFile(join(ROOT, 'blog', p.slug, 'index.html'), postPage(p, html, minutes));
  urls.push({ loc: `${SITE}/blog/${p.slug}/`, lastmod: p.date, priority: '0.7' });
  console.log('blog/' + p.slug + '/');
}

await writeFile(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>
`);
console.log('sitemap.xml');

await browser.close();
server.close();
