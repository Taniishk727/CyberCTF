import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Challenge, Submission, UnlockedHint, User } from '../models/index.js';
import { authMiddleware, requirePlayer } from '../middleware/auth.js';
import { requireEventActive, requireEventOpen } from '../middleware/eventStatus.js';
import { invalidateLeaderboardCache } from '../utils/leaderboardCache.js';

const router = express.Router();

// Rate limiter for flag submissions (max 10 submissions per minute per user/IP)
// Prevents brute-forcing flags and server CPU exhaustion via bcryptjs.compare
const flagSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?._id ? req.user._id.toString() : ipKeyGenerator(req.ip)),
  message: { message: 'Too many flag submissions. Please wait 1 minute before trying again.' }
});

// Rate limiter for hint unlocking (max 15 unlocks per minute)
const hintUnlockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?._id ? req.user._id.toString() : ipKeyGenerator(req.ip)),
  message: { message: 'Too many hint unlock requests. Please wait a moment.' }
});

// GET /api/challenges - Get all challenges for player's event
router.get('/', authMiddleware, requirePlayer, requireEventActive, async (req, res, next) => {
  try {
    const { eventId } = req.user;

    const [challenges, solvedSubmissions, unlockedHints] = await Promise.all([
      Challenge.find({ eventId, isActive: true })
        .select('-flag')
        .sort({ category: 1, points: 1 })
        .lean(),
      Submission.find({
        userId: req.user._id,
        isCorrect: true,
        eventId
      }).select('challengeId').lean(),
      UnlockedHint.find({ userId: req.user._id }).select('challengeId hintIndex').lean()
    ]);

    // Get user's solved challenges
    const solvedIds = new Set(solvedSubmissions.map((s) => s.challengeId.toString()));

    // Get user's unlocked hints
    const unlockedHintsMap = {};
    unlockedHints.forEach(h => {
      if (!unlockedHintsMap[h.challengeId]) {
        unlockedHintsMap[h.challengeId] = [];
      }
      unlockedHintsMap[h.challengeId].push(h.hintIndex);
    });

    // Map challenges with solved status and hints
    const challengesWithStatus = challenges.map(challenge => {
      const challengeObj = { ...challenge };
      challengeObj.solved = solvedIds.has(challenge._id.toString());
      
      // Only show unlocked hints content
      const unlockedForChallenge = unlockedHintsMap[challenge._id.toString()] || [];
      challengeObj.hints = challenge.hints.map((hint, index) => ({
        index,
        cost: hint.cost,
        unlocked: unlockedForChallenge.includes(index),
        content: unlockedForChallenge.includes(index) ? hint.content : null
      }));

      return challengeObj;
    });

    res.json({ challenges: challengesWithStatus });
  } catch (error) {
    next(error);
  }
});

// GET /api/challenges/:id - Get single challenge
router.get('/:id', authMiddleware, requirePlayer, requireEventActive, async (req, res, next) => {
  try {
    const challenge = await Challenge.findOne({
      _id: req.params.id,
      eventId: req.user.eventId,
      isActive: true
    }).select('-flag').lean();

    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    // Check if solved
    const [solved, unlockedHints] = await Promise.all([
      Submission.findOne({
        userId: req.user._id,
        challengeId: challenge._id,
        isCorrect: true
      }).select('_id').lean(),
      UnlockedHint.find({
        userId: req.user._id,
        challengeId: challenge._id
      }).select('hintIndex').lean()
    ]);
    const unlockedIndices = unlockedHints.map(h => h.hintIndex);

    const challengeObj = { ...challenge };
    challengeObj.solved = !!solved;
    challengeObj.hints = challenge.hints.map((hint, index) => ({
      index,
      cost: hint.cost,
      unlocked: unlockedIndices.includes(index),
      content: unlockedIndices.includes(index) ? hint.content : null
    }));

    res.json({ challenge: challengeObj });
  } catch (error) {
    next(error);
  }
});

// POST /api/challenges/:id/submit - Submit flag
router.post('/:id/submit', authMiddleware, requirePlayer, requireEventOpen, flagSubmitLimiter, async (req, res, next) => {
  try {
    const { flag } = req.body;
    const challengeId = req.params.id;
    const userId = req.user._id;

    if (!flag || typeof flag !== 'string') {
      return res.status(400).json({ message: 'Flag is required' });
    }

    // Get challenge with flagHash (needed for validation)
    const challenge = await Challenge.findOne({
      _id: challengeId,
      eventId: req.user.eventId,
      isActive: true
    }).select('+flagHash');

    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    // Check if already solved
    const alreadySolved = await Submission.findOne({
      userId,
      challengeId,
      isCorrect: true
    });

    if (alreadySolved) {
      return res.status(400).json({ message: 'You have already solved this challenge' });
    }

    // Verify flag using bcrypt (secure comparison)
    const isCorrect = await challenge.verifyFlag(flag);

    if (isCorrect) {
      // ATOMIC CONCURRENCY FIX:
      // Insert correct submission first. The unique partial index on (userId, challengeId) for isCorrect: true
      // ensures that only ONE concurrent solve request will succeed.
      try {
        await Submission.create({
          userId,
          challengeId,
          eventId: req.user.eventId,
          isCorrect: true,
          submittedFlag: null
        });
      } catch (subErr) {
        if (subErr.code === 11000) {
          return res.status(400).json({ message: 'You have already solved this challenge' });
        }
        throw subErr;
      }

      // Update user score
      const updatedUser = await User.findByIdAndUpdate(userId, {
        $inc: { score: challenge.points }
      }, { new: true }).select('score');

      // Increment solve count
      await Challenge.findByIdAndUpdate(challengeId, {
        $inc: { solveCount: 1 }
      });

      invalidateLeaderboardCache(req.user.eventId);

      // SECURITY: Response does NOT include flag, hash, or any sensitive info
      return res.json({
        correct: true,
        message: 'Correct flag!',
        pointsAwarded: challenge.points,
        newScore: updatedUser.score
      });
    }

    // Incorrect flag: record submission for analytics
    await Submission.create({
      userId,
      challengeId,
      eventId: req.user.eventId,
      isCorrect: false,
      submittedFlag: flag.trim()
    });

    // SECURITY: Generic response for incorrect flag
    res.json({
      correct: false,
      message: 'Incorrect flag. Try again!'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/challenges/:id/hints/:hintIndex/unlock - Unlock a hint
router.post('/:id/hints/:hintIndex/unlock', authMiddleware, requirePlayer, requireEventOpen, hintUnlockLimiter, async (req, res, next) => {
  try {
    const { id: challengeId, hintIndex } = req.params;
    const userId = req.user._id;
    const hintIdx = parseInt(hintIndex, 10);

    const challenge = await Challenge.findOne({
      _id: challengeId,
      eventId: req.user.eventId,
      isActive: true
    }).select('hints isActive eventId').lean();

    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    if (isNaN(hintIdx) || hintIdx < 0 || hintIdx >= challenge.hints.length) {
      return res.status(400).json({ message: 'Invalid hint index' });
    }

    // Strictly prevent purchasing hints after the challenge is already solved
    const alreadySolved = await Submission.findOne({
      userId,
      challengeId,
      isCorrect: true
    });

    if (alreadySolved) {
      return res.status(400).json({ message: 'Cannot purchase hints for a solved challenge' });
    }

    // Check if already unlocked
    const existing = await UnlockedHint.findOne({
      userId,
      challengeId,
      hintIndex: hintIdx
    });

    if (existing) {
      return res.status(400).json({ message: 'Hint already unlocked' });
    }

    const hint = challenge.hints[hintIdx];
    const cost = hint.cost;

    // ATOMIC POINT DEDUCTION FIX:
    // Deduct points only if score >= cost atomically, avoiding race condition and negative scores
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, score: { $gte: cost } },
      { $inc: { score: -cost } },
      { new: true }
    ).select('score');

    if (!updatedUser) {
      return res.status(400).json({ message: 'Not enough points to unlock this hint' });
    }

    try {
      await UnlockedHint.create({
        userId,
        challengeId,
        hintIndex: hintIdx,
        cost
      });
    } catch (err) {
      // Roll back score deduction if hint record creation fails
      await User.findByIdAndUpdate(userId, { $inc: { score: cost } });
      if (err.code === 11000) {
        return res.status(400).json({ message: 'Hint already unlocked' });
      }
      throw err;
    }

    invalidateLeaderboardCache(req.user.eventId);

    res.json({
      message: 'Hint unlocked',
      hint: {
        index: hintIdx,
        content: hint.content,
        cost
      },
      newScore: updatedUser.score
    });
  } catch (error) {
    next(error);
  }
});

export default router;
