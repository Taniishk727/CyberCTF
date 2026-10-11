import mongoose from 'mongoose';
import crypto from 'crypto';

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  gamePin: {
    type: String,
    required: true,
    unique: true,
    minlength: 6,
    maxlength: 6,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{6}$/.test(v);
      },
      message: 'Game PIN must be exactly 6 alphanumeric characters (A-Z, 0-9)'
    }
  },
  description: {
    type: String,
    default: ''
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate a random 6-character uppercase alphanumeric PIN (A-Z0-9)
eventSchema.statics.generatePin = async function() {
  let pin;
  let exists = true;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let attempts = 0;
  const maxAttempts = 100;
  
  while (exists && attempts < maxAttempts) {
    pin = '';
    for (let i = 0; i < 6; i++) {
      pin += chars.charAt(crypto.randomInt(0, chars.length));
    }
    exists = await this.findOne({ gamePin: pin });
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique PIN after 100 attempts');
  }
  
  // Ensure PIN is uppercase and exactly 6 chars
  pin = pin.toUpperCase().slice(0, 6);
  
  if (!/^[A-Z0-9]{6}$/.test(pin)) {
    throw new Error('Generated PIN does not match required format (6 alphanumeric characters)');
  }
  
  return pin;
};

eventSchema.index({ isActive: 1, gamePin: 1 });

const Event = mongoose.model('Event', eventSchema);

export default Event;
