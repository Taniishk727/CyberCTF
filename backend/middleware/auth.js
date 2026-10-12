import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verify JWT and attach user to request
// This middleware verifies JWT without checking sessionToken,
// allowing multiple simultaneous sessions per user
export const authMiddleware = async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const now = new Date();
    const isBanActive = (user.isBanned || user.status === 'banned')
      && (!user.banExpiresAt || user.banExpiresAt > now);

    // Block banned users before any route-level logic
    if (isBanActive) {
      return res.status(403).json({
        message: 'You are banned',
        reason: user.banReason || 'Violation of rules',
        banned: true
      });
    }

    // Auto-recover users whose temporary ban has expired.
    if (!isBanActive && (user.isBanned || user.status === 'banned')) {
      User.updateOne(
        { _id: user._id },
        { $set: { isBanned: false, status: 'active', banReason: '', banExpiresAt: null } }
      ).catch(() => {});
      user.isBanned = false;
      user.status = 'active';
      user.banReason = '';
      user.banExpiresAt = null;
    }

    // ✓ FIXED: Removed sessionToken validation to allow multiple simultaneous sessions
    // JWT expiration (7 days) handles session validity automatically

    req.user = user;
    next();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth middleware error:', error.message);
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Require player role
export const requirePlayer = (req, res, next) => {
  if (req.user.role !== 'player') {
    return res.status(403).json({ message: 'Player access required' });
  }
  next();
};

// Require admin role
export const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Generate JWT token (7 day expiry)
// ✓ FIXED: Removed sessionToken from JWT payload
// Multiple sessions are now allowed per user
export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id, 
      role: user.role,
      isBanned: !!user.isBanned
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};
