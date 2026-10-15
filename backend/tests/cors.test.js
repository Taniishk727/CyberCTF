import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';

// Set environment variables before loading app
process.env.VERCEL = '1'; // Prevents server auto-listening in server.js
process.env.NODE_ENV = 'production';
// Stale frontend settings must not silently re-enable the retired CORS origin.
process.env.FRONTEND_URL = 'https://cyber-ctf-seven.vercel.app';
process.env.CORS_ORIGIN = 'https://cyber-ctf-seven.vercel.app';
process.env.JWT_SECRET = 'test-secret-key-12345678901234567890';

// Mock mongoose connection so tests can exercise routes without an external MongoDB server
const fakeCollection = {
  indexes: () => Promise.resolve([]),
  createIndex: () => Promise.resolve(),
  find: () => ({
    select: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }),
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

describe('CORS and Preflight Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
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

  test('1. OPTIONS preflight reaches a protected admin route before auth and returns CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });

    assert.ok(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
    
    const allowMethods = res.headers.get('access-control-allow-methods') || '';
    assert.ok(allowMethods.includes('GET'), 'GET should be permitted');
    assert.ok(allowMethods.includes('POST'), 'POST should be permitted');
    assert.ok(allowMethods.includes('OPTIONS'), 'OPTIONS should be permitted');

    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(allowHeaders.includes('content-type'), 'content-type should be in allowed headers');
    assert.ok(allowHeaders.includes('authorization'), 'authorization should be in allowed headers');
  });

  test('2. OPTIONS preflight with trailing slash in origin header is handled cleanly', async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app/',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    assert.ok(res.status === 200 || res.status === 204, `Expected 200/204, got ${res.status}`);
    assert.ok(
      res.headers.get('access-control-allow-origin') === 'https://flaghunters-two.vercel.app' ||
      res.headers.get('access-control-allow-origin') === 'https://flaghunters-two.vercel.app/'
    );
  });

  test('3. Retired production origin is rejected even when legacy env values still contain it', async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://cyber-ctf-seven.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
  });

  test('4. Local development origins remain supported', async () => {
    for (const origin of ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173']) {
      const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
        method: 'OPTIONS',
        headers: {
          'Origin': origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      assert.ok(res.status === 200 || res.status === 204, `Origin ${origin} expected 200/204`);
      assert.strictEqual(res.headers.get('access-control-allow-origin'), origin);
    }
  });

  test('5. Disallowed origin is rejected with 403', async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-attacker.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
    const body = await res.json();
    assert.strictEqual(body.message, 'Origin not allowed by CORS policy');
  });

  test('6. POST request reaches admin login route after preflight and validates inputs', async () => {
    const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: '', password: '' })
    });

    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
    assert.strictEqual(res.status, 400); // Fails username/password required validation
    const data = await res.json();
    assert.strictEqual(data.message, 'Username and password are required');
  });

  test('7. POST request with invalid admin credentials returns 401 Unauthorized', async () => {
    // Stub User.findOne to simulate non-existent admin user
    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: () => Promise.resolve(null)
    });

    try {
      const res = await fetch(`${baseUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Origin': 'https://flaghunters-two.vercel.app',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'fakeadmin', password: 'badpassword' })
      });

      assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.message, 'Invalid credentials');
    } finally {
      User.findOne = originalFindOne;
    }
  });

  test('8. Protected admin endpoints remain protected without token (401)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'GET',
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app'
      }
    });

    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.message, 'No token provided');
  });

  test('9. Health endpoint continues to work without Origin header and with Origin header', async () => {
    const resNoOrigin = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(resNoOrigin.status, 200);
    const dataNoOrigin = await resNoOrigin.json();
    assert.strictEqual(dataNoOrigin.status, 'ok');

    const resWithOrigin = await fetch(`${baseUrl}/api/health`, {
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app'
      }
    });
    assert.strictEqual(resWithOrigin.status, 200);
    assert.strictEqual(resWithOrigin.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
  });

  test('10. Player join endpoint maintains CORS and validates input payload', async () => {
    const res = await fetch(`${baseUrl}/api/auth/join`, {
      method: 'POST',
      headers: {
        'Origin': 'https://flaghunters-two.vercel.app',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: '', gamePin: '', passcode: '' })
    });

    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://flaghunters-two.vercel.app');
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.message, 'Username and Room PIN are required');
  });
});
