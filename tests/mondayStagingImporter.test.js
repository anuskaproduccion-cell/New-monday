const assert = require('assert');
const StagingBoard = require('../models/StagingBoard');
const Board = require('../models/Board');
const {
  normalizedBoardMetadata,
  stagedParentItem,
  stagedSubitem
} = require('../services/mondayStagingImporter');

const runId = '507f1f77bcf86cd799439011';
const boardMeta = normalizedBoardMetadata({
  id: '5097244458',
  name: 'GY_POST',
  workspace: { id: '123', name: 'GY_GUAYOTA' },
  groups: [{ id: 'topics', title: 'Editing', color: '#579bfc' }],
  columns: [{ id: 'status', title: 'Status', type: 'status', settings_str: '{"labels":{"1":"Done"}}' }],
  views: [{ id: '1', name: 'Gantt', type: null }]
}, runId);
assert.strictEqual(boardMeta.mondayId, '5097244458');
assert.strictEqual(boardMeta.workspaceMondayId, '123');
assert.strictEqual(boardMeta.columns[0].settings.labels['1'], 'Done');
assert.strictEqual(boardMeta.internal, false);

const mirrorMeta = normalizedBoardMetadata({
  id: '5097244455',
  name: 'GY_EDITING ASSISTANCE',
  workspace: { id: '6553907', name: 'GY_GUAYOTA' },
  groups: [],
  columns: [{
    id: 'lookup_mm3m68yc',
    title: 'Material Disponible',
    type: 'mirror',
    settings_str: '{"relation_column":{"board_relation_mm3mwnpf":true},"displayed_column":{},"displayed_linked_columns":{"5097244456":["color_mm3kdvtp"]},"sumType":"allStatuses"}'
  }],
  views: []
}, runId);
assert.deepStrictEqual(mirrorMeta.columns[0].settings.displayed_column, {});
assert.strictEqual(StagingBoard.schema.get('minimize'), false);
assert.strictEqual(Board.schema.get('minimize'), false);

const parent = {
  id: '2941818198',
  name: 'Turnovers',
  group: { id: 'group_title', title: 'ONLINE', color: '#9d50dd' },
  column_values: [{
    id: 'status',
    type: 'status',
    text: 'Done',
    value: '{"index":1}'
  }]
};
const staged = stagedParentItem(parent, '5097244458', runId, 5);
assert.strictEqual(staged.groupId, 'group_title');
assert.strictEqual(staged.order, 5);
assert.strictEqual(staged.columnValues.status.label, 'Done');
assert.strictEqual(staged.sourceMeta.readOnlySource, true);

const subitem = stagedSubitem({
  id: '2963862701',
  name: 'Subs',
  column_values: []
}, parent, '5097244458', runId, 0);
assert.strictEqual(subitem.isSubitem, true);
assert.strictEqual(subitem.parentMondayId, '2941818198');
assert.strictEqual(subitem.boardMondayId, '5097244458');

console.log('mondayStagingImporter tests passed');
