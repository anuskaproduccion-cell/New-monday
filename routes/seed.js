const express = require('express');
const router = express.Router();
const Board = require('../models/Board');
const Item = require('../models/Item');
const CrewMember = require('../models/CrewMember');

router.post('/', async (req, res) => {
  try {
    await Board.deleteMany({});
    await Item.deleteMany({});
    await CrewMember.deleteMany({});

    const boards = await Board.insertMany([
      { name: 'GY_PRE_POST', icon: '📋', order: 0 },
      { name: 'GY_SHOOTING', icon: '🎬', order: 1 },
      { name: 'GY_EDITING ASSISTANCE', icon: '🎞️', order: 2 },
      { name: 'GY_EDITING', icon: '✂️', order: 3 },
      { name: 'GY_POST', icon: '😈', order: 4 },
      { name: 'GY_POST_CREW', icon: '👥', order: 5 }
    ]);

    const boardMap = {};
    boards.forEach(b => { boardMap[b.name] = b._id; });

    await Item.insertMany([
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Carpeta de Producción', order: 0 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Shotlist', order: 1 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Screenplay', order: 2 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Shooting Plan', order: 3 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Frameio Project', order: 4 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Shared Drive', order: 5 },
      { board: boardMap['GY_PRE_POST'], group: 'PREP_POST', groupColor: '#579bfc', name: 'Bases de Datos', order: 6,
        subitems: [
          { name: 'Scenes' }, { name: 'Shoot Days' }, { name: 'Shotlist' },
          { name: 'Crew' }, { name: 'Personajes' }, { name: 'Gear' }, { name: 'Diálogos' }
        ]
      }
    ]);

    const shootingDays = ['D01_20XX_XX_XX', 'D02_20XX_XX_XX'];
    const shootingItems = [];
    shootingDays.forEach((day, di) => {
      const base = [
        { name: 'OCF', order: 0 }, { name: 'OSF', order: 1 }, { name: 'DAILIES', order: 2 },
        { name: 'REPORTES', order: 3, subitems: [
          { name: 'Cámara' }, { name: 'Script' }, { name: 'Sonido' },
          { name: 'Data' }, { name: 'Dit' }, { name: 'Producción' }
        ]},
        { name: 'METADATA', order: 4 }, { name: 'PROXIES', order: 5 }, { name: 'STILLS', order: 6 }
      ];
      base.forEach((item, i) => {
        shootingItems.push({
          board: boardMap['GY_SHOOTING'], group: day, groupColor: '#ff642e',
          name: item.name, order: di * 10 + i, subitems: item.subitems || [],
          extraFields: { raidA: '', raidB: '', raidC: '', frameIO: '', sharedDrive: '' }
        });
      });
    });
    await Item.insertMany(shootingItems);

    const editAssistDays = ['D01_20XX_XX_XX', 'D02_20XX_XX_XX'];
    const editAssistItems = [];
    editAssistDays.forEach((day, di) => {
      const tasks = [
        { name: 'Ingestar Metadata', extraFields: { tablero: 'METADATA' } },
        { name: 'Ingestar Clips', extraFields: { tablero: 'PROXIES' } },
        { name: 'Keywords' }, { name: 'Sincronizar Audio' },
        { name: 'Crear Multicams' }, { name: 'Crear Stingouts' }
      ];
      tasks.forEach((t, i) => {
        editAssistItems.push({
          board: boardMap['GY_EDITING ASSISTANCE'], group: day, groupColor: '#a25ddc',
          name: t.name, order: di * 10 + i, extraFields: t.extraFields || {}
        });
      });
    });
    await Item.insertMany(editAssistItems);

    await Item.insertMany([
      { board: boardMap['GY_EDITING'], group: 'SEQUENCES', groupColor: '#037f4c', name: 'Sec. 1_', order: 0 }
    ]);

    const postItems = [
      { group: '😈 EDITING_GY_18 WEEKS', groupColor: '#7e3b8a', name: 'Editing Assistance', status: 'Done', statusColor: '#00c875', startDate: '2026-05-25', endDate: '2026-05-25', formula: 0, order: 0 },
      { group: '😈 EDITING_GY_18 WEEKS', groupColor: '#7e3b8a', name: '1º Editing', status: 'Working on it', statusColor: '#fdab3d', startDate: '2026-05-25', endDate: '2026-07-31', formula: 10, order: 1 },
      { group: '😈 EDITING_GY_18 WEEKS', groupColor: '#7e3b8a', name: 'Rough Cut', startDate: '2026-07-31', endDate: '2026-07-31', formula: 0, order: 2 },
      { group: '😈 EDITING_GY_18 WEEKS', groupColor: '#7e3b8a', name: '2º Editing', status: 'Working on it', statusColor: '#fdab3d', startDate: '2026-08-17', endDate: '2026-10-09', formula: 8, order: 3 },
      { group: '😈 EDITING_GY_18 WEEKS', groupColor: '#7e3b8a', name: 'Picture Lock', startDate: '2026-10-09', endDate: '2026-10-09', formula: 0, dependency: 'Directors Cut', order: 4 },
      { group: '😈 ONLINE_GY_1 WEEK', groupColor: '#7e3b8a', name: 'Turnovers', startDate: '2026-10-12', endDate: '2026-10-16', formula: 1, dependency: 'Picture Lock', order: 5,
        subitems: [{ name: 'Subs' }, { name: 'Colour' }, { name: 'ADR' }, { name: 'Sound Editing' }, { name: 'VFX' }, { name: 'QT de Referencia' }]
      },
      { group: '😈 VFX_GY_1 WEEK', groupColor: '#cab641', name: 'VFX', startDate: '2026-10-19', endDate: '2026-10-23', formula: 1, dependency: 'Turnover para VFX', order: 6 },
      { group: '😈 VFX_GY_1 WEEK', groupColor: '#cab641', name: 'Conform', startDate: '2026-10-23', endDate: '2026-10-23', formula: 0, dependency: 'VFX', order: 7 },
      { group: '😈 COLOR_GY_2 + 1 WEEK', groupColor: '#e2445c', name: 'Color', startDate: '2026-10-26', endDate: '2026-11-06', formula: 2, dependency: 'Turnover para Colour', order: 8 },
      { group: '😈 COLOR_GY_2 + 1 WEEK', groupColor: '#e2445c', name: 'Secondary Correction', dependency: 'Color', order: 9 },
      { group: '😈 COLOR_GY_2 + 1 WEEK', groupColor: '#e2445c', name: 'Screening Test', startDate: '2026-11-09', endDate: '2026-11-09', dependency: 'Secondary Correction', order: 10 },
      { group: '😈 COLOR_GY_2 + 1 WEEK', groupColor: '#e2445c', name: 'Notes', startDate: '2026-11-09', endDate: '2026-11-12', dependency: 'Screening Test', order: 11 },
      { group: '😈 COLOR_GY_2 + 1 WEEK', groupColor: '#e2445c', name: 'Conform', startDate: '2026-11-13', endDate: '2026-11-13', dependency: 'Notes', order: 12 },
      { group: '😈 MUSIC_GY_2 WEEKS', groupColor: '#579bfc', name: 'Music', startDate: '2026-10-19', endDate: '2026-10-30', formula: 2, dependency: 'Turnover para Sound Editing', order: 13 },
      { group: '😈 MUSIC_GY_2 WEEKS', groupColor: '#579bfc', name: 'Music Mix', startDate: '2026-10-30', endDate: '2026-10-30', dependency: 'Music Production', order: 14 },
      { group: '😈 SOUND_GY_3 WEEKS', groupColor: '#00c875', name: 'Sound', startDate: '2026-10-19', endDate: '2026-10-30', formula: 2, dependency: 'Turnover para Sound Editing', order: 15 },
      { group: '😈 SOUND_GY_3 WEEKS', groupColor: '#00c875', name: 'Sound Mix', startDate: '2026-11-02', endDate: '2026-11-06', formula: 1, order: 16 },
      { group: '😈 CREDITS_GY_1 WEEK', groupColor: '#ff642e', name: 'Credits', startDate: '2026-10-19', endDate: '2026-10-23', formula: 1, order: 17 },
      { group: '😈 CREDITS_GY_1 WEEK', groupColor: '#ff642e', name: 'Conform', startDate: '2026-10-23', endDate: '2026-10-23', dependency: 'Start Credits, End Credits', order: 18 },
      { group: '😈 SUBS_GY_1 WEEK', groupColor: '#9cd326', name: 'Subs', startDate: '2026-10-19', endDate: '2026-10-23', formula: 1, dependency: 'Turnover para Subs', order: 19 },
      { group: '😈 SUBS_GY_1 WEEK', groupColor: '#9cd326', name: 'Conform', startDate: '2026-10-23', endDate: '2026-10-23', order: 20 },
      { group: '😈 DELIVERIES_GY_3 WEEKS', groupColor: '#784bd1', name: 'Conform Recepcion', startDate: '2026-11-16', endDate: '2026-11-20', formula: 1, order: 21 },
      { group: '😈 DELIVERIES_GY_3 WEEKS', groupColor: '#784bd1', name: 'QC', startDate: '2026-11-23', endDate: '2026-11-27', formula: 1, dependency: 'Conform Recepcion', order: 22 },
      { group: '😈 DELIVERIES_GY_3 WEEKS', groupColor: '#784bd1', name: 'Deliveries', startDate: '2026-11-30', endDate: '2026-12-04', order: 23 }
    ];
    await Item.insertMany(postItems.map(item => ({
      ...item, board: boardMap['GY_POST'],
      startDate: item.startDate ? new Date(item.startDate) : undefined,
      endDate: item.endDate ? new Date(item.endDate) : undefined
    })));

    await CrewMember.insertMany([
      { name: 'Andres Castaneda', role: 'Supervisor Postproducción', prefix: '+57', phone: '320 5636255', email: 'andrescastaned80@gmail.com', timezone: 'America/Bogota', order: 1 },
      { name: 'Anuska Baute', role: 'Coordinadora de Postproducción', prefix: '+34', phone: '670 97 88 34', email: 'anuskaproduccion@gmail.com', timezone: 'Atlantic/Canary', order: 2 },
      { name: '.', role: 'Compositor', prefix: '+34', timezone: 'Europe/Madrid', order: 3 },
      { name: '.', role: 'Colorista', timezone: 'Europe/Madrid', order: 4 },
      { name: 'Will', role: 'Editor', prefix: '+52', phone: '1 55 2671 0631', email: 'B1.66eta@gmail.com', timezone: 'Mexico/BajaSur', order: 5 },
      { name: '.', role: 'Asistente de Edición', timezone: 'Atlantic/Canary', order: 7 }
    ]);

    res.json({ message: 'Database seeded successfully with all GY_GUAYOTA data!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
