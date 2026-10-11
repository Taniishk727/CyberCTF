import express from 'express';
import { User, Submission } from '../models/index.js';
import { authMiddleware, requirePlayer } from '../middleware/auth.js';
import { getCurrentUserEntry, getEventLeaderboardSnapshot } from '../utils/leaderboardCache.js';

const router = express.Router();

// GET /api/user/rank - Get current user's rank in their event
router.get('/rank', authMiddleware, requirePlayer, async (req, res, next) => {
  try {
    const snapshot = await getEventLeaderboardSnapshot(req.user.eventId);
    const currentUser = getCurrentUserEntry(snapshot, req.user._id);

    if (!currentUser) {
      const currentUserRecord = await User.findById(req.user._id).select('_id username score createdAt').lean();

      if (!currentUserRecord) {
        return res.status(404).json({ message: 'User rank not found' });
      }

      const [rankAbove, solveCount] = await Promise.all([
        User.countDocuments({
          eventId: req.user.eventId,
          role: 'player',
          isBanned: { $ne: true },
          status: { $ne: 'banned' },
          $or: [
            { score: { $gt: currentUserRecord.score } },
            { score: currentUserRecord.score, createdAt: { $lt: currentUserRecord.createdAt } }
          ]
        }),
        Submission.countDocuments({
          userId: currentUserRecord._id,
          eventId: req.user.eventId,
          isCorrect: true
        })
      ]);

      return res.json({
        rank: rankAbove + 1,
        score: currentUserRecord.score,
        totalPlayers: snapshot.totalPlayers,
        username: currentUserRecord.username,
        cachedAt: snapshot.cachedAt,
        solveCount
      });
    }

    res.json({
      rank: currentUser.rank,
      score: currentUser.score,
      totalPlayers: snapshot.totalPlayers,
      username: currentUser.username,
      cachedAt: snapshot.cachedAt,
      solveCount: currentUser.solveCount
    });
  } catch (error) {
    next(error);
  }
});

export default router;
