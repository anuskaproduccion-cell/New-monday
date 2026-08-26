const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-menu-keyboard-parity.js'), 'utf8');

let keydownHandler = null;
let activeElement = null;
const attributes = new Map();

function control(name) {
  const attrs = new Map();
  return {
    name,
    hidden: false,
    disabled: false,
    offsetParent: {},
    tabIndex: 0,
    setAttribute(key, value) { attrs.set(key, String(value)); },
    getAttribute(key) { return attrs.get(key) || null; },
    matches(selector) { return selector === 'button'; },
    focus() { activeElement = this; }
  };
}

const first = control('first');
const second = control('second');
const anchor = {
  isConnected: true,
  setAttribute(key, value) { attributes.set(key, String(value)); },
  removeAttribute(key) { attributes.delete(key); },
  focus() { activeElement = this; }
};
const menuAttributes = new Map();
const menu = {
  id: '',
  isConnected: false,
  offsetParent: {},
  __newMondayAnchor: null,
  setAttribute(key, value) { menuAttributes.set(key, String(value)); },
  querySelector(selector) {
    if (selector === 'input[type="search"]:not([disabled])') return null;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === 'button:not([disabled])') return [first, second];
    return [];
  },
  contains(node) { return node === first || node === second; },
  remove() { this.isConnected = false; }
};

const document = {
  get activeElement() { return activeElement; },
  querySelectorAll(selector) {
    if (selector === '.floating-menu,.status-menu') return menu.isConnected ? [menu] : [];
    return [];
  },
  addEventListener(type, handler) {
    if (type === 'keydown') keydownHandler = handler;
  }
};

const app = {
  positionMenu(target, opener) {
    target.__newMondayAnchor = opener;
    target.isConnected = true;
  }
};
activeElement = anchor;

vm.runInNewContext(source, {
  app,
  document,
  requestAnimationFrame: callback => callback(),
  console
});

app.positionMenu(menu, anchor);
assert.strictEqual(menuAttributes.get('role'), 'menu');
assert.strictEqual(menuAttributes.get('aria-orientation'), 'vertical');
assert.strictEqual(attributes.get('aria-haspopup'), 'menu');
assert.strictEqual(attributes.get('aria-expanded'), 'true');
assert.ok(attributes.get('aria-controls'));
assert.strictEqual(first.getAttribute('role'), 'menuitem');
assert.strictEqual(second.getAttribute('role'), 'menuitem');
assert.strictEqual(first.tabIndex, -1);
assert.strictEqual(activeElement, first, 'opening a floating menu must move focus into the first menu item');

let prevented = 0;
keydownHandler({
  key: 'ArrowDown',
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(activeElement, second, 'ArrowDown must move to the next menu item');
assert.strictEqual(prevented, 1);

keydownHandler({
  key: 'Escape',
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(menu.isConnected, false);
assert.strictEqual(attributes.get('aria-expanded'), 'false');
assert.strictEqual(attributes.has('aria-controls'), false);
assert.strictEqual(activeElement, anchor, 'Escape must return focus to the menu opener');

console.log('menuKeyboardAccessibility tests passed');
