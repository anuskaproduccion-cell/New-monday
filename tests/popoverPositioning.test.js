const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-popover-parity.js'), 'utf8');

assert.ok(source.includes('positionMenuWithAnchorTracking'), 'popover positioning override must exist');
assert.ok(source.includes("window.addEventListener('resize', schedule"), 'popover must follow viewport resize');
assert.ok(source.includes("window.addEventListener('scroll', schedule"), 'popover must follow nested/window scroll');
assert.ok(source.includes('if (left + width > window.innerWidth - 12)'), 'popover must clamp against right viewport edge');
assert.ok(source.includes('if (top + height > window.innerHeight - 12)'), 'popover must flip above anchor near bottom edge');
assert.ok(source.includes('Math.max(8, left)'), 'popover must preserve a left viewport gutter');
assert.ok(source.includes('window.innerHeight - height - 8'), 'popover must preserve a bottom viewport gutter');
assert.ok(source.includes("document.addEventListener('pointerdown'"), 'popover must close on outside pointerdown');
assert.ok(source.includes('{ signal: controller.signal }'), 'outside-click listener must be cleaned up with the popover lifecycle');
assert.ok(!source.includes('once: true'), 'an inside pointerdown must not consume outside-click tracking');

console.log('popover positioning tests passed');
