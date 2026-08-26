const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-popover-parity.js'), 'utf8');
const realtimeSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-realtime-parity.js'), 'utf8');

assert.ok(source.includes('positionMenuWithAnchorTracking'), 'popover positioning override must exist');
assert.ok(source.includes('closePositionedMenusForRoot'), 'popover lifecycle must expose cleanup before replacing an anchored root');
assert.ok(source.includes('this.positionedMenus.add(menu)'), 'positioned popovers must be tracked');
assert.ok(source.includes('this.positionedMenus.delete(menu)'), 'removed popovers must leave the tracking set');
assert.ok(source.includes("window.addEventListener('resize', schedule"), 'popover must follow viewport resize');
assert.ok(source.includes("window.addEventListener('scroll', schedule"), 'popover must follow nested/window scroll');
assert.ok(source.includes('if (left + width > window.innerWidth - 12)'), 'popover must clamp against right viewport edge');
assert.ok(source.includes('if (top + height > window.innerHeight - 12)'), 'popover must flip above anchor near bottom edge');
assert.ok(source.includes('Math.max(8, left)'), 'popover must preserve a left viewport gutter');
assert.ok(source.includes('window.innerHeight - height - 8'), 'popover must preserve a bottom viewport gutter');
assert.ok(source.includes("document.addEventListener('pointerdown'"), 'popover must close on outside pointerdown');
assert.ok(source.includes('{ signal: controller.signal }'), 'outside-click listener must be cleaned up with the popover lifecycle');
assert.ok(!source.includes('once: true'), 'an inside pointerdown must not consume outside-click tracking');

const documentStub = {};
const app = {};
vm.runInNewContext(source, {
  app,
  document: documentStub,
  window: {},
  AbortController,
  Set,
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {}
});

const viewAnchor = { isConnected: true };
const headerAnchor = { isConnected: true };
let viewRemoved = 0;
let headerRemoved = 0;
const viewMenu = {
  __newMondayAnchor: viewAnchor,
  remove() { viewRemoved += 1; app.positionedMenus.delete(this); }
};
const headerMenu = {
  __newMondayAnchor: headerAnchor,
  remove() { headerRemoved += 1; app.positionedMenus.delete(this); }
};
app.positionedMenus.add(viewMenu);
app.positionedMenus.add(headerMenu);

const contentRoot = {
  contains(anchor) { return anchor === viewAnchor; }
};
app.closePositionedMenusForRoot(contentRoot);
assert.strictEqual(viewRemoved, 1, 'replacing the view must close a popover anchored inside that view');
assert.strictEqual(headerRemoved, 0, 'view replacement must preserve popovers anchored outside the view');
assert.strictEqual(app.positionedMenus.has(viewMenu), false);
assert.strictEqual(app.positionedMenus.has(headerMenu), true);

headerAnchor.isConnected = false;
app.closePositionedMenusForRoot(contentRoot);
assert.strictEqual(headerRemoved, 1, 'disconnected anchors must be cleaned even when they are outside the supplied root');
assert.strictEqual(app.positionedMenus.size, 0);

const globalRefreshBlock = realtimeSource.match(/app\.refreshGlobalStateFromRealtime\s*=\s*async function[\s\S]*?\n\s*app\.refreshCurrentBoardFromRealtime/);
assert.ok(globalRefreshBlock, 'global realtime refresh block must remain detectable');
assert.ok(
  globalRefreshBlock[0].includes('this.closeRealtimeMenusForRefresh(true);'),
  'global realtime refresh must close popovers anchored anywhere in the shell before rebuilding it'
);

const boardRefreshBlock = realtimeSource.match(/app\.refreshCurrentBoardFromRealtime\s*=\s*async function[\s\S]*?\n\s*app\.connectRealtime/);
assert.ok(boardRefreshBlock, 'current-board realtime refresh block must remain detectable');
assert.ok(
  boardRefreshBlock[0].includes('this.closeRealtimeMenusForRefresh(fullShellRefresh);'),
  'current-board refresh must choose popover cleanup scope from its shell-refresh policy'
);
assert.ok(
  boardRefreshBlock[0].includes('this.closeRealtimeMenusForRefresh(true);'),
  'archived-board replacement must close popovers across the shell before selecting another board'
);

const realtimeContentRoot = { id: 'content-root' };
const realtimeBodyRoot = { id: 'body-root' };
const realtimeDocument = {
  body: realtimeBodyRoot,
  activeElement: null,
  getElementById(id) { return id === 'content' ? realtimeContentRoot : null; },
  querySelector() { return null; },
  addEventListener() {}
};
const closedRoots = [];
const realtimeApp = {
  init() {},
  closePositionedMenusForRoot(root) { closedRoots.push(root); }
};
vm.runInNewContext(realtimeSource, {
  app: realtimeApp,
  document: realtimeDocument,
  window: {},
  navigator: {},
  console,
  setTimeout,
  clearTimeout,
  encodeURIComponent
});

assert.strictEqual(typeof realtimeApp.closeRealtimeMenusForRefresh, 'function');
realtimeApp.closeRealtimeMenusForRefresh(false);
realtimeApp.closeRealtimeMenusForRefresh(true);
assert.strictEqual(closedRoots[0], realtimeContentRoot, 'partial realtime refresh must clean only popovers anchored in #content');
assert.strictEqual(closedRoots[1], realtimeBodyRoot, 'full/global realtime refresh must clean popovers anchored anywhere in the shell');

console.log('popover positioning tests passed');
