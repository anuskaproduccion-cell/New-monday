const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'app-v2-board-workspace-parity.js'),
  'utf8'
);

const boardA = { _id: 'board-a', name: 'A', description: '', workspaceRef: { _id: 'workspace-a' } };
const boardB = { _id: 'board-b', name: 'B', description: '', workspaceRef: { _id: 'workspace-b' } };
const workspaceA = { _id: 'workspace-a', name: 'Workspace A' };
const workspaceB = { _id: 'workspace-b', name: 'Workspace B' };
const workspaceC = { _id: 'workspace-c', name: 'Workspace C' };
let headerRenders = 0;
let sidebarRenders = 0;
let workspaceRenders = 0;

const app = {
  boards: [boardA, boardB],
  workspaces: [workspaceA, workspaceB, workspaceC],
  currentBoard: boardB,
  currentWorkspace: workspaceB,
  openBoardMenu() {},
  currentBoardId() { return this.currentBoard?._id || ''; },
  renderHeader() { headerRenders += 1; },
  renderSidebar() { sidebarRenders += 1; },
  renderWorkspaceSwitcher() { workspaceRenders += 1; },
  showToast() {},
  escapeHtml(value) { return String(value ?? ''); },
  escapeAttr(value) { return String(value ?? ''); },
  openModal() {},
  closeModal() {}
};

vm.runInNewContext(source, {
  app,
  console,
  document: {},
  FormData: function FormData() {},
  encodeURIComponent
});

assert.strictEqual(typeof app.applyBoardMutationResult, 'function');
assert.strictEqual(typeof app.beginInlineBoardRename, 'function');
assert.strictEqual(typeof app.beginInlineBoardDescription, 'function');
assert.strictEqual(typeof app.openBoardWorkspacePicker, 'function');

const renamedA = { ...boardA, name: 'A renombrado' };
const activeAfterLateRename = app.applyBoardMutationResult('board-a', renamedA, {
  renderSidebar: true,
  renderHeader: true
});
assert.strictEqual(activeAfterLateRename, false, 'late response from board A must detect that board B is now active');
assert.strictEqual(app.currentBoard._id, 'board-b', 'late rename of A must never make A current again');
assert.strictEqual(app.currentWorkspace._id, 'workspace-b', 'late rename must not alter B workspace');
assert.strictEqual(app.boards.find(board => board._id === 'board-a').name, 'A renombrado', 'late result must still update A in cache');
assert.strictEqual(headerRenders, 0, 'late A response must not repaint A header over B');
assert.strictEqual(sidebarRenders, 1, 'sidebar may safely reflect A cached rename while B remains active');

const movedA = { ...renamedA, workspaceRef: { _id: 'workspace-c' }, workspace: 'Workspace C' };
const activeAfterLateWorkspaceMove = app.applyBoardMutationResult('board-a', movedA, {
  workspace: workspaceC,
  renderWorkspaceSwitcher: true,
  renderSidebar: true,
  renderHeader: true
});
assert.strictEqual(activeAfterLateWorkspaceMove, false);
assert.strictEqual(app.currentBoard._id, 'board-b', 'late workspace move of A must leave B current');
assert.strictEqual(app.currentWorkspace._id, 'workspace-b', 'late workspace move of A must not switch B to A target workspace');
assert.strictEqual(app.boards.find(board => board._id === 'board-a').workspaceRef._id, 'workspace-c', 'A cache must still receive its new workspace');
assert.strictEqual(workspaceRenders, 0, 'workspace switcher for B must not be rebuilt as A target workspace');
assert.strictEqual(headerRenders, 0);
assert.strictEqual(sidebarRenders, 2);

app.currentBoard = app.boards.find(board => board._id === 'board-a');
app.currentWorkspace = workspaceA;
const describedA = { ...app.currentBoard, description: 'Nueva descripción' };
const activeDescription = app.applyBoardMutationResult('board-a', describedA, {
  renderHeader: true
});
assert.strictEqual(activeDescription, true, 'active board mutation should still update the live shell');
assert.strictEqual(app.currentBoard.description, 'Nueva descripción');
assert.strictEqual(headerRenders, 1);

const movedActiveA = { ...describedA, workspaceRef: { _id: 'workspace-c' }, workspace: 'Workspace C' };
const activeWorkspaceMove = app.applyBoardMutationResult('board-a', movedActiveA, {
  workspace: workspaceC,
  renderWorkspaceSwitcher: true,
  renderSidebar: true,
  renderHeader: true
});
assert.strictEqual(activeWorkspaceMove, true);
assert.strictEqual(app.currentWorkspace._id, 'workspace-c', 'active board workspace move must update current workspace');
assert.strictEqual(workspaceRenders, 1);
assert.strictEqual(headerRenders, 2);
assert.strictEqual(sidebarRenders, 3);

const renameBlock = source.match(/app\.beginInlineBoardRename\s*=\s*function[\s\S]*?\n\s*app\.beginInlineBoardDescription/);
assert.ok(renameBlock, 'navigation-safe inline rename override must remain detectable');
assert.ok(renameBlock[0].includes('this.applyBoardMutationResult(board._id, updated'), 'rename must route late results through navigation guard');
assert.strictEqual(renameBlock[0].includes('this.currentBoard = updated'), false, 'rename must not unconditionally replace active board');

const descriptionBlock = source.match(/app\.beginInlineBoardDescription\s*=\s*function[\s\S]*?\n\s*app\.openBoardMenu/);
assert.ok(descriptionBlock, 'navigation-safe description override must remain detectable');
assert.ok(descriptionBlock[0].includes('this.applyBoardMutationResult(board._id, updated'), 'description must route late results through navigation guard');
assert.strictEqual(descriptionBlock[0].includes('this.currentBoard = updated'), false, 'description must not unconditionally replace active board');

const workspaceBlock = source.match(/app\.openBoardWorkspacePicker\s*=\s*function[\s\S]*?\n\}\)\(\);/);
assert.ok(workspaceBlock, 'navigation-safe workspace move override must remain detectable');
assert.ok(workspaceBlock[0].includes('this.applyBoardMutationResult(board._id, updated'), 'workspace move must route late result through navigation guard');
assert.strictEqual(workspaceBlock[0].includes('this.currentWorkspace = workspace'), false, 'workspace move must not unconditionally replace workspace after navigation');

console.log('board mutation navigation safety tests passed');
