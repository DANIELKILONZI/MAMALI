/**
 * Integration tests for the owner/staff role-delegation system.
 *
 * Invariants:
 *  - The owner controls advertisements and staff; these are never delegatable.
 *  - A staff member can only do what the owner granted them.
 *  - Owner-only permissions are stripped from any grant.
 *  - Deactivating a staff member revokes access immediately (no waiting for
 *    the JWT to expire).
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { seedIntegrationData, cleanIntegrationData, IntegrationFixtures } from '../helpers/setup';
import { startTestServer, TestServer } from '../helpers/testServer';
import { prisma } from '../../lib/prisma';

const PREFIX = 'INT_PERM_';
const SECRET = process.env.JWT_SECRET ?? 'test-secret-change-me';

let server: TestServer;
let BASE: string;
let fixtures: IntegrationFixtures;

const createdUserIds: string[] = [];

async function makeStaff(perms: string[], role = 'STAFF', isActive = true): Promise<string> {
  const user = await prisma.user.create({
    data: {
      name: `${PREFIX}staff`,
      email: `${PREFIX}${Math.random().toString(36).slice(2)}@test.local`,
      password: await bcrypt.hash('x', 4),
      role,
      permissions: JSON.stringify(perms),
      isActive,
    },
  });
  createdUserIds.push(user.id);
  return jwt.sign({ id: user.id, role }, SECRET, { expiresIn: '1h' });
}

function authGet(path: string, token: string) {
  return fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

beforeAll(async () => {
  server = await startTestServer();
  BASE = server.baseUrl;
  fixtures = await seedIntegrationData(PREFIX);
}, 20000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await cleanIntegrationData(PREFIX);
  await server.close();
  await prisma.$disconnect();
}, 20000);

describe('advertisements are owner-only', () => {
  it('owner can list advertisements', async () => {
    const res = await authGet('/api/admin/advertisements', fixtures.adminToken);
    expect(res.status).toBe(200);
  });

  it('a staff member cannot access advertisements even with a broad grant', async () => {
    const token = await makeStaff(['coupons.manage', 'orders.manage', 'analytics.view']);
    const res = await authGet('/api/admin/advertisements', token);
    expect(res.status).toBe(403);
  });
});

describe('staff management is owner-only', () => {
  it('a staff member cannot list staff', async () => {
    const token = await makeStaff(['coupons.manage']);
    const res = await authGet('/api/admin/staff', token);
    expect(res.status).toBe(403);
  });
});

describe('delegated permissions gate access', () => {
  it('staff with coupons.manage can access coupons admin', async () => {
    const token = await makeStaff(['coupons.manage']);
    const res = await authGet('/api/admin/coupons', token);
    expect(res.status).toBe(200);
  });

  it('staff without coupons.manage is denied coupons admin', async () => {
    const token = await makeStaff(['orders.manage']);
    const res = await authGet('/api/admin/coupons', token);
    expect(res.status).toBe(403);
  });

  it('staff with analytics.view can read metrics; without it cannot', async () => {
    const withView = await makeStaff(['analytics.view']);
    const without = await makeStaff(['coupons.manage']);
    expect((await authGet('/api/admin/metrics', withView)).status).toBe(200);
    expect((await authGet('/api/admin/metrics', without)).status).toBe(403);
  });
});

describe('owner delegates via the staff API', () => {
  it('strips owner-only permissions from a grant', async () => {
    const res = await fetch(`${BASE}/api/admin/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixtures.adminToken}` },
      body: JSON.stringify({
        name: `${PREFIX}delegated`,
        email: `${PREFIX}deleg@test.local`,
        password: 'password123',
        role: 'STAFF',
        permissions: ['coupons.manage', 'advertisements.manage', 'staff.manage'],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { user: { id: string; permissions: string[] } };
    createdUserIds.push(body.user.id);
    expect(body.user.permissions).toContain('coupons.manage');
    expect(body.user.permissions).not.toContain('advertisements.manage');
    expect(body.user.permissions).not.toContain('staff.manage');
  });

  it('a plain staff member cannot create staff', async () => {
    const token = await makeStaff(['coupons.manage']);
    const res = await fetch(`${BASE}/api/admin/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'x', email: `${PREFIX}x@test.local`, password: 'password123' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('deactivation revokes access immediately', () => {
  it('a deactivated staff token is rejected on a previously-allowed route', async () => {
    const user = await prisma.user.create({
      data: {
        name: `${PREFIX}deact`,
        email: `${PREFIX}deact@test.local`,
        password: await bcrypt.hash('x', 4),
        role: 'STAFF',
        permissions: JSON.stringify(['coupons.manage']),
        isActive: true,
      },
    });
    createdUserIds.push(user.id);
    const token = jwt.sign({ id: user.id, role: 'STAFF' }, SECRET, { expiresIn: '1h' });

    expect((await authGet('/api/admin/coupons', token)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    // Same still-valid JWT, now denied because the guard checks live isActive
    expect((await authGet('/api/admin/coupons', token)).status).toBe(403);
  });
});
