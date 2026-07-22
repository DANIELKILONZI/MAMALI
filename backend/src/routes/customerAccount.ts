import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { customerAuthLimiter } from '../middleware/rateLimiter';
import { normalizePhone } from '../utils/phone';

/**
 * Optional customer accounts.
 *
 * Shopping and checkout NEVER require an account — orders are keyed by
 * phone number. An account only adds order history and checkout prefill
 * for returning customers.
 */

const router = Router();

interface CustomerToken {
  id: string;
  role: 'CUSTOMER';
}

function signToken(customerId: string): string {
  return jwt.sign({ id: customerId, role: 'CUSTOMER' } satisfies CustomerToken, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

function publicCustomer(c: { id: string; phone: string; name: string | null; createdAt: Date }) {
  return { id: c.id, phone: c.phone, name: c.name, createdAt: c.createdAt };
}

/** Requires a CUSTOMER-role bearer token; sets req.customerId. */
function customerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ success: false, message: 'No token provided' });
    return;
  }
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as CustomerToken;
    if (decoded.role !== 'CUSTOMER') {
      res.status(403).json({ success: false, message: 'Not a customer token' });
      return;
    }
    (req as Request & { customerId?: string }).customerId = decoded.id;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

const credentialsSchema = z.object({
  phone: z.string().min(9),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().min(1).max(100).optional(),
});

// POST /api/customer/register
router.post('/register', customerAuthLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const phone = normalizePhone(data.phone);
    if (!phone) {
      res.status(400).json({ success: false, message: 'Enter a valid Kenyan phone number' });
      return;
    }

    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this phone already exists. Please log in.' });
      return;
    }

    const customer = await prisma.customer.create({
      data: {
        phone,
        name: data.name ?? null,
        passwordHash: await bcrypt.hash(data.password, 10),
      },
    });

    res.status(201).json({ success: true, token: signToken(customer.id), customer: publicCustomer(customer) });
  } catch (err) {
    next(err);
  }
});

// POST /api/customer/login
router.post('/login', customerAuthLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = credentialsSchema.parse(req.body);
    const phone = normalizePhone(data.phone);
    const customer = phone ? await prisma.customer.findUnique({ where: { phone } }) : null;

    if (!customer || !(await bcrypt.compare(data.password, customer.passwordHash))) {
      res.status(401).json({ success: false, message: 'Invalid phone number or password' });
      return;
    }

    res.json({ success: true, token: signToken(customer.id), customer: publicCustomer(customer) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customer/me
router.get('/me', customerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }
    res.json({ success: true, customer: publicCustomer(customer) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customer/me/orders — orders placed with the account's phone,
// including guest orders placed before the account existed.
router.get('/me/orders', customerAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customerId = (req as Request & { customerId: string }).customerId;
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      res.status(404).json({ success: false, message: 'Account not found' });
      return;
    }

    const orders = await prisma.order.findMany({
      where: { customerPhone: customer.phone },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { name: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
});

export default router;
