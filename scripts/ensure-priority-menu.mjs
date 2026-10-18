import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const nestedItem = '<li><a href="/public-services/priority-investigation.html" title="優先調查申請表">優先調查申請表</a></li>';
const topItem = '<li><a href="/public-services/priority-investigation.html" title="優先調查申請表">優先調查申請表</a></li>';

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const filePath = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(filePath, acc);
    else if (ent.name.endsWith('.html')) acc.push(filePath);
  }
  return acc;
}

function alreadyBetween(html, leftNeedle, rightNeedle, midNeedle) {
  const left = html.indexOf(leftNeedle);
  const right = html.indexOf(rightNeedle, left > -1 ? left : 0);
  if (left < 0 || right < 0 || right < left) return false;
  return html.slice(left, right).includes(midNeedle);
}

function insertOnce(html, pattern, replacement, alreadyPresent) {
  if (alreadyPresent(html)) return html;
  if (!pattern.test(html)) return html;
  return html.replace(pattern, replacement);
}

function patchMenus(html) {
  let out = html;

  out = insertOnce(
    out,
    /(<li><a href="\/public-services\/case-query\.html" title="案件公文">案件公文<\/a><\/li>)(\s*)(<li><a href="\/service")/,
    `$1$2${nestedItem}$2$3`,
    (value) => alreadyBetween(value, 'title="案件公文"', 'href="/service"', 'priority-investigation.html')
  );

  out = insertOnce(
    out,
    /(<li><a href="\/public-services\/case-query\.html" title="案件公文">案件公文<\/a><\/li>)(\s*)(<li><a href=\/service)/,
    `$1$2${nestedItem}$2$3`,
    (value) => alreadyBetween(value, 'title="案件公文"', 'href=/service', 'priority-investigation.html')
  );

  out = out.replace(
    /(<li(?: class=[^>]*)?>\s*<a href="\/public-services\/integrity\.html"[^>]*>廉政專區<\/a>)/g,
    (match, _group, offset, source) => {
      const before = source.slice(Math.max(0, offset - 280), offset);
      if (before.includes('priority-investigation.html')) return match;
      return `${topItem}\n${match}`;
    }
  );

  out = out.replace(
    /(<li><a href=\/public-services\/integrity\.html title=廉政專區>廉政專區<\/a>)/g,
    (match, _group, offset, source) => {
      const before = source.slice(Math.max(0, offset - 280), offset);
      if (before.includes('priority-investigation.html')) return match;
      return ` <li><a href="/public-services/priority-investigation.html" title="優先調查申請表">優先調查申請表</a></li>\n${match}`;
    }
  );

  return out;
}

function patchHomeSlider(html) {
  if (!html.includes('class="slider_icon A"')) return html;

  const css = `<style id="cib-home-service-icons">.slider_icon .cib-home-service-icons{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 8px;width:92%;margin:0 auto}.slider_icon .cib-home-service-icons a{flex:1 1 150px;max-width:210px;text-align:center;color:#fff;text-decoration:none;padding:8px 6px}.slider_icon .cib-home-service-icons p{color:#fff;font-size:110%;padding:10px 8%;letter-spacing:2px;margin:0}.slider_icon .cib-home-service-icons a:hover p{color:#fc961a}</style>`;
  if (!html.includes('id="cib-home-service-icons"')) {
    html = html.replace('<div class="slider_icon A">', `${css}<div class="slider_icon A">`);
  }

  const start = html.indexOf('<div class="iconlist slick-initialized slick-slider">');
  const endMarker = '<div class=other>';
  const end = html.indexOf(endMarker, start);
  if (start < 0 || end < 0) return html;

  const replacement = `<div class="iconlist cib-home-service-icons">
 <a href="/public-services/application-inquiry.html"><p>申請與查詢</p></a>
 <a href="/public-services/case-query.html"><p>案件公文</p></a>
 <a href="/public-services/case-search.html"><p>案件查詢</p></a>
 <a href="/public-services/priority-investigation.html"><p>優先調查申請表</p></a>
 <a href="/service"><p>報案及申訴</p></a>
 <a href="/public-services/traffic.html"><p>交通類</p></a>
 <a href="/public-services/fraud-account.html"><p>疑涉詐欺境外金融帳戶查詢</p></a>
 </div>
 `;
  return `${html.slice(0, start)}${replacement}${html.slice(end)}`;
}

function patchHomeMegaMenu(html) {
  if (!html.includes('cib-public-services-menu')) return html;
  const marker = ` </li>
 <li><a href="/public-services/integrity.html" title="廉政專區">廉政專區</a>
 <ul>
 <li><a href="/public-services/integrity-news.html" title="最新消息">最新消息</a></li>`;
  if (!html.includes(marker)) return html;
  if (html.includes(`title="優先調查申請表">優先調查申請表</a>
 </li>
 <li><a href="/public-services/integrity.html" title="廉政專區"`)) return html;
  return html.replace(
    marker,
    ` </li>
 <li><a href="/public-services/priority-investigation.html" title="優先調查申請表">優先調查申請表</a>
 </li>
 <li><a href="/public-services/integrity.html" title="廉政專區">廉政專區</a>
 <ul>
 <li><a href="/public-services/integrity-news.html" title="最新消息">最新消息</a></li>`
  );
}

const files = walk(root);
let changed = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let next = patchMenus(original);
  if (path.basename(file) === 'index.html' && path.dirname(file) === root) {
    next = patchHomeMegaMenu(next);
    next = patchHomeSlider(next);
  }
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    changed += 1;
    console.log(`updated ${path.relative(root, file)}`);
  }
}
console.log(`done, ${changed} files`);
