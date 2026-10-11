import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { User, Event } from '../models/index.js';
import { generateToken, authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const PLAYER_STARTING_SCORE = 150;

// Rate limiter for admin login (max 5 attempts per 15 minutes per IP)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many admin login attempts. Please try again after 15 minutes.' }
});

// Rate limiter for player join / login (max 30 requests per minute per IP)
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many join requests. Please wait a moment.' }
});

// POST /api/auth/join - Player joins event with username + PIN + passcode
router.post('/join', joinLimiter, async (req, res, next) => {
  try {
    const { username, gamePin, password, passcode } = req.body;
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedPin = typeof gamePin === 'string' ? gamePin.trim().toUpperCase() : '';
    const playerSecret = typeof (password || passcode) === 'string' ? (password || passcode).trim() : '';

    if (!trimmedUsername || !normalizedPin) {
      return res.status(400).json({ message: 'Username and game PIN are required' });
    }

    // Require passcode to prevent account hijacking
    if (!playerSecret || playerSecret.length < 4) {
      return res.status(400).json({ message: 'Passcode is required (minimum 4 characters)' });
    }

    // Find the event by PIN
    const event = await Event.findOne({ gamePin: normalizedPin, isActive: true })
      .select('_id name description')
      .lean();
    
    if (!event) {
      return res.status(404).json({ message: 'Invalid game PIN or event not active' });
    }

    // 1. Check if user already exists in this event
    let player = await User.findOne({ 
      username: trimmedUsername,
      eventId: event._id,
      role: 'player'
    }).select('+password');

    // 2. If not found in this event, check if registered without eventId (or for assignment)
    if (!player) {
      const unassignedPlayer = await User.findOne({
        username: trimmedUsername,
        eventId: null,
        role: 'player'
      }).select('+password');

      if (unassignedPlayer) {
        player = unassignedPlayer;
        player.eventId = event._id;
        await player.save();
      }
    }

    if (player) {
      // Check ban status
      const isPlayerBanned = (player.isBanned || player.status === 'banned')
        && (!player.banExpiresAt || player.banExpiresAt > new Date());

      if (isPlayerBanned) {
        return res.status(403).json({
          message: 'You are banned',
          reason: player.banReason || 'Violation of rules',
          banned: true
        });
      }

      // Verify passcode if account has password set
      if (player.password) {
        const isMatch = await player.comparePassword(playerSecret);
        if (!isMatch) {
          return res.status(401).json({ message: 'Incorrect passcode for this username' });
        }
      } else {
        // Upgrade legacy passwordless account
        player.password = playerSecret;
        await player.save();
      }

      const token = generateToken(player);

      return res.status(200).json({
        message: 'Welcome back!',
        token,
        user: {
          id: player._id,
          username: player.username,
          fullName: player.fullName,
          email: player.email,
          role: player.role,
          score: player.score,
          eventId: player.eventId
        },
        event: {
          id: event._id,
          name: event.name,
          description: event.description
        }
      });
    }

    // Check if username exists globally in another event to prevent confusing duplicates
    const existingOther = await User.findOne({ username: trimmedUsername, role: 'player' });
    if (existingOther) {
      return res.status(400).json({ message: 'Student ID / Username is already registered for another event' });
    }

    // Create new player account with password
    try {
      player = await User.create({
        username: trimmedUsername,
        password: playerSecret,
        role: 'player',
        eventId: event._id,
        score: PLAYER_STARTING_SCORE
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({ message: 'Username is already taken in this event' });
      }
      throw err;
    }

    const token = generateToken(player);

    res.status(201).json({
      message: 'Joined event successfully',
      token,
      user: {
        id: player._id,
        username: player.username,
        role: player.role,
        score: player.score,
        eventId: player.eventId
      },
      event: {
        id: event._id,
        name: event.name,
        description: event.description
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/admin/login - Admin login with username + password
router.post('/admin/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';

    if (!normalizedUsername || !normalizedPassword) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const admin = await User.findOne({ username: normalizedUsername, role: 'admin' }).select('+password');

    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isAdminBanned = (admin.isBanned || admin.status === 'banned')
      && (!admin.banExpiresAt || admin.banExpiresAt > new Date());

    if (isAdminBanned) {
      return res.status(403).json({
        message: 'You are banned',
        reason: admin.banReason || 'Violation of rules',
        banned: true
      });
    }

    const isMatch = await admin.comparePassword(normalizedPassword);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(admin);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = req.user;

    let eventData = null;
    if (user.eventId) {
      const event = await Event.findById(user.eventId).select('_id name description').lean();
      if (event) {
        eventData = {
          id: event._id,
          name: event.name,
          description: event.description
        };
      }
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        score: user.score,
        eventId: user.eventId
      },
      event: eventData
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/validate-pin - Validate game PIN (public)
router.post('/validate-pin', async (req, res, next) => {
  try {
    const { gamePin } = req.body;

    if (!gamePin) {
      return res.status(400).json({ message: 'Game PIN is required' });
    }

    const event = await Event.findOne({ gamePin, isActive: true });

    if (!event) {
      return res.status(404).json({ valid: false, message: 'Invalid game PIN' });
    }

    res.json({
      valid: true,
      event: {
        id: event._id,
        name: event.name
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/register-admin - Register first admin (protected with secret token)
router.post('/register-admin', adminLoginLimiter, async (req, res, next) => {
  try {
    const { email, password, registrationToken } = req.body;

    // Verify registration token using constant-time comparison
    const secretToken = process.env.ADMIN_REGISTRATION_TOKEN;
    if (!secretToken || typeof registrationToken !== 'string') {
      return res.status(403).json({ message: 'Invalid or missing registration token' });
    }

    const secretBuffer = Buffer.from(secretToken);
    const tokenBuffer = Buffer.from(registrationToken);
    if (secretBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(secretBuffer, tokenBuffer)) {
      return res.status(403).json({ message: 'Invalid or missing registration token' });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if any admin already exists (first-time setup only)
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(403).json({ message: 'Admin account already exists. Contact your system administrator.' });
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Create admin user
    const admin = await User.create({
      username: email.split('@')[0],
      email: email.toLowerCase(),
      password,
      role: 'admin'
    });

    const token = generateToken(admin);

    res.status(201).json({
      message: 'Admin account created successfully',
      token,
      user: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
