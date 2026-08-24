const express = require('express');
const router = express.Router();
const CrewMember = require('../models/CrewMember');

router.get('/', async (req, res) => {
  try {
    const crew = await CrewMember.find().sort({ order: 1, createdAt: 1 });
    res.json(crew);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const member = await CrewMember.findByIdAndUpdate(req.params.id, { $set: req.body }, {
      new: true,
      runValidators: true
    });
    if (!member) return res.status(404).json({ error: 'Crew member not found' });
    res.json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const member = new CrewMember(req.body);
    await member.save();
    res.status(201).json(member);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const member = await CrewMember.findByIdAndDelete(req.params.id);
    if (!member) return res.status(404).json({ error: 'Crew member not found' });
    res.json({ message: 'Member deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
