import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const publicHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
// Move the script to body end. An inline script in <head> ignores defer and fails before the DOM exists.
const html = publicHtml.replace('<html lang="en">', '<html lang="en" data-preview="true">')
  .replace('<link rel="stylesheet" href="/style.css" />', `<style>${css}</style>`)
  .replace('<script defer src="/app.js"></script>', '')
  .replace('</body>', `<script>${js.replaceAll('</script>', '<\\/script>')}</script></body>`);
const output = path.join(root, 'sites/visual-reference.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(`Wrote ${path.relative(root, output)} (illustrative reference, no live integrations).`);
