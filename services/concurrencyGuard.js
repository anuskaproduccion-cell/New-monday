function parseExpectedUpdatedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function buildVersionedItemQuery(id, expectedUpdatedAt, extra = {}) {
  const expected = parseExpectedUpdatedAt(expectedUpdatedAt);
  if (!expected) return null;
  return {
    _id: id,
    updatedAt: expected,
    ...extra
  };
}

function timestampsEqual(left, right) {
  const a = parseExpectedUpdatedAt(left);
  const b = parseExpectedUpdatedAt(right);
  return Boolean(a && b && a.getTime() === b.getTime());
}

module.exports = {
  parseExpectedUpdatedAt,
  buildVersionedItemQuery,
  timestampsEqual
};
