const assert = require('assert');
const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const { generatedFolderId } = require('../routes/workspaces');

const id = generatedFolderId();
assert.match(id, /^folder_[a-f0-9]{10}$/);

const workspace = new Workspace({
  name: 'GY_GUAYOTA',
  folders: [
    { id: 'folder_post', title: 'Postproducción', order: 1 },
    { id: 'folder_edit', title: 'Edición', order: 0 }
  ]
});
assert.strictEqual(workspace.folders.length, 2);
assert.strictEqual(workspace.folders[0].archived, false);
assert.strictEqual(workspace.folders[1].title, 'Edición');

const board = new Board({
  name: 'GY_POST',
  workspace: 'GY_GUAYOTA',
  folderId: 'folder_post'
});
assert.strictEqual(board.folderId, 'folder_post');

const unassigned = new Board({ name: 'GY_SHOOTING' });
assert.strictEqual(unassigned.folderId, '');

console.log('workspaceFolders.test.js passed');
