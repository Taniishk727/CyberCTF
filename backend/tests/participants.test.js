import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Setup environment variables before imports
process.env.VERCEL = '1';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-secret-key-12345678901234567890';
process.env.FRONTEND_URL = 'https://cyber-ctf-seven.vercel.app';
process.env.RESEND_API_KEY = 're_test_dummy_key_12345';
process.env.EMAIL_FROM = 'FlagHunters CTF <test@ctf.local>';

// Mock mongoose connection so tests can exercise routes without an external MongoDB server
const memoryUsers = [];
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

const { default: app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Event } = await import('../models/Event.js');

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

describe('Bulk Participant Registration and Credential System Suite', () => {
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
        email: 'admin@ctf.local',
        isBanned: false,
        status: 'active'
      };
      return {
        select: () => Promise.resolve(userDoc),
        then: (resolve) => resolve(userDoc)
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
    // No token
    const resNoToken = await fetch(`${baseUrl}/api/admin/participants/email-config`);
    assert.strictEqual(resNoToken.status, 401);

    // Player token
    const resPlayer = await fetch(`${baseUrl}/api/admin/participants/email-config`, {
      headers: { Authorization: `Bearer ${playerToken}` }
    });
    assert.strictEqual(resPlayer.status, 403);
  });

  test('2. Admin can fetch email provider config securely without leaking secret key', async () => {
    const res = await fetch(`${baseUrl}/api/admin/participants/email-config`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.configured, true);
    assert.strictEqual(data.hasApiKey, true);
    assert.strictEqual(data.fromEmail, 'FlagHunters CTF <test@ctf.local>');
    assert.strictEqual(data.apiKey, undefined, 'API key must NEVER be exposed');
  });

  test('3. CSV preview validates missing fields, duplicate IDs, malformed emails, and existing DB accounts', async () => {
    // Seed an existing user first
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
    assert.strictEqual(data.summary.validCount, 2); // STU1001 and STU1003 (first instance)
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
      body: JSON.stringify({ participants: participantsToCreate })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.summary.createdCount, 2);
    assert.ok(data.batchId, 'Should return batchId for credential dispatch');
    assert.strictEqual(data.createdUsers[0].username, 'STU2001');

    // Verify stored user in memory has bcrypt hashed password, not plaintext
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
    // Create participant with known password
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

    // Attempt join with wrong password
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

    // Attempt join with correct password
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
    const text = await res.send ? await res.text() : await res.text();
    assert.ok(text.includes('Student ID (Username),Full Name,Email'));
  });
});
