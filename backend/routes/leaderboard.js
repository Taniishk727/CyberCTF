import express from 'express';
import { User, Submission } from '../models/index.js';
import { authMiddleware, requirePlayer } from '../middleware/auth.js';
import { getCurrentUserEntry, getEventLeaderboardSnapshot } from '../utils/leaderboardCache.js';

const router = express.Router();

// GET /api/leaderboard - Get leaderboard for player's event
router.get('/', authMiddleware, requirePlayer, async (req, res, next) => {
  try {
    const { eventId } = req.user;
    const snapshot = await getEventLeaderboardSnapshot(eventId);

    const leaderboard = snapshot.leaderboard.slice(0, 100).map((player) => ({
      ...player,
      isCurrentUser: player.id.toString() === req.user._id.toString()
    }));

    let currentUserRank = getCurrentUserEntry(snapshot, req.user._id);

    if (!currentUserRank) {
      const currentUser = await User.findById(req.user._id).select('_id username score createdAt').lean();

      if (!currentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Filter out banned players in rank calculation
      const [rankAbove, solveCount] = await Promise.all([
        User.countDocuments({
          eventId,
          role: 'player',
          isBanned: { $ne: true },
          status: { $ne: 'banned' },
          $or: [
            { score: { $gt: currentUser.score } },
            { score: currentUser.score, createdAt: { $lt: currentUser.createdAt } }
          ]
        }),
        Submission.countDocuments({
          userId: currentUser._id,
          eventId,
          isCorrect: true
        })
      ]);

      currentUserRank = {
        rank: rankAbove + 1,
        id: currentUser._id.toString(),
        username: currentUser.username,
        score: currentUser.score,
        solveCount,
        isCurrentUser: true
      };
    }

    res.json({
      leaderboard,
      currentUser: currentUserRank,
      totalPlayers: snapshot.totalPlayers,
      cachedAt: snapshot.cachedAt
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/leaderboard/history - Get leaderboard score progression over time
router.get('/history', authMiddleware, requirePlayer, async (req, res, next) => {
  try {
    const { eventId } = req.user;

    // Get top 10 active, non-banned users by score
    const topUsers = await User.find({
      eventId,
      role: 'player',
      isBanned: { $ne: true },
      status: { $ne: 'banned' }
    })
      .sort({ score: -1, createdAt: 1 })
      .limit(10)
      .select('_id username');

    if (topUsers.length === 0) {
      return res.json([]);
    }

    const userIds = topUsers.map(u => u._id);

    // Aggregate submissions by user and time, joining challenges to sum actual points
    const submissions = await Submission.aggregate([
      {
        $match: {
          userId: { $in: userIds },
          isCorrect: true,
          eventId: eventId
        }
      },
      {
        $lookup: {
          from: 'challenges',
          localField: 'challengeId',
          foreignField: '_id',
          as: 'challenge'
        }
      },
      {
        $unwind: '$challenge'
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            // Group by hour for better data visualization
            time: {
              $dateToString: {
                format: '%Y-%m-%dT%H:00:00Z',
                date: '$createdAt'
              }
            }
          },
          pointsAwarded: { $sum: '$challenge.points' }
        }
      },
      {
        $sort: { '_id.time': 1 }
      }
    ]);

    // Get user details to map IDs to usernames
    const userMap = {};
    topUsers.forEach(user => {
      userMap[user._id.toString()] = user.username;
    });

    // Build timeline with cumulative scores
    const timelineMap = {};
    const userScores = {};

    // Initialize user scores
    userIds.forEach(id => {
      userScores[id.toString()] = 0;
    });

    // Process submissions and calculate cumulative scores based on actual challenge points
    submissions.forEach(sub => {
      const userId = sub._id.userId.toString();
      const time = sub._id.time;

      userScores[userId] += sub.pointsAwarded;

      if (!timelineMap[time]) {
        timelineMap[time] = {};
      }
      timelineMap[time][userMap[userId]] = userScores[userId];
    });

    // Convert to array and ensure all users are represented at each timestamp
    const timeline = Object.entries(timelineMap).map(([time, data]) => {
      const point = { timestamp: time };
      userIds.forEach(id => {
        const username = userMap[id.toString()];
        point[username] = data[username] || point[username] || 0;
      });
      return point;
    });

    res.json(timeline);
  } catch (error) {
    next(error);
  }
});

export default router;
