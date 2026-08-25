const Board = require('../models/Board');

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function workdaysInclusive(startValue, endValue) {
  let start = parseDateOnly(startValue);
  let end = parseDateOnly(endValue);
  if (!start || !end) return null;
  if (start > end) [start, end] = [end, start];

  let count = 0;
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function scalarValue(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (typeof value === 'object') {
    for (const candidate of [value.value, value.text, value.displayValue]) {
      if (candidate !== undefined && candidate !== null && candidate !== '') {
        const number = Number(candidate);
        if (!Number.isNaN(number)) return number;
      }
    }
  }
  return 0;
}

function parseCurrentWeeksFormula(formula) {
  if (!formula) return null;

  // The connected Monday account currently uses one formula pattern across its
  // schedule boards, with only the referenced column ids changing:
  // MAX(ROUNDDOWN(WORKDAYS({timeline#End}, {timeline#Start}) / 5, 0) - {overlap}, 0)
  const match = formula.match(
    /WORKDAYS\(\{([^#}]+)#End\},\s*\{([^#}]+)#Start\}\)\s*\/\s*5[\s\S]*?-\s*\{([^}]+)\}/i
  );
  if (!match) return null;
  if (match[1] !== match[2]) return null;

  return {
    timelineColumnId: match[1],
    overlapColumnId: match[3]
  };
}

function evaluateFormula(formula, columnValues) {
  const parsed = parseCurrentWeeksFormula(formula);
  if (!parsed) return { supported: false, value: null };

  const timeline = columnValues?.[parsed.timelineColumnId];
  const start = timeline?.from;
  const end = timeline?.to;
  const workdays = workdaysInclusive(start, end);
  if (workdays === null) return { supported: true, value: null };

  const overlap = scalarValue(columnValues?.[parsed.overlapColumnId]);
  const weeks = Math.floor(workdays / 5);
  return { supported: true, value: Math.max(weeks - overlap, 0) };
}

function recalculateFormulaValues(board, item) {
  const values = { ...(item.columnValues || {}) };
  let changed = false;

  for (const column of board.columns || []) {
    if (column.type !== 'formula') continue;
    const formula = column.settings?.formula || '';
    const result = evaluateFormula(formula, values);
    if (!result.supported) continue;

    values[column.id] = {
      type: 'formula',
      formula,
      value: result.value,
      displayValue: result.value === null ? '' : String(result.value),
      calculated: true
    };
    changed = true;
  }

  if (changed) {
    item.columnValues = values;
    item.markModified('columnValues');
  }

  return changed;
}

async function recalculateAndSaveItem(item) {
  const board = await Board.findById(item.board);
  if (!board) return false;
  const changed = recalculateFormulaValues(board, item);
  if (changed) await item.save();
  return changed;
}

module.exports = {
  workdaysInclusive,
  parseCurrentWeeksFormula,
  evaluateFormula,
  recalculateFormulaValues,
  recalculateAndSaveItem
};
