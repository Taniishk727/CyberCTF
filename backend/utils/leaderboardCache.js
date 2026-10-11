import { User, Submission } from '../models/index.js';

const CACHE_TTL_MS = 15000;
const leaderboardCache = new Map();

function normalizeEventId(eventId) {
  return eventId?.toString?.() || String(eventId || '');
}

function getCachedSnapshot(eventId) {
  const key = normalizeEventId(eventId);
  const entry = leaderboardCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.snapshot && entry.expiresAt > Date.now()) {
    return entry.snapshot;
  }

  if (entry.promise) {
    return entry.promise;
  }

  leaderboardCache.delete(key);
  return null;
}

function setCachedPromise(eventId, promise) {
  const key = normalizeEventId(eventId);
  leaderboardCache.set(key, {
    promise,
    snapshot: null,
    expiresAt: 0
  });
}

function setCachedSnapshot(eventId, snapshot) {
  const key = normalizeEventId(eventId);
  leaderboardCache.set(key, {
    snapshot,
    promise: null,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function invalidateLeaderboardCache(eventId) {
  const key = normalizeEventId(eventId);
  if (key) {
    leaderboardCache.delete(key);
  }
}

export async function getEventLeaderboardSnapshot(eventId) {
  const cached = getCachedSnapshot(eventId);
  if (cached) {
    return cached;
  }

  const existing = leaderboardCache.get(normalizeEventId(eventId));
  if (existing?.promise) {
    return existing.promise;
  }

  const buildPromise = (async () => {
    const [players, solveCounts] = await Promise.all([
      User.find({
        eventId,
        role: 'player',
        isBanned: { $ne: true },
        status: { $ne: 'banned' }
      })
        .select('_id username score createdAt')
        .sort({ score: -1, createdAt: 1 })
        .lean(),
      Submission.aggregate([
        {
          $match: {
            eventId,
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
    ]);

    const solveCountMap = new Map(
      solveCounts.map((entry) => [entry._id.toString(), entry.solveCount])
    );

    const leaderboard = players.map((player, index) => ({
      rank: index + 1,
      id: player._id.toString(),
      username: player.username,
      score: player.score,
      solveCount: solveCountMap.get(player._id.toString()) || 0,
      isCurrentUser: false
    }));

    const rankByUserId = new Map();
    leaderboard.forEach((player) => {
      rankByUserId.set(player.id, player);
    });

    const snapshot = {
      leaderboard,
      totalPlayers: leaderboard.length,
      rankByUserId,
      cachedAt: Date.now()
    };

    setCachedSnapshot(eventId, snapshot);
    return snapshot;
  })().catch((error) => {
    leaderboardCache.delete(normalizeEventId(eventId));
    throw error;
  });

  setCachedPromise(eventId, buildPromise);
  return buildPromise;
}

export function getCurrentUserEntry(snapshot, userId) {
  if (!snapshot || !userId) {
    return null;
  }

  const entry = snapshot.rankByUserId.get(userId.toString());
  if (!entry) {
    return null;
  }

  return {
    ...entry,
    isCurrentUser: true
  };
}
