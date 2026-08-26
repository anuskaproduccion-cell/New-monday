const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'workspaces.js'), 'utf8');

assert.ok(source.includes("const { publishRealtimeChange } = require('../services/realtimeHub');"));
assert.ok(source.includes("scope: global ? 'global' : 'workspace'"));

for (const type of [
  'workspace_created',
  'workspace_folder_created',
  'workspace_folder_updated',
  'workspace_folders_reordered',
  'workspace_folder_archived',
  'workspace_updated',
  'workspace_archived'
]) {
  assert.ok(source.includes(`type: '${type}'`), `${type} must notify other realtime sessions`);
}

assert.ok(source.includes('boardsUnassigned: Number(boardUpdate.modifiedCount || 0)'), 'folder archive event must report affected board assignments');

console.log('realtime workspace coverage tests passed');
