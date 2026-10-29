import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(base,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(base,'public/style.css'),'utf8');
const js=fs.readFileSync(path.join(base,'public/app.js'),'utf8');
const preview=html.replace('<html lang="en">','<html lang="en" data-preview="true">')
  .replace('<link rel="stylesheet" href="/style.css" />', `<style>${css}</style>`)
  .replace('<script defer src="/app.js"></script>', '')
  .replace('</body>', `<script>${js.replaceAll('</script>', '<\\/script>')}</script></body>`);
fs.writeFileSync(path.join(base,'preview.html'),preview);
console.log('Wrote preview.html — open in your browser for a standalone illustrative demo.');
