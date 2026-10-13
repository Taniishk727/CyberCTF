import express from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import bcryptjs from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Event, Challenge, Submission, UnlockedHint, Category } from '../models/index.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { invalidateLeaderboardCache } from '../utils/leaderboardCache.js';
import { getGmailConfig, sendEmailViaGmail, buildCredentialEmail, sendTestEmail } from '../utils/email.js';

const router = express.Router();
const { Types } = mongoose;
const PLAYER_STARTING_SCORE = 150;

function toObjectId(id) {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  return new Types.ObjectId(id);
}

function sanitizeUser(userDoc) {
  const user = userDoc?.toObject ? userDoc.toObject() : { ...(userDoc || {}) };
  delete user.password;
  delete user.sessionToken;
  return user;
}

// All routes require admin auth
router.use(authMiddleware, requireAdmin);

// ============ DASHBOARD ============

// GET /api/admin/dashboard - Get dashboard stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const [events, playerCounts, challengeCounts, submissionCounts] = await Promise.all([
      Event.find().sort({ createdAt: -1 }).select('_id name gamePin isActive startDate endDate').lean(),
      User.aggregate([
        { $match: { role: 'player' } },
        { $group: { _id: '$eventId', playerCount: { $sum: 1 } } }
      ]),
      Challenge.aggregate([
        { $group: { _id: '$eventId', challengeCount: { $sum: 1 } } }
      ]),
      Submission.aggregate([
        { $match: { isCorrect: true } },
        { $group: { _id: '$eventId', submissionCount: { $sum: 1 } } }
      ])
    ]);

    const playerCountMap = new Map(playerCounts.map((entry) => [entry._id?.toString?.() || String(entry._id), entry.playerCount]));
    const challengeCountMap = new Map(challengeCounts.map((entry) => [entry._id?.toString?.() || String(entry._id), entry.challengeCount]));
    const submissionCountMap = new Map(submissionCounts.map((entry) => [entry._id?.toString?.() || String(entry._id), entry.submissionCount]));

    const stats = events.map((event) => ({
      event: {
        id: event._id,
        name: event.name,
        gamePin: event.gamePin,
        isActive: event.isActive,
        startDate: event.startDate,
        endDate: event.endDate
      },
      playerCount: playerCountMap.get(event._id.toString()) || 0,
      challengeCount: challengeCountMap.get(event._id.toString()) || 0,
      submissionCount: submissionCountMap.get(event._id.toString()) || 0
    }));

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

// ============ EVENTS ============

// GET /api/admin/events - Get all events
router.get('/events', async (req, res, next) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/events - Create event
router.post('/events', async (req, res, next) => {
  try {
    const { name, description, startDate, endDate } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Event name is required' });
    }

    const gamePin = await Event.generatePin();
    
    // Validate PIN format before creating
    if (!/^[A-Z0-9]{6}$/.test(gamePin)) {
      return res.status(500).json({ message: 'PIN generation failed - invalid format' });
    }

    const event = await Event.create({
      name,
      description,
      gamePin,
      startDate: startDate || new Date(),
      endDate,
      isActive: true,
      createdBy: req.user._id
    });

    if (!event) {
      return res.status(500).json({ message: 'Failed to create event' });
    }

    res.status(201).json({ 
      event: {
        _id: event._id,
        name: event.name,
        description: event.description,
        gamePin: event.gamePin,
        startDate: event.startDate,
        endDate: event.endDate,
        isActive: event.isActive,
        createdAt: event.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/events/:id - Update event
router.put('/events/:id', async (req, res, next) => {
  try {
    const { name, description, startDate, endDate, isActive } = req.body;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { name, description, startDate, endDate, isActive },
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/events/:id - Delete event
router.delete('/events/:id', async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Also delete related data (categories, unlocked hints, challenges, players, submissions)
    const challenges = await Challenge.find({ eventId: event._id }).select('_id');
    const challengeIds = challenges.map(c => c._id);

    await Promise.all([
      Category.deleteMany({ eventId: event._id }),
      UnlockedHint.deleteMany({ challengeId: { $in: challengeIds } }),
      Challenge.deleteMany({ eventId: event._id }),
      User.deleteMany({ eventId: event._id, role: 'player' }),
      Submission.deleteMany({ eventId: event._id })
    ]);

    invalidateLeaderboardCache(event._id);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============ CHALLENGES ============

// GET /api/admin/challenges - Get all challenges (optionally filter by event)
router.get('/challenges', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const query = eventId ? { eventId } : {};

    const challenges = await Challenge.find(query)
      .populate('eventId', 'name')
      .select('-flagHash -flag') // SECURITY: Never expose flag or hash in API responses
      .sort({ eventId: 1, category: 1, points: 1 });

    res.json({ challenges });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/challenges - Create challenge
router.post('/challenges', async (req, res, next) => {
  try {
    const { 
      title, description, category, difficulty, points, 
      flag, flagFormat, attachments, hints, eventId 
    } = req.body;

    if (!title || !description || !category || !difficulty || !points || !flag || !eventId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Create challenge with plaintext flag
    // Pre-save middleware will hash it before storing
    const challenge = await Challenge.create({
      title,
      description,
      category,
      difficulty,
      points,
      flag,
      flagFormat: flagFormat || 'FLAG{...}',
      attachments: attachments || [],
      hints: hints || [],
      eventId,
      isActive: true
    });

    // Return challenge WITHOUT flag or flagHash (SECURITY)
    const responseChallenge = challenge.toObject();
    delete responseChallenge.flag;
    delete responseChallenge.flagHash;

    res.status(201).json({ challenge: responseChallenge });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/challenges/:id - Update challenge
router.put('/challenges/:id', async (req, res, next) => {
  try {
    const { 
      title, description, category, difficulty, points, 
      flag, flagFormat, attachments, hints, isActive, eventId
    } = req.body;

    const setData = {
      title,
      description,
      category,
      difficulty,
      points,
      flagFormat,
      attachments,
      hints,
      isActive,
      eventId
    };
    const updateData = Object.fromEntries(
      Object.entries(setData).filter(([, value]) => value !== undefined)
    );

    // findByIdAndUpdate does not run pre-save hooks, so hash manually here.
    if (typeof flag === 'string' && flag.trim()) {
      updateData.flagHash = await bcryptjs.hash(flag.trim(), 10);
    }

    const existingChallenge = await Challenge.findById(req.params.id);
    if (!existingChallenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    // Synchronize solver scores if points are changed
    if (points !== undefined && Number(points) !== existingChallenge.points) {
      const diff = Number(points) - existingChallenge.points;
      const solvedSubs = await Submission.find({ challengeId: existingChallenge._id, isCorrect: true }).select('userId');
      const solverIds = solvedSubs.map(s => s.userId);
      if (solverIds.length > 0) {
        await User.updateMany({ _id: { $in: solverIds } }, { $inc: { score: diff } });
      }
      invalidateLeaderboardCache(existingChallenge.eventId);
    }

    const challenge = await Challenge.findByIdAndUpdate(
      req.params.id,
      {
        $set: updateData,
        $unset: { flag: 1 }
      },
      { new: true, runValidators: true }
    ).select('-flagHash -flag'); // SECURITY: Never expose flag or hash

    res.json({ challenge });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/challenges/:id - Delete challenge
router.delete('/challenges/:id', async (req, res, next) => {
  try {
    const challenge = await Challenge.findByIdAndDelete(req.params.id);

    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    // Delete related submissions and unlocked hints
    await Promise.all([
      Submission.deleteMany({ challengeId: challenge._id }),
      UnlockedHint.deleteMany({ challengeId: challenge._id })
    ]);

    invalidateLeaderboardCache(challenge.eventId);

    res.json({ message: 'Challenge deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============ USERS ============

// GET /api/admin/users - Get all users (optionally filter by event)
router.get('/users', async (req, res, next) => {
  try {
    const { eventId, role } = req.query;
    const query = {};
    
    if (eventId) query.eventId = eventId;
    if (role) query.role = role;

    const users = await User.find(query)
      .select('-password -sessionToken')
      .populate('eventId', 'name')
      .sort({ score: -1, createdAt: 1 });

    const userIds = users.map((user) => user._id);
    const solveCounts = userIds.length
      ? await Submission.aggregate([
          {
            $match: {
              userId: { $in: userIds },
              isCorrect: true
            }
          },
          {
            $group: {
              _id: '$userId',
              solveCount: { $sum: 1 }
            }
          }
        ])
      : [];
    const solveCountMap = new Map(
      solveCounts.map((entry) => [entry._id.toString(), entry.solveCount])
    );

    const usersWithStats = users.map((user) => ({
      ...user.toObject(),
      solveCount: solveCountMap.get(user._id.toString()) || 0
    }));

    res.json({ users: usersWithStats });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users - Manually create a user
router.post('/users', async (req, res, next) => {
  try {
    const { username, password, email, fullName, eventId } = req.body;
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const trimmedPassword = typeof password === 'string' ? password.trim() : '';
    const trimmedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
    const trimmedFullName = typeof fullName === 'string' ? fullName.trim() : '';

    if (!trimmedUsername) {
      return res.status(400).json({ message: 'Username is required' });
    }

    if (!trimmedPassword || trimmedPassword.length < 4) {
      return res.status(400).json({ message: 'Password is required (minimum 4 characters)' });
    }

    // Check if user already exists
    const existing = await User.findOne({
      $or: [
        { username: trimmedUsername },
        ...(trimmedEmail ? [{ email: trimmedEmail }] : [])
      ]
    });

    if (existing) {
      if (existing.username.toLowerCase() === trimmedUsername.toLowerCase()) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
      return res.status(400).json({ message: 'Email is already registered to another account' });
    }

    let targetEventId = null;
    if (eventId) {
      const eventObjId = toObjectId(eventId);
      if (eventObjId) {
        const eventExists = await Event.findById(eventObjId);
        if (eventExists) {
          targetEventId = eventExists._id;
        }
      }
    }

    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(trimmedPassword, salt);

    const newUser = await User.create({
      username: trimmedUsername,
      password: hashedPassword,
      email: trimmedEmail,
      fullName: trimmedFullName,
      role: 'player',
      eventId: targetEventId,
      score: PLAYER_STARTING_SCORE
    });

    invalidateLeaderboardCache(targetEventId);

    res.status(201).json({
      message: 'User created successfully',
      user: sanitizeUser(newUser)
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id/status - Update user status
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { status, reason, banExpiresAt } = req.body;
    
    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot ban an admin' });
    }

    user.status = status;
    if (status === 'banned') {
      user.isBanned = true;
      user.banReason = typeof reason === 'string' ? reason.trim() : (user.banReason || 'Violation of rules');
      user.banExpiresAt = banExpiresAt ? new Date(banExpiresAt) : null;
    } else {
      user.isBanned = false;
      user.banReason = '';
      user.banExpiresAt = null;
    }
    // Forcibly clear active sessions if banned
    if (status === 'banned') {
      user.sessionToken = null; 
    }
    
    await user.save();
    invalidateLeaderboardCache(user.eventId);
    res.json({ message: `User ${status}`, user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/ban/:userId - Ban a player with reason
router.post('/ban/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { banReason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot ban an admin' });
    }

    user.isBanned = true;
    user.status = 'banned';
    user.banReason = typeof banReason === 'string' && banReason.trim()
      ? banReason.trim()
      : 'Violation of rules';
    user.sessionToken = null;

    await user.save();
    invalidateLeaderboardCache(user.eventId);

    return res.json({
      message: 'User banned successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/unban/:userId - Unban a player
router.post('/unban/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isBanned = false;
    user.status = 'active';
    user.banReason = '';
    user.banExpiresAt = null;

    await user.save();
    invalidateLeaderboardCache(user.eventId);

    return res.json({
      message: 'User unbanned successfully',
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/users/:id/reset - Reset user score and unlocks
router.post('/users/:id/reset', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.score = PLAYER_STARTING_SCORE;
    await user.save();

    await Submission.deleteMany({ userId: user._id });
    await UnlockedHint.deleteMany({ userId: user._id });
    invalidateLeaderboardCache(user.eventId);

    res.json({ message: 'User progress reset successfully' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/users/:id - Delete user (players only)
router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot delete admin users' });
    }

    await User.findByIdAndDelete(req.params.id);
    await Submission.deleteMany({ userId: user._id });
    await UnlockedHint.deleteMany({ userId: user._id });
    invalidateLeaderboardCache(user.eventId);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/users - Delete all players (optionally filtered by event)
router.delete('/users', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const query = { role: 'player' };

    let eventObjectId = null;
    if (eventId) {
      eventObjectId = toObjectId(eventId);
      if (eventObjectId) {
        query.eventId = eventObjectId;
      }
    }

    // Find all players matching the query to delete their submissions and unlocked hints
    const playersToDelete = await User.find(query).select('_id eventId').lean();
    const playerIds = playersToDelete.map(p => p._id);

    if (playerIds.length === 0) {
      return res.json({ message: 'No players found to delete', deletedCount: 0 });
    }

    await Promise.all([
      User.deleteMany({ _id: { $in: playerIds } }),
      Submission.deleteMany({ userId: { $in: playerIds } }),
      UnlockedHint.deleteMany({ userId: { $in: playerIds } })
    ]);

    // Invalidate caches for affected events
    const affectedEventIds = [...new Set(playersToDelete.map(p => p.eventId?.toString()).filter(Boolean))];
    affectedEventIds.forEach(id => invalidateLeaderboardCache(id));

    res.json({
      message: `Successfully deleted ${playerIds.length} player(s)`,
      deletedCount: playerIds.length
    });
  } catch (error) {
    next(error);
  }
});

// ============ ANALYTICS ============

// GET /api/admin/analytics/:eventId - Get visual analytics for an event
router.get('/analytics/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const eventObjectId = toObjectId(eventId);

    if (!eventObjectId) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    // Verify event exists
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // 1. CATEGORY DISTRIBUTION - Count challenges by category
    const categoryDistribution = await Challenge.aggregate([
      { $match: { eventId: eventObjectId } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // 2. SOLVE RATES - Efficient single aggregation query (eliminates N+1 DB round-trips)
    const [challenges, submissionStats] = await Promise.all([
      Challenge.find({ eventId: eventObjectId }).select('_id title category').lean(),
      Submission.aggregate([
        { $match: { eventId: eventObjectId } },
        {
          $group: {
            _id: '$challengeId',
            totalSubmissions: { $sum: 1 },
            correctSubmissions: {
              $sum: { $cond: ['$isCorrect', 1, 0] }
            }
          }
        }
      ])
    ]);

    const statsMap = new Map(
      submissionStats.map(s => [s._id ? s._id.toString() : '', s])
    );

    const solveRates = challenges.map((challenge) => {
      const stats = statsMap.get(challenge._id.toString()) || { totalSubmissions: 0, correctSubmissions: 0 };
      const total = stats.totalSubmissions;
      const solves = stats.correctSubmissions;
      const percent = total > 0 ? Math.round((solves / total) * 100) : 0;

      return {
        challenge: challenge.title,
        category: challenge.category,
        percent,
        solves,
        total
      };
    });

    // 3. ACTIVITY TIMELINE - Submissions over time (hourly)
    const activity = await Submission.aggregate([
      {
        $match: { eventId: eventObjectId }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%dT%H:00:00Z',
              date: '$createdAt'
            }
          },
          submissions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          time: '$_id',
          submissions: 1,
          _id: 0
        }
      }
    ]);

    res.json({
      categoryDistribution,
      solveRates,
      activity
    });
  } catch (error) {
    next(error);
  }
});

// ============ EXPORTS ============

// GET /api/admin/leaderboard/:eventId/progression - Get score progression for top players over time
router.get('/leaderboard/:eventId/progression', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const eventObjectId = toObjectId(eventId);
    const { limit = 10 } = req.query;
    const topN = Math.min(parseInt(limit) || 10, 20); // Cap at 20

    if (!eventObjectId) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    // Verify event exists
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Get top N non-banned players
    const topPlayers = await User.find({
      eventId: eventObjectId,
      role: 'player',
      isBanned: { $ne: true },
      status: { $ne: 'banned' }
    })
      .select('_id username score')
      .sort({ score: -1 })
      .limit(topN);

    if (topPlayers.length === 0) {
      return res.json({ progression: [] });
    }

    // For each player, get their score progression based on submissions
    const progressionData = await Promise.all(
      topPlayers.map(async (player) => {
        // Get all correct submissions for this player, sorted by time
        const submissions = await Submission.find({
          userId: player._id,
          isCorrect: true,
          eventId: eventObjectId
        })
          .populate('challengeId', 'points')
          .sort({ createdAt: 1 });

        // Calculate cumulative score over time
        let cumulativeScore = PLAYER_STARTING_SCORE;
        const timelinePoints = submissions.map((sub) => {
          cumulativeScore += sub.challengeId?.points || 0;
          return {
            time: sub.createdAt,
            score: cumulativeScore
          };
        });

        // Add final data point
        if (timelinePoints.length === 0) {
          timelinePoints.push({
            time: player.createdAt || new Date(),
            score: PLAYER_STARTING_SCORE
          });
        }

        return {
          username: player.username,
          userId: player._id,
          finalScore: player.score,
          timeline: timelinePoints
        };
      })
    );

    // Merge all timelines into hourly buckets for chart display
    // Find all unique timestamps and create hourly aggregates
    const allTimestamps = new Set();
    progressionData.forEach(pd => {
      pd.timeline.forEach(tp => {
        const hourStart = new Date(tp.time);
        hourStart.setMinutes(0, 0, 0);
        allTimestamps.add(hourStart.getTime());
      });
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    // Build chart data
    const chartData = sortedTimestamps.map(timestamp => {
      const point = { time: new Date(timestamp).toISOString() };
      
      progressionData.forEach(playerData => {
        // Find the score at or before this timestamp
        let score = PLAYER_STARTING_SCORE;
        for (let i = playerData.timeline.length - 1; i >= 0; i--) {
          if (new Date(playerData.timeline[i].time) <= new Date(timestamp)) {
            score = playerData.timeline[i].score;
            break;
          }
        }
        point[playerData.username] = score;
      });
      
      return point;
    });

    res.json({ 
      event,
      players: progressionData.map(pd => ({ 
        username: pd.username, 
        finalScore: pd.finalScore 
      })),
      chartData 
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/leaderboard/:eventId - Get leaderboard data as JSON (for Streaming Mode)
router.get('/leaderboard/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const eventObjectId = toObjectId(eventId);

    if (!eventObjectId) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    // Verify event exists
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Fetch non-banned leaderboard for this event
    const players = await User.find({ 
      eventId: eventObjectId,
      role: 'player',
      isBanned: { $ne: true },
      status: { $ne: 'banned' }
    })
      .select('username score createdAt')
      .sort({ score: -1, createdAt: 1 });

    const playerIds = players.map((player) => player._id);
    const solveCounts = playerIds.length
      ? await Submission.aggregate([
          {
            $match: {
              eventId: eventObjectId,
              isCorrect: true,
              userId: { $in: playerIds }
            }
          },
          {
            $group: {
              _id: '$userId',
              solveCount: { $sum: 1 }
            }
          }
        ])
      : [];
    const solveCountMap = new Map(
      solveCounts.map((entry) => [entry._id.toString(), entry.solveCount])
    );

    const leaderboard = players.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      score: player.score,
      solveCount: solveCountMap.get(player._id.toString()) || 0
    }));

    res.json({ event, leaderboard });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/leaderboard/:eventId/export - Export leaderboard as PDF
router.get('/leaderboard/:eventId/export', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const eventObjectId = toObjectId(eventId);

    if (!eventObjectId) {
      return res.status(400).json({ message: 'Invalid event id' });
    }

    // Verify event exists
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Fetch non-banned leaderboard for this event
    const players = await User.find({ 
      eventId: eventObjectId,
      role: 'player',
      isBanned: { $ne: true },
      status: { $ne: 'banned' }
    })
      .select('username score createdAt')
      .sort({ score: -1, createdAt: 1 });

    if (players.length === 0) {
      return res.status(400).json({ message: 'No players found for this event' });
    }

    const playerIds = players.map((player) => player._id);
    const solveCounts = playerIds.length
      ? await Submission.aggregate([
          {
            $match: {
              eventId: eventObjectId,
              isCorrect: true,
              userId: { $in: playerIds }
            }
          },
          {
            $group: {
              _id: '$userId',
              solveCount: { $sum: 1 }
            }
          }
        ])
      : [];
    const solveCountMap = new Map(
      solveCounts.map((entry) => [entry._id.toString(), entry.solveCount])
    );

    const leaderboard = players.map((player, index) => ({
      rank: index + 1,
      username: player.username,
      score: player.score,
      solveCount: solveCountMap.get(player._id.toString()) || 0
    }));

    // Generate PDF
    const doc = new PDFDocument({
      bufferPages: true,
      margin: 50
    });

    // Set filename for download
    const filename = `leaderboard_${event.name.replace(/\s+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe to response
    doc.pipe(res);

    // Title
    doc.fontSize(24).font('Helvetica-Bold').text('Event Leaderboard', { align: 'center' });
    
    // Event info
    doc.fontSize(12).font('Helvetica').text(`Event: ${event.name}`, 50, 80);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 100);
    doc.text(`Total Players: ${leaderboard.length}`, 50, 120);

    // Table header
    const tableTop = 160;
    const col1X = 50;    // Rank
    const col2X = 120;   // Username
    const col3X = 280;   // Solves
    const col4X = 380;   // Score

    doc.fontSize(11).font('Helvetica-Bold');
    doc.text('Rank', col1X, tableTop);
    doc.text('Username', col2X, tableTop);
    doc.text('Solves', col3X, tableTop);
    doc.text('Score', col4X, tableTop);

    // Horizontal line under header
    doc.moveTo(50, tableTop + 20).lineTo(550, tableTop + 20).stroke();

    // Table rows
    let yPosition = tableTop + 30;
    const rowHeight = 20;

    doc.fontSize(10).font('Helvetica');
    leaderboard.forEach((player) => {
      doc.text(`#${player.rank}`, col1X, yPosition);
      doc.text(player.username, col2X, yPosition);
      doc.text(player.solveCount.toString(), col3X, yPosition);
      doc.text(player.score.toString(), col4X, yPosition);
      yPosition += rowHeight;

      // Add new page if needed
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }
    });

    // Footer
    doc.fontSize(9).font('Helvetica').fillColor('#999');
    doc.text(`Generated on ${new Date().toISOString()}`, 50, doc.page.height - 30);

    // Finalize PDF
    doc.end();
  } catch (error) {
    next(error);
  }
});

// ============ CATEGORIES ============

// GET /api/admin/categories - Get all categories (optionally filter by event)
router.get('/categories', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const query = eventId ? { eventId } : {};

    const categories = await Category.find(query)
      .populate('eventId', 'name')
      .sort({ name: 1 });

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/categories - Create category
router.post('/categories', async (req, res, next) => {
  try {
    const { name, description, color, eventId } = req.body;

    if (!name || !eventId) {
      return res.status(400).json({ message: 'Category name and eventId are required' });
    }

    // Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Check if category already exists for this event
    const existing = await Category.findOne({ name, eventId });
    if (existing) {
      return res.status(400).json({ message: 'Category already exists for this event' });
    }

    const category = await Category.create({
      name: name.trim(),
      description: description || '',
      color: color || '#3b82f6',
      eventId
    });

    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/categories/:id - Update category
router.put('/categories/:id', async (req, res, next) => {
  try {
    const { name, description, color } = req.body;

    const oldCategory = await Category.findById(req.params.id);
    if (!oldCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const newName = typeof name === 'string' && name.trim() ? name.trim() : oldCategory.name;

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: newName, description, color },
      { new: true, runValidators: true }
    );

    // If category name changed, cascade update to existing challenges
    if (newName !== oldCategory.name) {
      await Challenge.updateMany(
        { category: oldCategory.name, eventId: oldCategory.eventId },
        { $set: { category: newName } }
      );
    }

    res.json({ category });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/categories/:id - Delete category
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if any challenges use this category
    const challengeCount = await Challenge.countDocuments({ category: category.name, eventId: category.eventId });

    if (challengeCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${challengeCount} associated challenge(s)` 
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// ============ PARTICIPANT REGISTRATION & CREDENTIAL SYSTEM ============

// Ephemeral in-memory store for pending credential delivery batches (TTL: 2 hours)
// Never persists passwords to the database
const pendingCredentialBatches = new Map();

function cleanExpiredBatches() {
  const now = Date.now();
  for (const [batchId, item] of pendingCredentialBatches.entries()) {
    if (now - item.createdAt > 2 * 60 * 60 * 1000) {
      pendingCredentialBatches.delete(batchId);
    }
  }
}

// Generate a cryptographically secure random temporary password (minimum 10 chars, mixed alphanumeric)
function generateSecureTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pwd = '';
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
}

// Helper: validate student ID and email
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim().toLowerCase());
}

function isValidStudentId(id) {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return trimmed.length >= 2 && trimmed.length <= 50;
}

// GET /api/admin/participants/email-config - Check Gmail connection status for this admin
router.get('/participants/email-config', async (req, res) => {
  const config = await getGmailConfig(req.user._id.toString());
  res.json({
    configured: config.configured,
    fromEmail: config.fromEmail,
    provider: 'gmail'
  });
});

// POST /api/admin/participants/test-email - Send a test email via Gmail
router.post('/participants/test-email', async (req, res, next) => {
  try {
    const { email } = req.body;
    const targetEmail = (email && typeof email === 'string' && email.trim()) || req.user.email;

    if (!targetEmail || !isValidEmail(targetEmail)) {
      return res.status(400).json({ message: 'A valid recipient email address is required for test email' });
    }

    const result = await sendTestEmail({ adminId: req.user._id.toString(), recipientEmail: targetEmail.trim() });
    res.json({ message: `Test email sent successfully to ${targetEmail}`, result });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/preview - Preview and validate CSV registration rows
router.post('/participants/preview', async (req, res, next) => {
  try {
    const { rows, eventId } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No rows provided in payload' });
    }

    if (rows.length > 500) {
      return res.status(400).json({ message: 'Import limit exceeded (maximum 500 participants per batch)' });
    }

    const seenIds = new Set();
    const seenEmails = new Set();
    const candidateIds = [];
    const candidateEmails = [];

    rows.forEach(r => {
      const studentId = typeof r.studentId === 'string' ? r.studentId.trim() : '';
      const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
      if (studentId) candidateIds.push(studentId);
      if (email) candidateEmails.push(email);
    });

    // Query DB for existing users with matching username or email
    const [existingUsersById, existingUsersByEmail] = await Promise.all([
      User.find({ username: { $in: candidateIds } }).select('_id username email role eventId status emailDelivery').lean(),
      candidateEmails.length ? User.find({ email: { $in: candidateEmails } }).select('_id username email role eventId status emailDelivery').lean() : []
    ]);

    const existingIdMap = new Map(existingUsersById.map(u => [u.username.toLowerCase(), u]));
    const existingEmailMap = new Map(existingUsersByEmail.map(u => [u.email.toLowerCase(), u]));

    const validatedRows = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateInCsvCount = 0;
    let existingAccountCount = 0;
    let newAccountCount = 0;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const studentId = typeof row.studentId === 'string' ? row.studentId.trim() : '';
      const fullName = typeof row.fullName === 'string' ? row.fullName.trim() : (row.name ? String(row.name).trim() : '');
      const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';

      const errors = [];

      if (!studentId) {
        errors.push('Student ID is missing');
      } else if (!isValidStudentId(studentId)) {
        errors.push('Student ID has invalid format');
      }

      if (!email) {
        errors.push('Email address is missing');
      } else if (!isValidEmail(email)) {
        errors.push('Invalid email format');
      }

      // Check CSV duplicate
      const lowerId = studentId.toLowerCase();
      const lowerEmail = email.toLowerCase();

      let isCsvDup = false;
      if (studentId && seenIds.has(lowerId)) {
        errors.push('Duplicate Student ID in file');
        isCsvDup = true;
      }
      if (email && seenEmails.has(lowerEmail)) {
        errors.push('Duplicate Email in file');
        isCsvDup = true;
      }

      if (studentId) seenIds.add(lowerId);
      if (email) seenEmails.add(lowerEmail);

      // Check DB existing
      const existingById = studentId ? existingIdMap.get(lowerId) : null;
      const existingByEmail = email ? existingEmailMap.get(lowerEmail) : null;
      const isExisting = Boolean(existingById || existingByEmail);

      if (existingById) {
        errors.push(`Account already exists with this Student ID (${existingById.role})`);
      } else if (existingByEmail) {
        errors.push(`Email already registered to account "${existingByEmail.username}"`);
      }

      const isValid = errors.length === 0;

      if (isCsvDup) {
        duplicateInCsvCount++;
      } else if (isExisting) {
        existingAccountCount++;
      }

      if (isValid) {
        validCount++;
        newAccountCount++;
      } else {
        invalidCount++;
      }

      validatedRows.push({
        index,
        studentId,
        fullName,
        email,
        isValid,
        isExisting,
        isCsvDup,
        errors,
        existingUser: existingById ? { id: existingById._id, username: existingById.username, email: existingById.email } : null
      });
    }

    res.json({
      summary: {
        totalRows: rows.length,
        validCount,
        invalidCount,
        duplicateInCsvCount,
        existingAccountCount,
        newAccountCount
      },
      rows: validatedRows
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/create - Create accounts for validated participants
router.post('/participants/create', async (req, res, next) => {
  try {
    const { participants, eventId } = req.body;

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ message: 'No participants provided for creation' });
    }

    const eventObjId = toObjectId(eventId);
    if (!eventObjId) {
      return res.status(400).json({ message: 'A valid event is required to create participants' });
    }
    const targetEvent = await Event.findById(eventObjId).select('_id name gamePin');
    if (!targetEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const adminId = req.user._id.toString();
    const gmailConfig = await getGmailConfig(adminId);
    if (!gmailConfig.configured) {
      return res.status(503).json({
        message: 'Connect the official Gmail account before creating participants so their credentials can be emailed immediately.'
      });
    }

    const targetEventId = targetEvent._id;

    const createdUsers = [];
    const skippedUsers = [];
    const deliveryBatch = [];

    for (const p of participants) {
      const studentId = typeof p.studentId === 'string' ? p.studentId.trim() : '';
      const fullName = typeof p.fullName === 'string' ? p.fullName.trim() : '';
      const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';

      if (!studentId || !isValidStudentId(studentId) || !email || !isValidEmail(email)) {
        skippedUsers.push({ studentId, email, reason: 'Invalid ID or email format' });
        continue;
      }

      // Check if user already exists
      const existing = await User.findOne({
        $or: [{ username: studentId }, { email }]
      }).lean();

      if (existing) {
        skippedUsers.push({ studentId, email, reason: 'Account already exists' });
        continue;
      }

      // Generate secure temporary password
      const tempPassword = generateSecureTemporaryPassword();
      const salt = await bcryptjs.genSalt(10);
      const hashedPassword = await bcryptjs.hash(tempPassword, salt);

      try {
        const newUser = await User.create({
          username: studentId,
          email,
          fullName,
          password: hashedPassword,
          role: 'player',
          eventId: targetEventId,
          score: PLAYER_STARTING_SCORE,
          emailDelivery: {
            status: 'pending',
            sentAt: null,
            error: '',
            messageId: ''
          }
        });

        createdUsers.push({
          id: newUser._id,
          username: newUser.username,
          fullName: newUser.fullName,
          email: newUser.email,
          status: newUser.status,
          emailDelivery: newUser.emailDelivery
        });

        // Store temporarily in memory batch for immediate or delayed credential sending
        deliveryBatch.push({
          studentId: newUser.username,
          fullName: newUser.fullName,
          email: newUser.email,
          temporaryPassword: tempPassword,
          userId: newUser._id.toString()
        });
      } catch (err) {
        if (err.code === 11000) {
          skippedUsers.push({ studentId, email, reason: 'Duplicate username or email collision' });
        } else {
          skippedUsers.push({ studentId, email, reason: err.message || 'Creation error' });
        }
      }
    }

    const delivery = { sent: 0, failed: 0, details: [] };
    for (const item of deliveryBatch) {
      try {
        const { html, text } = buildCredentialEmail({
          studentId: item.studentId,
          temporaryPassword: item.temporaryPassword,
          gamePin: targetEvent.gamePin
        });
        const messageId = await sendEmailViaGmail({
          adminId,
          to: item.email,
          subject: `${targetEvent.name} — Your Account Credentials`,
          html,
          text
        });
        await User.findByIdAndUpdate(item.userId, {
          $set: {
            'emailDelivery.status': 'sent',
            'emailDelivery.sentAt': new Date(),
            'emailDelivery.messageId': messageId || '',
            'emailDelivery.error': ''
          }
        });
        const createdUser = createdUsers.find(user => user.id.toString() === item.userId);
        if (createdUser) createdUser.emailDelivery = { status: 'sent', messageId: messageId || '' };
        delivery.sent++;
        delivery.details.push({ username: item.studentId, email: item.email, status: 'sent' });
      } catch (error) {
        await User.findByIdAndUpdate(item.userId, {
          $set: {
            'emailDelivery.status': 'failed',
            'emailDelivery.error': error.message || 'Delivery failed'
          }
        });
        const createdUser = createdUsers.find(user => user.id.toString() === item.userId);
        if (createdUser) createdUser.emailDelivery = { status: 'failed', error: error.message || 'Delivery failed' };
        delivery.failed++;
        delivery.details.push({ username: item.studentId, email: item.email, status: 'failed', error: error.message || 'Delivery failed' });
      }
    }

    res.status(201).json({
      message: `Created ${createdUsers.length} participant account(s); ${delivery.sent} credential email(s) sent, ${delivery.failed} failed.`,
      summary: {
        createdCount: createdUsers.length,
        skippedCount: skippedUsers.length,
        emailsSent: delivery.sent,
        emailsFailed: delivery.failed
      },
      delivery,
      createdUsers,
      skippedUsers
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/participants - List participants and delivery statuses with filtering
router.get('/participants', async (req, res, next) => {
  try {
    const { eventId, search, deliveryStatus, status, limit = 200, skip = 0 } = req.query;

    const query = { role: 'player' };

    if (eventId) {
      const eventObjId = toObjectId(eventId);
      if (eventObjId) {
        query.eventId = eventObjId;
      }
    }

    if (deliveryStatus && ['not_sent', 'pending', 'sent', 'failed'].includes(deliveryStatus)) {
      query['emailDelivery.status'] = deliveryStatus;
    }

    if (status && ['active', 'banned'].includes(status)) {
      query.status = status;
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { username: regex },
        { fullName: regex },
        { email: regex }
      ];
    }

    const [participants, totalCount, statusCounts] = await Promise.all([
      User.find(query)
        .select('-password -sessionToken')
        .populate('eventId', 'name gamePin')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .lean(),
      User.countDocuments(query),
      User.aggregate([
        { $match: { role: 'player' } },
        {
          $group: {
            _id: '$emailDelivery.status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const deliveryBreakdown = {
      not_sent: 0,
      pending: 0,
      sent: 0,
      failed: 0
    };
    statusCounts.forEach(c => {
      if (c._id && deliveryBreakdown[c._id] !== undefined) {
        deliveryBreakdown[c._id] = c.count;
      }
    });

    res.json({
      total: totalCount,
      deliveryBreakdown,
      participants
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/send-credentials - Send credential emails for a batch via Gmail
router.post('/participants/send-credentials', async (req, res, next) => {
  try {
    const { batchId, loginUrl } = req.body;

    if (!batchId || !pendingCredentialBatches.has(batchId)) {
      return res.status(404).json({
        message: 'Delivery batch not found or expired. Batch credentials are kept in memory for 2 hours after creation for security.'
      });
    }

    // Verify Gmail is connected for this admin before starting
    const gmailConfig = await getGmailConfig(req.user._id.toString());
    if (!gmailConfig.configured) {
      return res.status(503).json({
        message: 'Gmail not connected. Connect your Gmail account via the Email Settings page before dispatching credentials.'
      });
    }

    const batch = pendingCredentialBatches.get(batchId);
    const items = batch.items;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No participants remaining in this delivery batch' });
    }

    const results = {
      sent: 0,
      failed: 0,
      details: []
    };

    // Mark users as pending
    const userIds = items.map(i => toObjectId(i.userId)).filter(Boolean);
    await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { 'emailDelivery.status': 'pending' } }
    );

    // Send emails in chunks of 5 — Gmail API allows ~250 emails/day for standard accounts,
    // 600ms delay between chunks keeps us well within quota.
    const CHUNK_SIZE = 5;
    const adminId = req.user._id.toString();

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (item) => {
          try {
            const { html, text } = buildCredentialEmail({
              studentId: item.studentId,
              fullName: item.fullName,
              temporaryPassword: item.temporaryPassword,
              loginUrl,
              eventName: batch.eventName
            });

            const subject = `🚩 ${batch.eventName || 'FlagHunters CTF'} — Your Account Credentials`;
            const gmailMessageId = await sendEmailViaGmail({
              adminId,
              to: item.email,
              subject,
              html,
              text
            });

            await User.findByIdAndUpdate(item.userId, {
              $set: {
                'emailDelivery.status': 'sent',
                'emailDelivery.sentAt': new Date(),
                'emailDelivery.messageId': gmailMessageId || '',
                'emailDelivery.error': ''
              }
            });

            results.sent++;
            results.details.push({
              studentId: item.studentId,
              email: item.email,
              status: 'sent',
              messageId: gmailMessageId || ''
            });
          } catch (err) {
            await User.findByIdAndUpdate(item.userId, {
              $set: {
                'emailDelivery.status': 'failed',
                'emailDelivery.error': err.message || 'Delivery failed'
              }
            });

            results.failed++;
            results.details.push({
              studentId: item.studentId,
              email: item.email,
              status: 'failed',
              error: err.message || 'Failed to send'
            });
          }
        })
      );

      // Brief pause between chunks to respect Gmail API rate limits
      if (i + CHUNK_SIZE < items.length) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // Clean up used batch from memory
    pendingCredentialBatches.delete(batchId);

    res.json({
      message: `Completed credential dispatch: ${results.sent} sent, ${results.failed} failed.`,
      results
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/participants/retry-credentials - Regenerate temp password and retry failed deliveries via Gmail
router.post('/participants/retry-credentials', async (req, res, next) => {
  try {
    const { userIds, loginUrl, eventName } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'No participant IDs provided for retry' });
    }

    // Verify Gmail is connected for this admin
    const gmailConfig = await getGmailConfig(req.user._id.toString());
    if (!gmailConfig.configured) {
      return res.status(503).json({
        message: 'Gmail not connected. Connect your Gmail account via the Email Settings page before retrying credentials.'
      });
    }

    const objectIds = userIds.map(toObjectId).filter(Boolean);
    const users = await User.find({ _id: { $in: objectIds }, role: 'player' });

    if (users.length === 0) {
      return res.status(404).json({ message: 'No matching player accounts found' });
    }

    const results = {
      sent: 0,
      failed: 0,
      details: []
    };

    const CHUNK_SIZE = 5;
    const adminId = req.user._id.toString();

    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (user) => {
          try {
            if (!user.email || !isValidEmail(user.email)) {
              throw new Error('User does not have a valid email address');
            }

            const userEvent = user.eventId
              ? await Event.findById(user.eventId).select('gamePin').lean()
              : null;
            if (!userEvent?.gamePin) {
              throw new Error('Event room PIN is unavailable for this participant');
            }

            // Generate a fresh temporary password only after confirming the
            // event room credential is available for the delivery.
            const tempPassword = generateSecureTemporaryPassword();
            const salt = await bcryptjs.genSalt(10);
            const hashedPassword = await bcryptjs.hash(tempPassword, salt);

            user.password = hashedPassword;
            user.emailDelivery.status = 'pending';
            await user.save();

            const { html, text } = buildCredentialEmail({
              studentId: user.username,
              temporaryPassword: tempPassword,
              gamePin: userEvent.gamePin
            });

            const subject = `🚩 ${eventName || 'FlagHunters CTF'} — Your Account Credentials (Updated)`;
            const gmailMessageId = await sendEmailViaGmail({
              adminId,
              to: user.email,
              subject,
              html,
              text
            });

            user.emailDelivery.status = 'sent';
            user.emailDelivery.sentAt = new Date();
            user.emailDelivery.messageId = gmailMessageId || '';
            user.emailDelivery.error = '';
            await user.save();

            results.sent++;
            results.details.push({
              studentId: user.username,
              email: user.email,
              status: 'sent',
              messageId: gmailMessageId || ''
            });
          } catch (err) {
            user.emailDelivery.status = 'failed';
            user.emailDelivery.error = err.message || 'Delivery retry failed';
            await user.save();

            results.failed++;
            results.details.push({
              studentId: user.username,
              email: user.email,
              status: 'failed',
              error: err.message || 'Failed to send'
            });
          }
        })
      );

      if (i + CHUNK_SIZE < users.length) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    res.json({
      message: `Completed retry dispatch: ${results.sent} sent, ${results.failed} failed.`,
      results
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/participants/export - Export registration and delivery status as CSV
router.get('/participants/export', async (req, res, next) => {
  try {
    const { eventId } = req.query;
    const query = { role: 'player' };
    if (eventId) {
      const eventObjId = toObjectId(eventId);
      if (eventObjId) query.eventId = eventObjId;
    }

    const participants = await User.find(query)
      .select('username fullName email status emailDelivery createdAt')
      .populate('eventId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const headers = ['Student ID (Username)', 'Full Name', 'Email', 'Account Status', 'Email Delivery Status', 'Sent At', 'Error Details', 'Event Name', 'Registered Date'];
    
    const rows = participants.map(p => {
      const regDate = p.createdAt ? new Date(p.createdAt) : null;
      const regDateStr = regDate && !isNaN(regDate.getTime()) ? regDate.toISOString() : '';
      const sentDate = p.emailDelivery?.sentAt ? new Date(p.emailDelivery.sentAt) : null;
      const sentDateStr = sentDate && !isNaN(sentDate.getTime()) ? sentDate.toISOString() : '';

      return [
        `"${(p.username || '').replace(/"/g, '""')}"`,
        `"${(p.fullName || '').replace(/"/g, '""')}"`,
        `"${(p.email || '').replace(/"/g, '""')}"`,
        `"${p.status || 'active'}"`,
        `"${p.emailDelivery?.status || 'not_sent'}"`,
        `"${sentDateStr}"`,
        `"${(p.emailDelivery?.error || '').replace(/"/g, '""')}"`,
        `"${(p.eventId?.name || '').replace(/"/g, '""')}"`,
        `"${regDateStr}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="flaghunters_participants_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
});

export default router;

