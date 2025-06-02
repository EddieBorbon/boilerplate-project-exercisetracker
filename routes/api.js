const express = require('express');
const router = express.Router();
const User = require('/models/User');

// 1. Create user
router.post('/', async (req, res) => {
  const newUser = new User({ username: req.body.username });
  await newUser.save();
  res.json({ username: newUser.username, _id: newUser._id });
});

// 2. Get all users
router.get('/', async (req, res) => {
  const users = await User.find({}, 'username _id');
  res.json(users);
});

// 3. Add exercise
router.post('/:id/exercises', async (req, res) => {
  const { description, duration, date } = req.body;
  const user = await User.findById(req.params.id);

  const newExercise = {
    description,
    duration: Number(duration),
    date: date ? new Date(date) : new Date()
  };

  user.log.push(newExercise);
  await user.save();

  res.json({
    username: user.username,
    description: newExercise.description,
    duration: newExercise.duration,
    date: newExercise.date.toDateString(),
    _id: user._id
  });
});

// 4. Get exercise log
router.get('/:id/logs', async (req, res) => {
  const { from, to, limit } = req.query;
  const user = await User.findById(req.params.id);

  let log = user.log;

  if (from) {
    const fromDate = new Date(from);
    log = log.filter(ex => ex.date >= fromDate);
  }

  if (to) {
    const toDate = new Date(to);
    log = log.filter(ex => ex.date <= toDate);
  }

  if (limit) {
    log = log.slice(0, parseInt(limit));
  }

  res.json({
    username: user.username,
    count: log.length,
    _id: user._id,
    log: log.map(e => ({
      description: e.description,
      duration: e.duration,
      date: e.date.toDateString()
    }))
  });
});

module.exports = router;
