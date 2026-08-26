const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-modal-accessibility-parity.js'), 'utf8');

let closeCount = 0;
let activeElement = null;
const anchor = {
  isConnected: true,
  focus() { activeElement = anchor; }
};
const first = {
  disabled: false,
  tabIndex: 0,
  offsetParent: {},
  getAttribute() { return null; },
  focus() { activeElement = first; }
};
const last = {
  disabled: false,
  tabIndex: 0,
  offsetParent: {},
  getAttribute() { return null; },
  focus() { activeElement = last; }
};
const title = { id: '' };
const dialogAttributes = new Map();
const dialog = {
  tabIndex: 0,
  hasAttribute(name) { return dialogAttributes.has(name); },
  setAttribute(name, value) { dialogAttributes.set(name, String(value)); },
  querySelector(selector) {
    if (selector === 'h1,h2,h3') return title;
    if (selector === '[autofocus]') return first;
    return null;
  },
  querySelectorAll() { return [first, last]; },
  focus() { activeElement = dialog; }
};
const root = {
  keyHandler: null,
  querySelector(selector) { return selector === '.modal-card' ? dialog : null; },
  addEventListener(type, handler) { if (type === 'keydown') this.keyHandler = handler; },
  removeEventListener(type, handler) { if (type === 'keydown' && this.keyHandler === handler) this.keyHandler = null; }
};
const backgrounds = [0, 1].map(() => {
  const attrs = new Set();
  return {
    hasAttribute(name) { return attrs.has(name); },
    setAttribute(name) { attrs.add(name); },
    removeAttribute(name) { attrs.delete(name); }
  };
});
const body = {};
const document = {
  body,
  get activeElement() { return activeElement; },
  getElementById(id) { return id === 'modal-root' ? root : null; },
  querySelectorAll(selector) { return selector === '.sidebar,.main' ? backgrounds : []; }
};

const app = {
  openModal() {},
  closeModal() { closeCount += 1; },
  currentActiveCellElement() { return null; }
};
activeElement = anchor;

vm.runInNewContext(source, {
  app,
  document,
  requestAnimationFrame: callback => callback(),
  console
});

app.openModal('<form class="modal-card"></form>');
assert.strictEqual(dialogAttributes.get('role'), 'dialog');
assert.strictEqual(dialogAttributes.get('aria-modal'), 'true');
assert.ok(dialogAttributes.get('aria-labelledby'));
assert.strictEqual(activeElement, first, 'opening a modal must focus its autofocus/first control');
assert.ok(backgrounds.every(node => node.hasAttribute('inert')), 'background application areas must be inert while the modal is open');

activeElement = last;
let prevented = 0;
root.keyHandler({
  key: 'Tab',
  shiftKey: false,
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(activeElement, first, 'Tab from the final control must wrap to the first control');
assert.strictEqual(prevented, 1);

root.keyHandler({
  key: 'Escape',
  shiftKey: false,
  preventDefault() {},
  stopPropagation() {}
});
assert.strictEqual(closeCount, 1, 'Escape must close the modal');
assert.strictEqual(activeElement, anchor, 'closing a modal must restore focus to the opener');
assert.ok(backgrounds.every(node => !node.hasAttribute('inert')), 'background inert state must be restored after close');

console.log('modalAccessibilityClient tests passed');
