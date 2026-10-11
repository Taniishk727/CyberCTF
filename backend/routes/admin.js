import express from 'express';
import PDFDocument from 'pdfkit';
import bcryptjs from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Event, Challenge, Submission, UnlockedHint, Category } from '../models/index.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { invalidateLeaderboardCache } from '../utils/leaderboardCache.js';

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

export default router;
