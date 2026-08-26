const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'v2-visual-parity.css'), 'utf8');
const componentCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'v2-visual-parity-components.css'), 'utf8');
const viewCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'v2-visual-parity-views.css'), 'utf8');
const responsiveCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'v2-visual-parity-responsive.css'), 'utf8');
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

[
  '.people-picker-menu,',
  '.dropdown-picker-menu,',
  '.dependency-picker-menu,',
  '.world-clock-picker,',
  '.relation-parity-picker,',
  '.updates-drawer{',
  '.update-card{',
  '.update-rich-toolbar{',
  '.mention-picker{',
  '.update-attachment{',
  '.dynamic-cell[data-save-state]::after,.element-cell[data-save-state]::after{'
].forEach(selector => assert.ok(componentCss.includes(selector), `missing visual component selector ${selector}`));

[
  '.gantt-help{',
  '.gantt-scroller{',
  '.files-gallery-header{',
  '.files-gallery-card{',
  '.lifecycle-item{',
  '.board-activity-list{',
  '.backup-modal{',
  '.backup-summary>div{'
].forEach(selector => assert.ok(viewCss.includes(selector), `missing visual view selector ${selector}`));

['@media(max-width:1100px)', '@media(max-width:900px)', '@media(max-width:720px)', '@media(max-width:560px)']
  .forEach(query => assert.ok(responsiveCss.includes(query), `missing responsive breakpoint ${query}`));
assert.ok(responsiveCss.includes('.sidebar{width:176px}'), '720px shell must compact sidebar without hiding navigation');
assert.ok(responsiveCss.includes('.sidebar{width:156px}'), '560px shell must preserve a narrow but usable sidebar');

const visualLink = '<link rel="stylesheet" href="/css/v2-visual-parity.css">';
const componentLink = '<link rel="stylesheet" href="/css/v2-visual-parity-components.css">';
const viewLink = '<link rel="stylesheet" href="/css/v2-visual-parity-views.css">';
const responsiveLink = '<link rel="stylesheet" href="/css/v2-visual-parity-responsive.css">';
assert.ok(html.includes(visualLink), 'visual parity stylesheet must be loaded');
assert.ok(html.includes(componentLink), 'visual component parity stylesheet must be loaded');
assert.ok(html.includes(viewLink), 'visual special-view parity stylesheet must be loaded');
assert.ok(html.includes(responsiveLink), 'responsive visual parity stylesheet must be loaded');
assert.ok(
  html.indexOf(visualLink) > html.indexOf('<link rel="stylesheet" href="/css/v2-realtime.css">'),
  'visual parity stylesheet must load after functional/component styles so it can act as the final visual layer'
);
assert.ok(
  html.indexOf(componentLink) > html.indexOf(visualLink),
  'specialized visual component layer must load after foundation tokens and shell styles'
);
assert.ok(
  html.indexOf(viewLink) > html.indexOf(componentLink),
  'special-view visual layer must load after picker/updates parity styles'
);
assert.ok(
  html.indexOf(responsiveLink) > html.indexOf(viewLink),
  'responsive visual layer must load last so breakpoint overrides win without duplicating component logic'
);

assert.ok(componentCss.includes('@media(max-width:900px)'), 'visual component layer must include narrow desktop/tablet adaptation');
assert.ok(componentCss.includes('@media(max-width:720px)'), 'visual component layer must include mobile drawer adaptation');

assert.ok(
  !/--nm-row-height:\s*(?!38px)/.test(css),
  'visual layer must preserve the 38px virtualization fallback contract'
);

console.log('visual parity shell tests passed');
