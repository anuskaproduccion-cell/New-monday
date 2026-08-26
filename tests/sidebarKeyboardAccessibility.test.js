const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app-v2-sidebar-hierarchy-parity.js'), 'utf8');
let active = null;

function button(kind, id = '') {
  return {
    kind,
    dataset: kind === 'board' ? { hierarchyBoard: id } : kind === 'header' ? { sidebarPhaseToggle: id } : {},
    hidden: false,
    offsetParent: {},
    focus() { active = this; },
    scrollIntoView() {},
    closest(selector) {
      if (selector === 'button') return this;
      if (selector === '.sidebar-phase') return this.section || null;
      return null;
    },
    matches(selector) {
      if (selector === '[data-hierarchy-board]') return kind === 'board';
      if (selector === '[data-sidebar-phase-toggle]') return kind === 'header';
      return false;
    },
    getAttribute(name) {
      if (name === 'aria-expanded') return this.expanded ? 'true' : 'false';
      return null;
    },
    click() { this.clicked = (this.clicked || 0) + 1; }
  };
}

const header = button('header', 'phase:post');
header.expanded = true;
const boardA = button('board', 'board-a');
const boardB = button('board', 'board-b');
const section = {
  querySelector(selector) {
    if (selector === '[data-hierarchy-board]') return boardA;
    if (selector === '[data-sidebar-phase-toggle]') return header;
    return null;
  }
};
header.section = section;
boardA.section = section;
boardB.section = section;

const nav = {
  dataset: {},
  handler: null,
  contains(node) { return [header, boardA, boardB].includes(node); },
  querySelectorAll(selector) {
    if (selector === 'button:not([disabled])') return [header, boardA, boardB];
    return [];
  },
  addEventListener(type, handler) { if (type === 'keydown') this.handler = handler; }
};

const app = {
  renderSidebar() {},
  escapeAttr(value) { return String(value); },
  escapeHtml(value) { return String(value); }
};
const document = {
  getElementById(id) { return id === 'sidebar-nav' ? nav : null; },
  querySelectorAll() { return []; }
};

vm.runInNewContext(source, {
  app,
  document,
  localStorage: { getItem() { return null; }, setItem() {} },
  requestAnimationFrame: callback => callback(),
  console,
  window: {},
  confirm: () => true
});

assert.ok(app.sidebarBoardButtonHtml({ _id: 'board-a', name: 'Board A' }).includes('aria-keyshortcuts="Shift+F10"'));
app.bindSidebarHierarchyKeyboard(nav);
assert.strictEqual(typeof nav.handler, 'function');

let moveMenu = null;
app.openBoardFolderKeyboardMenu = (anchor, boardId) => { moveMenu = { anchor, boardId }; };
let prevented = 0;
nav.handler({
  target: boardA,
  key: 'F10',
  shiftKey: true,
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.deepStrictEqual(moveMenu, { anchor: boardA, boardId: 'board-a' });
assert.strictEqual(prevented, 1);

active = boardA;
nav.handler({
  target: boardA,
  key: 'ArrowDown',
  shiftKey: false,
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(active, boardB, 'ArrowDown must move to the next visible sidebar control');

active = boardA;
nav.handler({
  target: boardA,
  key: 'ArrowLeft',
  shiftKey: false,
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(active, header, 'ArrowLeft from a board must return to its folder/phase header');

nav.handler({
  target: header,
  key: 'ArrowLeft',
  shiftKey: false,
  preventDefault() { prevented += 1; },
  stopPropagation() {}
});
assert.strictEqual(header.clicked, 1, 'ArrowLeft on an expanded header must collapse it');

console.log('sidebarKeyboardAccessibility tests passed');
