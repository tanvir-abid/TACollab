const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

router.post('/register', async (req, res) => {
  try {
    const {fullName, username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({ fullName, username, email, password });
    await user.save();

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({ message: 'Login successful', token, username: user.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logout successful' });
});

// Get current user info (used by editor for Socket.IO)
router.get('/current-user', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('username email');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ _id: user._id,fullName: user.fullName, username: user.username, email: user.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile (kept for backward compatibility)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;