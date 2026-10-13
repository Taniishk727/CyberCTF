import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Setup environment variables before imports
// Notice: RESEND_API_KEY and EMAIL_FROM are completely omitted!
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-secret-key-12345678901234567890';
process.env.FRONTEND_URL = 'https://cyber-ctf-seven.vercel.app';
process.env.GMAIL_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
process.env.GMAIL_CLIENT_SECRET = 'test-client-secret-98765';
process.env.GMAIL_REDIRECT_URI = 'https://cyberctf-rg8k.onrender.com/api/email/oauth/callback';
process.env.GMAIL_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

// Mock mongoose connection so tests can exercise routes without an external MongoDB server
const memoryUsers = [];
const memoryCredentials = [];
const memoryEvents = [{
  _id: new mongoose.Types.ObjectId(),
  name: 'FlagHunters 2026',
  gamePin: 'GAME99',
  isActive: true
}];

const fakeCollection = {
  indexes: () => Promise.resolve([]),
  createIndex: () => Promise.resolve(),
  find: () => ({
    select: () => ({
      sort: () => ({ lean: () => Promise.resolve([]) })
    }),
    sort: () => ({ lean: () => Promise.resolve([]) })
  }),
  findOne: () => Promise.resolve(null)
};
const fakeDb = {
  collection: () => fakeCollection
};
mongoose.connection.db = fakeDb;
Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

// Mock googleapis
const sentGmailMessages = [];
const { google } = await import('googleapis');
google.auth = google.auth || {};
google.auth.OAuth2 = class MockOAuth2 {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }
  generateAuthUrl({ scope, state, access_type }) {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=${encodeURIComponent(scope.join(' '))}&state=${state}&access_type=${access_type}`;
  }
  getToken(code) {
    if (code === 'valid-code') {
      return Promise.resolve({
        tokens: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token-123',
          token_type: 'Bearer',
          expiry_date: Date.now() + 3600000
        }
      });
    }
    return Promise.reject(new Error('Invalid grant code'));
  }
  setCredentials(tokens) {
    this.credentials = tokens;
  }
};

google.gmail = () => ({
  users: {
    getProfile: () => Promise.resolve({ data: { emailAddress: 'cybercell@pict.edu' } }),
    messages: {
      send: ({ requestBody }) => {
        const id = `gmail_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        sentGmailMessages.push({ id, raw: requestBody?.raw });
        return Promise.resolve({ data: { id } });
      }
    }
  }
});

google.oauth2 = () => ({
  userinfo: {
    get: () => Promise.resolve({ data: { email: 'cybercell@pict.edu' } })
  }
});

const { default: app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Event } = await import('../models/Event.js');
const { default: GmailCredential } = await import('../models/GmailCredential.js');
const { encrypt } = await import('../utils/crypto.js');

// Helper to generate admin and player JWT tokens
const adminUserId = new mongoose.Types.ObjectId().toString();
const playerUserId = new mongoose.Types.ObjectId().toString();

function getAdminToken() {
  return jwt.sign(
    { userId: adminUserId, role: 'admin', isBanned: false },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function getPlayerToken() {
  return jwt.sign(
    { userId: playerUserId, role: 'player', isBanned: false },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Gmail API Migration & Bulk Participants Suite', () => {
  let server;
  let baseUrl;
  let adminToken;
  let playerToken;

  before(async () => {
    adminToken = getAdminToken();
    playerToken = getPlayerToken();

    // Mock User queries in memory for deterministic suite testing
    User.findById = (id) => {
      const match = memoryUsers.find(u => u._id.toString() === id?.toString());
      const userDoc = match || {
        _id: id,
        role: id?.toString() === playerUserId ? 'player' : 'admin',
        username: id?.toString() === playerUserId ? 'testplayer' : 'superadmin',
        email: 'admin@pict.edu',
        isBanned: false,
        status: 'active'
      };
      return {
        select: () => Promise.resolve(userDoc),
        then: (resolve) => resolve(userDoc)
      };
    };

    User.findByIdAndUpdate = (id, update) => {
      const match = memoryUsers.find(u => u._id.toString() === id?.toString());
      if (match && update.$set) {
        Object.assign(match, update.$set);
        if (update.$set['emailDelivery.status']) {
          match.emailDelivery = match.emailDelivery || {};
          match.emailDelivery.status = update.$set['emailDelivery.status'];
          match.emailDelivery.sentAt = update.$set['emailDelivery.sentAt'];
          match.emailDelivery.messageId = update.$set['emailDelivery.messageId'];
          match.emailDelivery.error = update.$set['emailDelivery.error'];
        }
      }
      return {
        select: () => Promise.resolve(match),
        then: (resolve) => resolve(match)
      };
    };

    User.find = (query) => {
      let filtered = [...memoryUsers];
      if (query?.username?.$in) {
        filtered = filtered.filter(u => query.username.$in.includes(u.username));
      }
      if (query?.email?.$in) {
        filtered = filtered.filter(u => query.email.$in.includes(u.email));
      }
      if (query?._id?.$in) {
        const idStrs = query._id.$in.map(i => i.toString());
        filtered = filtered.filter(u => idStrs.includes(u._id.toString()));
      }
      const makeChain = () => ({
        select: () => makeChain(),
        populate: () => makeChain(),
        sort: () => makeChain(),
        limit: () => makeChain(),
        skip: () => makeChain(),
        lean: () => Promise.resolve(filtered),
        then: (resolve) => resolve(filtered)
      });
      return makeChain();
    };

    User.findOne = (query) => {
      if (query?.$or) {
        const matched = memoryUsers.find(u => 
          u.username === query.$or[0]?.username || u.email === query.$or[1]?.email
        );
        return {
          lean: () => Promise.resolve(matched || null),
          select: () => Promise.resolve(matched || null),
          then: (resolve) => resolve(matched || null)
        };
      }
      if (query?.username) {
        const matched = memoryUsers.find(u => u.username === query.username);
        return {
          select: () => Promise.resolve(matched || null),
          lean: () => Promise.resolve(matched || null),
          then: (resolve) => resolve(matched || null)
        };
      }
      return {
        select: () => Promise.resolve(null),
        lean: () => Promise.resolve(null),
        then: (resolve) => resolve(null)
      };
    };

    User.updateMany = (query, update) => {
      if (query?._id?.$in) {
        const idStrs = query._id.$in.map(i => i.toString());
        memoryUsers.forEach(u => {
          if (idStrs.includes(u._id.toString()) && update.$set) {
            Object.assign(u, update.$set);
          }
        });
      }
      return Promise.resolve({ acknowledged: true, modifiedCount: query?._id?.$in?.length || 0 });
    };

    User.create = (doc) => {
      const newUser = {
        _id: new mongoose.Types.ObjectId(),
        score: 150,
        status: 'active',
        isBanned: false,
        emailDelivery: { status: 'not_sent', sentAt: null, error: '', messageId: '' },
        comparePassword: async function(cand) {
          return bcrypt.compare(cand, this.password);
        },
        save: async function() { return this; },
        ...doc
      };
      memoryUsers.push(newUser);
      return Promise.resolve(newUser);
    };

    Event.findOne = (query) => {
      const match = memoryEvents.find(e => e.gamePin === query.gamePin && e.isActive);
      return {
        select: () => ({
          lean: () => Promise.resolve(match || null)
        }),
        then: (resolve) => resolve(match || null)
      };
    };

    Event.findById = (id) => {
      const match = memoryEvents.find(e => e._id.toString() === id?.toString());
      return Promise.resolve(match || null);
    };

    // Mock GmailCredential queries
    GmailCredential.findOne = (query) => {
      const match = memoryCredentials.find(c => !query.adminId || c.adminId?.toString() === query.adminId?.toString());
      return {
        lean: () => Promise.resolve(match ? { ...match } : null),
        then: (resolve) => resolve(match ? { ...match } : null)
      };
    };

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('1. Unauthorized or player requests to participant endpoints are rejected with 401/403', async () => {
    const resNoToken = await fetch(`${baseUrl}/api/admin/participants/email-config`);
    assert.strictEqual(resNoToken.status, 401);

    const resPlayer = await fetch(`${baseUrl}/api/admin/participants/email-config`, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    assert.strictEqual(resPlayer.status, 403);
  });

  test('2. Admin checks Gmail provider status: shows disconnected initially, then connected once credential exists', async () => {
    // When no credential exists
    const resDisconnected = await fetch(`${baseUrl}/api/admin/participants/email-config`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resDisconnected.status, 200);
    const dataDisc = await resDisconnected.json();
    assert.strictEqual(dataDisc.configured, false);
    assert.strictEqual(dataDisc.provider, 'gmail');

    // Add encrypted credential in memory
    const encryptedToken = encrypt('mock-refresh-token-xyz');
    memoryCredentials.push({
      _id: new mongoose.Types.ObjectId(),
      adminId: adminUserId,
      email: 'cybercell@pict.edu',
      encryptedToken
    });

    // When credential exists
    const resConnected = await fetch(`${baseUrl}/api/admin/participants/email-config`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resConnected.status, 200);
    const dataConn = await resConnected.json();
    assert.strictEqual(dataConn.configured, true);
    assert.strictEqual(dataConn.fromEmail, 'cybercell@pict.edu');
    assert.strictEqual(dataConn.provider, 'gmail');
    assert.strictEqual(dataConn.encryptedToken, undefined, 'Tokens must NEVER be exposed');
  });

  test('3. CSV preview validates missing fields, duplicate IDs, malformed emails, and existing DB accounts', async () => {
    memoryUsers.push({
      _id: new mongoose.Types.ObjectId(),
      username: 'EXISTING_ID_01',
      email: 'existing@college.edu',
      role: 'player',
      status: 'active'
    });

    const testRows = [
      { studentId: 'STU1001', fullName: 'Alice Smith', email: 'alice@college.edu' },     // Valid
      { studentId: '', fullName: 'No ID', email: 'noid@college.edu' },                     // Missing ID
      { studentId: 'STU1002', fullName: 'Bad Email', email: 'not-an-email' },              // Malformed email
      { studentId: 'STU1003', fullName: 'Duplicate One', email: 'dup@college.edu' },       // Valid
      { studentId: 'STU1003', fullName: 'Duplicate Two', email: 'dup2@college.edu' },      // Dup ID in CSV
      { studentId: 'EXISTING_ID_01', fullName: 'Old Student', email: 'new@college.edu' },  // Exists in DB
    ];

    const res = await fetch(`${baseUrl}/api/admin/participants/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rows: testRows })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.summary.totalRows, 6);
    assert.strictEqual(data.summary.validCount, 2);
    assert.strictEqual(data.summary.duplicateInCsvCount, 1);
    assert.strictEqual(data.summary.existingAccountCount, 1);
    assert.strictEqual(data.rows[0].isValid, true);
    assert.strictEqual(data.rows[1].isValid, false);
    assert.strictEqual(data.rows[2].isValid, false);
    assert.strictEqual(data.rows[4].isValid, false);
  });

  test('4. Secure account creation creates accounts with hashed passwords and returns ephemeral batchId', async () => {
    const participantsToCreate = [
      { studentId: 'STU2001', fullName: 'Bob Builder', email: 'bob@college.edu' },
      { studentId: 'STU2002', fullName: 'Charlie Root', email: 'charlie@college.edu' }
    ];

    const res = await fetch(`${baseUrl}/api/admin/participants/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ participants: participantsToCreate, eventId: memoryEvents[0]._id.toString() })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.summary.createdCount, 2);
    assert.ok(data.batchId, 'Should return batchId for credential dispatch');
    assert.strictEqual(data.createdUsers[0].username, 'STU2001');

    const createdUser = memoryUsers.find(u => u.username === 'STU2001');
    assert.ok(createdUser);
    assert.ok(createdUser.password.startsWith('$2a$') || createdUser.password.startsWith('$2b$'));
  });

  test('5. Repeated import of already created participant does not overwrite or re-hash password', async () => {
    const originalUser = memoryUsers.find(u => u.username === 'STU2001');
    const originalHash = originalUser.password;

    const res = await fetch(`${baseUrl}/api/admin/participants/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participants: [{ studentId: 'STU2001', fullName: 'Bob Builder', email: 'bob@college.edu' }]
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.summary.createdCount, 0);
    assert.strictEqual(data.summary.skippedCount, 1);
    assert.strictEqual(originalUser.password, originalHash, 'Password hash must NOT be modified');
  });

  test('6. Registered participant can authenticate and join event with student ID and password', async () => {
    const plainPass = 'SecretPass123!';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(plainPass, salt);

    const testParticipant = {
      _id: new mongoose.Types.ObjectId(),
      username: 'STU3001',
      fullName: 'David Test',
      email: 'david@college.edu',
      password: hash,
      role: 'player',
      eventId: memoryEvents[0]._id,
      score: 150,
      status: 'active',
      isBanned: false,
      comparePassword: async function(cand) {
        return bcrypt.compare(cand, this.password);
      },
      save: async function() { return this; }
    };
    memoryUsers.push(testParticipant);

    const resBad = await fetch(`${baseUrl}/api/auth/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'STU3001',
        gamePin: 'GAME99',
        passcode: 'WrongPassword!'
      })
    });
    assert.strictEqual(resBad.status, 401);

    const resGood = await fetch(`${baseUrl}/api/auth/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'STU3001',
        gamePin: 'GAME99',
        passcode: plainPass
      })
    });
    assert.strictEqual(resGood.status, 200);
    const goodData = await resGood.json();
    assert.ok(goodData.token, 'Should return JWT token');
    assert.strictEqual(goodData.user.username, 'STU3001');
    assert.strictEqual(goodData.event.name, 'FlagHunters 2026');
  });

  test('7. Participant export returns CSV with headers and records', async () => {
    const res = await fetch(`${baseUrl}/api/admin/participants/export`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    const text = await res.text();
    assert.ok(text.includes('Student ID (Username),Full Name,Email'));
  });

  test('8. Admin test-email endpoint sends email via Gmail API and returns message ID', async () => {
    const prevCount = sentGmailMessages.length;
    const res = await fetch(`${baseUrl}/api/admin/participants/test-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: 'testrecipient@pict.edu' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.result?.gmailMessageId);
    assert.strictEqual(sentGmailMessages.length, prevCount + 1);
  });

  test('9. Bulk credential dispatch uses Gmail API and marks recipients as sent', async () => {
    // Create new batch
    const createRes = await fetch(`${baseUrl}/api/admin/participants/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        participants: [
          { studentId: 'BATCH_USER_01', fullName: 'Batch User 1', email: 'batch1@pict.edu' }
        ],
        eventId: memoryEvents[0]._id.toString()
      })
    });
    const createData = await createRes.json();
    const batchId = createData.batchId;
    assert.ok(batchId);

    const prevCount = sentGmailMessages.length;
    const dispatchRes = await fetch(`${baseUrl}/api/admin/participants/send-credentials`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batchId,
        loginUrl: 'https://cyber-ctf-seven.vercel.app'
      })
    });
    assert.strictEqual(dispatchRes.status, 200);
    const dispatchData = await dispatchRes.json();
    assert.strictEqual(dispatchData.results.sent, 1);
    assert.strictEqual(dispatchData.results.failed, 0);
    assert.strictEqual(sentGmailMessages.length, prevCount + 1);

    const updatedUser = memoryUsers.find(u => u.username === 'BATCH_USER_01');
    assert.strictEqual(updatedUser.emailDelivery.status, 'sent');
    assert.ok(updatedUser.emailDelivery.messageId);
  });

  test('10. Retry credential delivery regenerates temporary password and dispatches via Gmail API', async () => {
    const failedUser = {
      _id: new mongoose.Types.ObjectId(),
      username: 'RETRY_USER_01',
      fullName: 'Retry Player',
      email: 'retry@pict.edu',
      password: 'oldhash',
      role: 'player',
      eventId: memoryEvents[0]._id,
      score: 150,
      status: 'active',
      isBanned: false,
      emailDelivery: { status: 'failed', sentAt: null, error: 'Previous failure', messageId: '' },
      save: async function() { return this; }
    };
    memoryUsers.push(failedUser);

    const prevCount = sentGmailMessages.length;
    const res = await fetch(`${baseUrl}/api/admin/participants/retry-credentials`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userIds: [failedUser._id.toString()],
        loginUrl: 'https://cyber-ctf-seven.vercel.app',
        eventName: 'FlagHunters 2026'
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.results.sent, 1);
    assert.strictEqual(sentGmailMessages.length, prevCount + 1);

    assert.strictEqual(failedUser.emailDelivery.status, 'sent');
    assert.notStrictEqual(failedUser.password, 'oldhash');
  });

  test('11. OAuth connect route returns Google auth URL with gmail.send scope', async () => {
    const res = await fetch(`${baseUrl}/api/email/oauth/connect?format=json`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.url.includes('accounts.google.com'));
    assert.ok(data.url.includes('gmail.send'));
  });
});
