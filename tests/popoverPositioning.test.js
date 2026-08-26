const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-popover-parity.js'), 'utf8');

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

console.log('popover positioning tests passed');
