import express from 'express';
import { Category } from '../models/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { ensureDefaultCategories } from '../utils/defaultCategories.js';

const router = express.Router();

// GET /api/categories - Get categories for an event
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    let eventId;

    if (req.user.role === 'player') {
      // Strictly isolate players to their assigned event
      eventId = req.user.eventId;
    } else {
      // Admin can query specified eventId or fallback to user.eventId
      eventId = req.query.eventId || req.user.eventId;
    }

    if (!eventId) {
      return res.status(400).json({ message: 'Event ID is required' });
    }

    await ensureDefaultCategories(eventId);
    const categories = await Category.find({ eventId }).sort({ name: 1 });

    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

export default router;
