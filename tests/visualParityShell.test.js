const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'v2-visual-parity.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const expectedTokens = [
  '--nm-primary:#6161ff',
  '--nm-text:#323338',
  '--nm-muted:#676879',
  '--nm-border:#d0d4e4',
  '--nm-sidebar:#292f4c',
  '--nm-row-height:38px'
];
expectedTokens.forEach(token => assert.ok(css.includes(token), `missing visual token ${token}`));

[
  '.sidebar{',
  '.board-header{',
  '.view-tabs{',
  '.group-header{',
  '.board-table th,.crew-table th,.dynamic-table th{',
  '.floating-menu,.status-menu{',
  '.modal-card{'
].forEach(selector => assert.ok(css.includes(selector), `missing visual parity selector ${selector}`));

const visualLink = '<link rel="stylesheet" href="/css/v2-visual-parity.css">';
assert.ok(html.includes(visualLink), 'visual parity stylesheet must be loaded');
assert.ok(
  html.indexOf(visualLink) > html.indexOf('<link rel="stylesheet" href="/css/v2-realtime.css">'),
  'visual parity stylesheet must load after functional/component styles so it can act as the final visual layer'
);

assert.ok(
  !/--nm-row-height:\s*(?!38px)/.test(css),
  'visual layer must preserve the 38px virtualization fallback contract'
);

console.log('visual parity shell tests passed');
