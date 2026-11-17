// Gera dist/ a partir de videos.json, site.json e src/. Sem dependências: rode com `node build.mjs`.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const site = JSON.parse(read('site.json'));
const videos = JSON.parse(read('videos.json'));

// ---------- validação ----------
const errors = [];
const warnings = [];
if (!Array.isArray(videos) || videos.length === 0) errors.push('videos.json precisa ser uma lista com pelo menos 1 vídeo.');
const seen = new Set();
videos.forEach((v, i) => {
  const at = `videos.json item ${i + 1}${v && v.slug ? ` (${v.slug})` : ''}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug || '')) errors.push(`${at}: slug só com letras minúsculas, números e hífen.`);
  if (seen.has(v.slug)) errors.push(`${at}: slug repetido.`);
  seen.add(v.slug);
  if (!/^[A-Za-z0-9]+$/.test(v.uid || '')) errors.push(`${at}: uid vazio ou inválido.`);
  if (!v.title || typeof v.title !== 'string') errors.push(`${at}: falta o título.`);
  if (!v.category || typeof v.category !== 'string') errors.push(`${at}: falta a categoria.`);
  if (!Number.isInteger(v.duration) || v.duration <= 0) errors.push(`${at}: duration tem que ser um número inteiro de segundos.`);
  if (typeof v.thumbTime !== 'number' || v.thumbTime < 0) errors.push(`${at}: thumbTime tem que ser um número de segundos.`);
});
if (videos.length > 15) warnings.push(`São ${videos.length} vídeos. O escopo da v1 é até 15.`);
const streamCode = (site.streamCode || '').trim();
if (streamCode && !/^[a-z0-9]+$/.test(streamCode)) errors.push('site.json: streamCode só com letras minúsculas e números (o XXXX de customer-XXXX).');
const waNumber = String(site.whatsapp || '').replace(/\D/g, '');
if (!waNumber) warnings.push('site.json: whatsapp vazio. O botão abre o WhatsApp sem destinatário.');
if (!streamCode) warnings.push('site.json: streamCode vazio. Usando capas de teste.');
if (errors.length) {
  console.error('Build parado:\n- ' + errors.join('\n- '));
  process.exit(1);
}

// ---------- utilidades ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fill = (tpl, data) => {
  const out = tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in data)) throw new Error(`Modelo usa {{${k}}}, mas o build não preenche esse campo.`);
    return data[k];
  });
  return out;
};
const minifyCss = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

const streamOrigin = streamCode ? `https://customer-${streamCode}.cloudflarestream.com` : '';
const isTest = (v) => !streamCode || v.uid === 'TESTE';

function cover(v) {
  if (isTest(v)) return { src: `/capas-teste/${v.slug}.svg`, srcset: '' };
  const base = `${streamOrigin}/${v.uid}/thumbnails/thumbnail.jpg?time=${v.thumbTime}s`;
  return {
    src: `${base}&height=640`,
    srcset: `srcset="${esc(`${base}&height=400 225w, ${base}&height=640 360w, ${base}&height=960 540w`)}"`,
  };
}

function testCoverSvg(slug) {
  const n = [...createHash('md5').update(slug).digest()];
  const h1 = Math.round(n[0] / 255 * 360);
  const h2 = (h1 + 40 + Math.round(n[1] / 255 * 80)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
<defs><linearGradient id="g" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="hsl(${h1},42%,26%)"/><stop offset="1" stop-color="hsl(${h2},50%,11%)"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".36" r=".34"><stop offset="0" stop-color="hsl(${h2},75%,72%)" stop-opacity=".55"/><stop offset="1" stop-color="hsl(${h2},75%,72%)" stop-opacity="0"/></radialGradient></defs>
<rect width="360" height="640" fill="url(#g)"/><rect width="360" height="640" fill="url(#r)"/>
<text x="180" y="330" fill="#fff" fill-opacity=".35" font-family="monospace" font-size="13" letter-spacing="2" text-anchor="middle">CAPA DE TESTE</text></svg>`;
}

const wa = (text) => `${waNumber ? `https://wa.me/${waNumber}` : 'https://wa.me/'}?text=${encodeURIComponent(text)}`;

// ---------- CSS inline + hash para a CSP ----------
const css = minifyCss(readFileSync(join(SRC, 'styles.css'), 'utf8'));
const styleHash = 'sha256-' + createHash('sha256').update(css, 'utf8').digest('base64');
const preconnect = streamOrigin ? `<link rel="preconnect" href="${streamOrigin}">` : '';

const common = {
  NAME: esc(site.name),
  ROLE: esc(site.role),
  SITE_URL: esc(site.siteUrl.replace(/\/$/, '')),
  CSS: css,
  PRELOAD: preconnect,
};

// ---------- página principal ----------
const cards = videos.map((v, i) => {
  const c = cover(v);
  const eager = i < 4; // as 4 primeiras aparecem na primeira tela do celular
  const attrs = eager ? `loading="eager"${i === 0 ? ' fetchpriority="high"' : ''}` : 'loading="lazy"';
  return `    <li><a class="card" href="/v/${v.slug}">
      <div class="cover"><img src="${esc(c.src)}" ${c.srcset} sizes="(min-width:1024px) 270px, (min-width:600px) 31vw, 46vw" width="360" height="640" alt="" ${attrs} decoding="async"><span class="dur">${fmt(v.duration)}</span></div>
      <div class="meta"><span class="cat">${esc(v.category)}</span><span class="ttl">${esc(v.title)}</span></div>
    </a></li>`;
}).join('\n');

const services = (site.services || []).map((s) => `      <li>${esc(s.name)}<span>${esc(s.detail || '')}</span></li>`).join('\n');
const initials = site.name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();

const firstName = site.name.split(/\s+/)[0];
const indexHtml = fill(read('src/index.html'), {
  ...common,
  PITCH: esc(site.pitch),
  COUNT: `${videos.length} vídeos`,
  CARDS: cards,
  INITIALS: esc(initials),
  ABOUT: esc(site.about),
  SERVICES: services,
  INSTAGRAM: esc(String(site.instagram || '').replace(/^@/, '')),
  YEAR: String(new Date().getFullYear()),
  WA_HOME: esc(wa(`Oi, ${firstName}! Vi seu portfólio e quero conversar sobre um vídeo.`)),
});

// ---------- gravação ----------
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
const sizes = [];
const out = (rel, content) => {
  const p = join(DIST, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  sizes.push([rel, Buffer.byteLength(content), gzipSync(content).length]);
};

out('index.html', indexHtml);

const videoTpl = read('src/video.html');
for (const v of videos) {
  const c = cover(v);
  out(`v/${v.slug}/index.html`, fill(videoTpl, {
    ...common,
    TITLE: esc(v.title),
    CATEGORY: esc(v.category),
    DURATION: fmt(v.duration),
    SLUG: v.slug,
    COVER: esc(c.src),
    COVER_SRCSET: c.srcset ? `${c.srcset} sizes="(min-width:600px) 56vh, 100vw"` : '',
    WA_VIDEO: esc(wa(`Oi, ${firstName}! Vi o vídeo "${v.title}" no seu portfólio e quero um parecido.`)),
  }));
  if (isTest(v)) out(`capas-teste/${v.slug}.svg`, testCoverSvg(v.slug));
}

const headers = read('_headers')
  .split('\n').filter((l) => !l.startsWith('#')).join('\n')
  .replaceAll('{{STREAM}}', streamOrigin ? ` ${streamOrigin}` : '')
  .replaceAll('{{STYLE_HASH}}', styleHash);
out('_headers', headers);

if (existsSync(join(SRC, 'vendor'))) cpSync(join(SRC, 'vendor'), join(DIST, 'vendor'), { recursive: true });
for (const f of ['app.js', 'player.js', 'favicon.svg']) if (existsSync(join(SRC, f))) out(f, readFileSync(join(SRC, f), 'utf8'));

// ---------- resumo ----------
const kb = (b) => (b / 1024).toFixed(1) + ' KB';
const home = sizes.find(([r]) => r === 'index.html');
console.log(`Pronto: ${videos.length} vídeos, ${sizes.length} arquivos em dist/.`);
console.log(`index.html: ${kb(home[1])} (${kb(home[2])} com gzip). Meta: abaixo de 150 KB sem capas.`);
if (home[2] > 150 * 1024) console.error('ATENÇÃO: página principal acima de 150 KB.');
if (warnings.length) console.log('Avisos:\n- ' + warnings.join('\n- '));
