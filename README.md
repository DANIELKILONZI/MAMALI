# MAMALI — Full Digital Commerce Operating System

> Self-hosted retail platform + business control system + operations engine

## Overview

MAMALI is a complete digital commerce OS built on:

- **Backend** — Node.js + Express + TypeScript + Prisma (SQLite/PostgreSQL) + JWT auth
- **Frontend** — Next.js 16 + TypeScript + Tailwind CSS (customer storefront)
- **Admin** — Next.js 16 + TypeScript + Tailwind CSS (owner + staff dashboard)

---

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env          # fill in JWT_SECRET (required) and optional M-Pesa keys
npm install
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts    # creates default admin user
npm run dev                   # starts on http://localhost:5000
```

Default admin credentials: `admin@mamali.com` / `Admin@123`

### 2. Customer Storefront

```bash
cd frontend
npm install
npm run dev    # starts on http://localhost:3000
```

### 3. Admin Dashboard

```bash
cd admin
npm install
npm run dev    # starts on http://localhost:3001
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MAMALI SYSTEM                        │
├──────────────┬──────────────────────────────────────────────┤
│   frontend/  │  Customer Experience                         │
│   :3000      │  Browse → Cart → Checkout → M-Pesa → Track  │
├──────────────┼──────────────────────────────────────────────┤
│   admin/     │  Owner + Staff Operations                    │
│   :3001      │  Products / Orders / Staff / Analytics       │
├──────────────┼──────────────────────────────────────────────┤
│   backend/   │  REST API + Business Logic Engine            │
│   :5000      │  Auth / Orders / Payments / Inventory        │
└──────────────┴──────────────────────────────────────────────┘
```

## Core Features

### 🛍️ Customer Experience
- Browse categories & subcategories with search + price filters
- Product pages with images, rich descriptions, stock status
- Shopping cart with live totals (persisted in localStorage)
- Checkout with Kenyan phone validation → M-Pesa STK push
- Order tracking with live status progress

### 🏢 Business Control (Owner)
- Product CRUD with images, rich descriptions, discount pricing
- Category & subcategory management
- Advertisement system (banners, featured, promotions) with scheduling
- Dynamic homepage CMS (hero, sections)
- Content pages (About, Contact, FAQ, Policies)
- Business dashboard: revenue, orders, top products, low-stock alerts

### 👥 Operations (Staff)
- Order management with status filtering
- Order assignment (admin assigns to staff)
- Status lifecycle enforcement: `pending → awaiting_payment → paid → processing → delivered`
- Full activity log per order

### ⚙️ Core Engine
- M-Pesa Daraja API: STK push, callback, verification, failure handling
- Transactional inventory: no negative stock, stock reduced only after payment
- Idempotency: duplicate order/payment prevention
- Order expiry and payment timeout
- Zod validation on all inputs

### 🔐 Infrastructure
- JWT authentication with ADMIN / STAFF roles
- bcrypt password hashing (10 rounds)
- Rate limiting (auth: 5/15 min, general: 100/15 min)
- Helmet security headers
- SQLite (dev) / PostgreSQL (prod) via Prisma
- Structured activity logging

## API Reference

Base URL: `http://localhost:5000`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | — | Login |
| GET | /api/products | — | List products |
| GET | /api/categories | — | List categories |
| POST | /api/orders | — | Create order |
| POST | /api/payments/initiate | — | M-Pesa STK push |
| POST | /api/payments/callback | — | M-Pesa callback |
| GET | /api/admin/dashboard | ADMIN | Business dashboard |
| GET | /api/orders | STAFF+ | List orders |
| PUT | /api/orders/:id/status | STAFF+ | Update order status |
| POST | /api/products | ADMIN | Create product |

## Environment Variables

See `backend/.env.example` for full list. Key variables:

```
JWT_SECRET=          # required, keep secret
DATABASE_URL=        # default: file:./dev.db
MPESA_CONSUMER_KEY=  # Safaricom Daraja API
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=
```

## Production Deployment

1. Change `DATABASE_URL` to a PostgreSQL URL and update `prisma/schema.prisma` provider to `postgresql`
2. Set strong `JWT_SECRET` in environment
3. Set real M-Pesa Daraja production credentials
4. Build all three apps: `npm run build`
5. Serve backend with PM2 or Docker; frontend/admin with Vercel or similar
