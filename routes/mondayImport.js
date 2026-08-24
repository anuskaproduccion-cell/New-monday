const express = require('express');
const router = express.Router();
const { getAccountInventory, getBoardSnapshot } = require('../services/mondayReadOnlyClient');

// This router is intentionally read-only with respect to Monday.
// It can inspect/preview source data, but it never sends a mutation to Monday.
router.get('/preview', async (req, res) => {
  try {
    const inventory = await getAccountInventory();
    res.json({
      readOnly: true,
      policy: 'Monday is a source/reference only. Mutations are forbidden.',
      counts: inventory.counts,
      workspaces: inventory.workspaces,
      visibleBoards: inventory.visibleBoards.map(board => ({
        id: board.id,
        name: board.name,
        state: board.state,
        kind: board.board_kind,
        workspace: board.workspace,
        groupCount: board.groups?.length || 0,
        columns: (board.columns || []).map(column => ({
          id: column.id,
          title: column.title,
          type: column.type,
          description: column.description,
          settings: parseSettings(column.settings_str)
        })),
        views: board.views || []
      })),
      internalSubitemBoards: inventory.internalSubitemBoards.map(board => ({
        id: board.id,
        name: board.name,
        workspace: board.workspace
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message, readOnly: true });
  }
});

router.get('/preview/board/:mondayBoardId', async (req, res) => {
  try {
    const snapshot = await getBoardSnapshot(req.params.mondayBoardId);
    res.json({
      ...snapshot,
      policy: 'Monday is read-only. This endpoint only reads a snapshot.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message, readOnly: true });
  }
});

function parseSettings(settings) {
  if (!settings) return {};
  try { return JSON.parse(settings); } catch (e) { return { raw: settings }; }
}

module.exports = router;
