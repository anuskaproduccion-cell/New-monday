const Board = require('../models/Board');
const Item = require('../models/Item');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(value, deltaDays) {
  const date = parseDateOnly(value);
  if (!date) return value;
  return formatDateOnly(new Date(date.getTime() + deltaDays * DAY_MS));
}

function timelineDeltaDays(previousValue, nextValue) {
  const previousStart = parseDateOnly(previousValue?.from || previousValue?.date);
  const nextStart = parseDateOnly(nextValue?.from || nextValue?.date);
  if (previousStart && nextStart) {
    return Math.round((nextStart.getTime() - previousStart.getTime()) / DAY_MS);
  }

  const previousEnd = parseDateOnly(previousValue?.to || previousValue?.date);
  const nextEnd = parseDateOnly(nextValue?.to || nextValue?.date);
  if (previousEnd && nextEnd) {
    return Math.round((nextEnd.getTime() - previousEnd.getTime()) / DAY_MS);
  }

  return 0;
}

function findDependencyColumn(board) {
  return (board.columns || []).find(column => column.type === 'dependency');
}

function findTimeColumn(board, dependencyColumn) {
  const configuredId = dependencyColumn?.settings?.timeColumnId
    || dependencyColumn?.settings?.timelineColumnId
    || dependencyColumn?.settings?.dateColumnId;

  if (configuredId) {
    const configured = (board.columns || []).find(column => column.id === configuredId);
    if (configured) return configured;
  }

  return (board.columns || []).find(column => column.type === 'timeline' || column.type === 'date');
}

function dependsOn(item, predecessor) {
  const values = item.columnValues || {};
  for (const value of Object.values(values)) {
    if (!value || value.type !== 'dependency') continue;
    const localIds = value.linkedItemIds || [];
    const mondayIds = value.linkedMondayItemIds || [];
    if (localIds.map(String).includes(String(predecessor._id))) return true;
    if (predecessor.mondayId && mondayIds.map(String).includes(String(predecessor.mondayId))) return true;
  }
  return false;
}

function shiftTimeValue(value, deltaDays) {
  if (!value || !deltaDays) return value;
  if (value.type === 'date' || Object.prototype.hasOwnProperty.call(value, 'date')) {
    if (!value.date) return value;
    return { ...value, date: shiftDate(value.date, deltaDays) };
  }

  if (!value.from && !value.to) return value;
  return {
    ...value,
    from: value.from ? shiftDate(value.from, deltaDays) : value.from,
    to: value.to ? shiftDate(value.to, deltaDays) : value.to
  };
}

async function cascadeStrictDependencies({ boardId, changedItemId, deltaDays }) {
  if (!deltaDays) return [];

  const board = await Board.findById(boardId);
  if (!board) return [];

  const dependencyColumn = findDependencyColumn(board);
  if (!dependencyColumn) return [];
  if (dependencyColumn.settings?.dependency_mode !== 'strict') return [];

  const timeColumn = findTimeColumn(board, dependencyColumn);
  if (!timeColumn) return [];

  const items = await Item.find({
    board: board._id,
    deletedAt: null,
    archived: { $ne: true },
    isSubitem: { $ne: true }
  });
  const byId = new Map(items.map(item => [String(item._id), item]));
  const changed = byId.get(String(changedItemId));
  if (!changed) return [];

  const queue = [changed];
  const visited = new Set([String(changed._id)]);
  const shifted = [];

  while (queue.length) {
    const predecessor = queue.shift();
    const dependents = items.filter(item => !visited.has(String(item._id)) && dependsOn(item, predecessor));

    for (const dependent of dependents) {
      visited.add(String(dependent._id));
      const values = { ...(dependent.columnValues || {}) };
      const currentTime = values[timeColumn.id];

      // Monday dependencies shift existing dates; they do not create missing dates.
      if (currentTime) {
        values[timeColumn.id] = shiftTimeValue(currentTime, deltaDays);
        dependent.columnValues = values;
        dependent.markModified('columnValues');

        // Keep legacy v1 fields coherent while both engines coexist.
        if (timeColumn.type === 'timeline' && dependent.startDate && dependent.endDate) {
          dependent.startDate = new Date(dependent.startDate.getTime() + deltaDays * DAY_MS);
          dependent.endDate = new Date(dependent.endDate.getTime() + deltaDays * DAY_MS);
        }

        await dependent.save();
        shifted.push({ itemId: String(dependent._id), columnId: timeColumn.id, deltaDays });
      }

      queue.push(dependent);
    }
  }

  return shifted;
}

module.exports = {
  cascadeStrictDependencies,
  timelineDeltaDays,
  shiftDate,
  shiftTimeValue
};
