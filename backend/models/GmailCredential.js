import mongoose from 'mongoose';

const { Schema } = mongoose;

const GmailCredentialSchema = new Schema({
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Encrypted token stored as sub‑document { iv, authTag, data }
  encryptedToken: {
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    data: { type: String, required: true }
  },
  email: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GmailCredential', GmailCredentialSchema);
