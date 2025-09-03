// controllers/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const SALT_ROUNDS = 12;

// POST /auth/sign-up
router.post('/sign-up', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ err: 'username, email, and password are required' });
    }

    const taken = await User.findOne({ $or: [{ username }, { email }] });
    if (taken) return res.status(409).json({ err: 'Username or email already taken.' });

    const user = await User.create({
      username,
      email,
      hashedPassword: bcrypt.hashSync(password, SALT_ROUNDS),
    });

    const payload = { username: user.username, _id: user._id };
    const token = jwt.sign({ payload }, process.env.JWT_SECRET);
    return res.status(201).json({ token });
  } catch (err) {
    return res.status(400).json({ err: err.message });
  }
});

// POST /auth/sign-in
router.post('/sign-in', async (req, res) => {
  try {
    const identifier = req.body.email || req.body.username || req.body.emailOrUsername;
    const { password } = req.body || {};

    if (!identifier || !password) {
      return res.status(400).json({ err: 'email/username and password are required' });
    }

    // IMPORTANT: select the hash (usually select:false in the schema)
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select('+hashedPassword');

    if (!user || !user.hashedPassword) {
      return res.status(401).json({ err: 'Invalid credentials.' });
    }

    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) return res.status(401).json({ err: 'Invalid credentials.' });

    const payload = { username: user.username, _id: user._id };
    const token = jwt.sign({ payload }, process.env.JWT_SECRET);
    return res.json({ token });
  } catch (err) {
    console.error('sign-in error:', err);
    return res.status(400).json({ err: err.message || 'Sign-in failed' });
  }
});

module.exports = router;
