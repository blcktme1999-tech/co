import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scriptSources = [
  ['scripts/rebuild-agency-pages.mjs', '/agency'],
  ['scripts/prepare-announcement-pages.mjs', '/announcements'],
  ['scripts/prepare-wanted-pages.mjs', '/wanted'],
  ['scripts/prepare-forensics-pages.mjs', '/forensics'],
  ['scripts/prepare-public-info-pages.mjs', '/public-info'],
  ['scripts/prepare-public-services-pages.mjs', '/public-services'],
  ['scripts/prepare-related-links-pages.mjs', '/related-links']
];

const localByKey = new Map();

function addMapping(remote, local) {
  let url;
  try { url = new URL(remote); } catch { return; }
  const pathAndSearch = `${url.pathname}${url.search}`;
  for (const key of [remote, pathAndSearch, pathAndSearch.replaceAll('&', '&amp;')]) {
    localByKey.set(normalizeKey(key), local);
  }
}

function normalizeKey(value) {
  const text = String(value || '').replaceAll('&amp;', '&').trim();
  if (!text) return '';
  try {
    const url = text.startsWith('/')
      ? new URL(text, 'https://www.cib.npa.gov.tw')
      : new URL(text);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return `${host}${url.pathname.replace(/\/$/, '')}${url.search}`;
  } catch {
    return text;
  }
}

for (const [file, prefix] of scriptSources) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const pattern = /\['([^']+\.html)',\s*'[^']*',\s*'(https?:\/\/[^']+)'(?:,\s*'[^']*')?\]/g;
  for (const match of source.matchAll(pattern)) {
    const slug = match[1];
    const local = slug === 'index.html' ? `${prefix}/` : `${prefix}/${slug}`;
    addMapping(match[2], local);
  }
  const documents = /\['([^']+\.pdf)',\s*'[^']*',\s*'(https?:\/\/[^']+)'\]/g;
  for (const match of source.matchAll(documents)) addMapping(match[2], `${prefix}/${match[1]}`);
}

addMapping('https://www.cib.npa.gov.tw/ch/index', '/');
addMapping('https://www.cib.npa.gov.tw/ch/sitemap', '/sitemap/');
addMapping('https://www.cib.npa.gov.tw/ch/app/data/list?module=wg138&id=2077', '/service');
addMapping('https://www.cib.npa.gov.tw/ch/mailbox/mailvio/mailvioquery?module=mailvio&id=7453', '/public-services/case-search.html');
addMapping('https://nservice.moj.gov.tw/CriminalWanted/default.html', '/wanted/criminal-wanted-platform.html');
addMapping('https://www.thcw.moj.gov.tw/CriminalWanted/default.html', '/wanted/criminal-wanted-platform.html');

function lookup(raw) {
  const key = normalizeKey(raw);
  if (!key) return null;
  if (localByKey.has(key)) return localByKey.get(key);
  const withoutQuery = key.split('?')[0];
  if (localByKey.has(withoutQuery)) return localByKey.get(withoutQuery);
  return null;
}

function mapHref(raw) {
  const value = String(raw || '').replaceAll('&amp;', '&').trim();
  if (!value || value.startsWith('#') || /^(javascript:|mailto:|tel:|data:)/i.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('/ch/') && !value.startsWith('/en/')) return null;
  let url;
  try {
    if (value.startsWith('//')) url = new URL(`https:${value}`);
    else if (value.startsWith('/')) url = new URL(value, 'https://www.cib.npa.gov.tw');
    else if (/^https?:\/\//i.test(value)) url = new URL(value);
    else return null;
  } catch {
    return null;
  }
  const local = lookup(url.href) || lookup(`${url.pathname}${url.search}`);
  return local || '/';
}

function rewriteTag(tag) {
  let changed = false;
  const next = tag.replace(/(href|action)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi, (full, attr, eq, dq, sq, uq) => {
    const raw = dq ?? sq ?? uq ?? '';
    const mapped = mapHref(raw);
    if (!mapped || mapped === raw) return full;
    changed = true;
    const quote = dq != null ? '"' : sq != null ? "'" : '';
    return `${attr}${eq}${quote}${mapped}${quote}`;
  });
  if (!changed) return tag;
  return next.replace(/\s+target\s*=\s*(?:"_blank"|'_blank'|_blank)/gi, '');
}

function rewriteHtml(html) {
  return html.replace(/<(?:a|area|form)\b[^>]*>/gi, rewriteTag);
}

const servedDirs = ['agency-introduction-pages', 'announcements', 'wanted', 'forensics', 'public-info', 'public-services', 'sitemap', 'related-links'];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const filePath = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(filePath, acc);
    else if (ent.name.endsWith('.html') && ent.name !== 'case-query.html') acc.push(filePath);
  }
  return acc;
}

function gitHtml(relativePath) {
  try {
    return execFileSync('git', ['show', `HEAD:${relativePath.replaceAll('\\', '/')}`], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 80 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

function removeCaseDocumentLinks(html) {
  return html
    .replace(/[ \t]*<li><a href="\/public-services\/case-query\.html" title="案件公文">案件公文<\/a><\/li>\r?\n/g, '')
    .replace(/[ \t]*<a href="\/public-services\/case-query\.html"><p>案件公文<\/p><\/a>\r?\n/g, '');
}

const files = [path.join(root, 'index.html'), ...servedDirs.flatMap((dir) => walk(path.join(root, dir)))];
let changed = 0;
let mapped = 0;
let home = 0;
for (const file of files) {
  const relativePath = path.relative(root, file);
  const original = gitHtml(relativePath) ?? fs.readFileSync(file, 'utf8');
  const after = rewriteHtml(removeCaseDocumentLinks(original));
  if (after === fs.readFileSync(file, 'utf8')) continue;
  mapped += (after.match(/href=(?:"\/(?:agency|announcements|wanted|forensics|public-info|public-services|sitemap|related-links|service)[^"'\s>]*"|'\/(?:agency|announcements|wanted|forensics|public-info|public-services|sitemap|related-links|service)[^"'\s>]*'|\/(?:agency|announcements|wanted|forensics|public-info|public-services|sitemap|related-links|service)[^\s"'>]*)/g) || []).length;
  home += (after.match(/<(?:a|area)\b[^>]*href=(?:"\/"|'\/'|\/(?=[\s>]))[^>]*>/gi) || []).length;
  fs.writeFileSync(file, after);
  changed += 1;
  console.log(`updated ${relativePath}`);
}
console.log(`files ${changed} map-size ${localByKey.size} section-hrefs ${mapped} homepage-hrefs ${home}`);
