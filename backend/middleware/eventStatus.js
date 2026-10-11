import Event from '../models/Event.js';

/**
 * Middleware to check if an event is currently active and has started.
 * Applied to reading challenges and event details.
 */
export const requireEventActive = async (req, res, next) => {
  try {
    if (!req.user || !req.user.eventId) {
      return res.status(400).json({ message: 'User is not associated with an event' });
    }

    const event = await Event.findById(req.user.eventId).select('name isActive startDate endDate').lean();

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(403).json({ message: 'Event is currently inactive' });
    }

    const now = new Date();
    if (event.startDate && now < new Date(event.startDate)) {
      return res.status(403).json({
        message: 'The competition has not started yet',
        startDate: event.startDate
      });
    }

    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if an event is currently running and accepting submissions/hint purchases.
 * Blocks actions if competition has ended or not started yet.
 */
export const requireEventOpen = async (req, res, next) => {
  try {
    if (!req.user || !req.user.eventId) {
      return res.status(400).json({ message: 'User is not associated with an event' });
    }

    const event = req.event || await Event.findById(req.user.eventId).select('name isActive startDate endDate').lean();

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(403).json({ message: 'Event is currently inactive' });
    }

    const now = new Date();
    if (event.startDate && now < new Date(event.startDate)) {
      return res.status(403).json({
        message: 'The competition has not started yet',
        startDate: event.startDate
      });
    }

    if (event.endDate && now > new Date(event.endDate)) {
      return res.status(403).json({
        message: 'The competition has ended. Submissions and hint unlocks are closed.',
        endDate: event.endDate
      });
    }

    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};
