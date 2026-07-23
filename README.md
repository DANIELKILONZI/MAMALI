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
- Global product search and category navigation in the header
- Product pages with images, rich descriptions, stock status, and per-product SEO/OG metadata
- Shopping cart with live totals (persisted in localStorage)
- Checkout with Kenyan phone validation, delivery location/notes → M-Pesa STK push
- Order tracking with live status progress + order lookup by order number
- CMS-driven content pages (About, Contact, FAQ, Privacy, Terms)
- Store branding (name, logo) driven by admin Store Settings

### 🏢 Business Control (Owner)
- Product CRUD with images, rich descriptions, discount pricing
- Category & subcategory management
- Advertisement system (banners, featured, promotions) with scheduling
- Dynamic homepage CMS (hero, sections) — section order, visibility, and titles rendered on the storefront
- Content pages (About, Contact, FAQ, Policies) — published at `/{slug}` on the storefront
- Business dashboard: revenue, orders, top products, low-stock alerts

### 👥 Operations (Staff)
- Order management with status filtering
- Order assignment (admin assigns to staff)
- Status lifecycle enforcement: `pending → awaiting_payment → paid → processing → delivered`
- Full activity log per order

### ⚙️ Core Engine
- M-Pesa Daraja API: STK push, callback, verification, failure handling
- Transactional inventory: stock reserved at order creation, released on cancellation/expiry
- Idempotency: duplicate order/payment prevention
- Order expiry and payment timeout
- Zod validation on all inputs

### 🔑 Roles & Delegation
- **Owner** — full control of the business; the only role that can manage
  advertisements, staff, and store settings, and the only one who can
  delegate roles. Cannot be demoted or deactivated.
- **Staff** — employees whose access is exactly the permissions the owner
  grants them (products, categories, orders, inventory, coupons, content,
  customers, analytics, notifications). Advertisements, staff management,
  and settings are never delegatable.
- Permission and role changes take effect immediately (checked live per
  request); deactivating an employee revokes access at once.

### 🔐 Infrastructure
- JWT authentication with OWNER / STAFF roles + granular permissions
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

Guided deployment: `./deploy/deploy.sh` (installs deps, validates env, builds, migrates, starts PM2).

1. Set strong `JWT_SECRET` and `REFRESH_TOKEN_SECRET` in `backend/.env`
2. Set real M-Pesa Daraja production credentials
3. Run `./deploy/deploy.sh`
4. Install the Nginx config and SSL (`deploy/nginx.conf`, `deploy/setup-https.sh`)

### Backups

`./deploy/backup.sh [dir]` backs up SQLite (safe `.backup`, gzipped) or PostgreSQL (`pg_dump`), with 14-day retention. Add to cron:

```
0 3 * * * /path/to/MAMALI/deploy/backup.sh /var/backups/mamali
```

### Scaling: migrate SQLite → PostgreSQL

SQLite allows a single writer, so the backend runs as **one PM2 instance**. To scale past that:

1. Provision PostgreSQL and set `DATABASE_URL=postgresql://user:pass@host:5432/mamali` in `backend/.env`
2. Change `provider = "sqlite"` to `provider = "postgresql"` in `backend/prisma/schema.prisma`
3. Regenerate migrations against PostgreSQL: `npx prisma migrate dev --name init_postgres` (fresh DB) — Prisma migrations are dialect-specific and cannot be reused across providers
4. Export/import data if migrating a live store (e.g. `npx prisma db seed` for a fresh start, or a one-off script reading the SQLite file)
5. Raise `instances` for `mamali-backend` in `deploy/ecosystem.config.js` (e.g. `'max'` with `exec_mode: 'cluster'`)
