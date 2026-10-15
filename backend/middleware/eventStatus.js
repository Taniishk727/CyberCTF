import Event from '../models/Event.js';

/**
 * Middleware to check whether a player's event exists and is active.
 * Challenge visibility and scheduled start time are checked separately so
 * players can join a room early and receive a clear locked state.
 */
export const requireEventActive = async (req, res, next) => {
  try {
    if (!req.user || !req.user.eventId) {
      return res.status(400).json({ message: 'User is not associated with an event' });
    }

    const event = await Event.findById(req.user.eventId)
      .select('name isActive startDate endDate questionsVisible')
      .lean();

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!event.isActive) {
      return res.status(403).json({ message: 'Event is currently inactive' });
    }

    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};

export function getQuestionVisibility(event, now = new Date()) {
  if (event?.questionsVisible !== true) {
    return {
      visible: false,
      message: 'Questions are locked by the event organizer.'
    };
  }

  if (event.startDate && now < new Date(event.startDate)) {
    return {
      visible: false,
      message: 'Questions will be available when the room starts.',
      startDate: event.startDate
    };
  }

  return { visible: true, message: '' };
}

export const requireQuestionsVisible = (req, res, next) => {
  const visibility = getQuestionVisibility(req.event);
  if (!visibility.visible) {
    return res.status(423).json({ locked: true, ...visibility });
  }
  next();
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

    const event = req.event || await Event.findById(req.user.eventId)
      .select('name isActive startDate endDate questionsVisible')
      .lean();

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

    const visibility = getQuestionVisibility(event, now);
    if (!visibility.visible) {
      return res.status(423).json({ locked: true, ...visibility });
    }

    req.event = event;
    next();
  } catch (error) {
    next(error);
  }
};
