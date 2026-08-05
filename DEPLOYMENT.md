# Deployment Guide

This document outlines how to deploy the PropelAI backend and frontend in local, Dockerized, and Cloud Production environments.

## Prerequisites
Ensure the following tools are installed on your host system:
- **Node.js**: v20 or higher.
- **npm**: v10 or higher.
- **Docker & Docker Compose**: Required if running the PostgreSQL instance locally via containers.
- **PostgreSQL**: v15 or higher (if running natively).

---

## Environment Variables

### Backend (`server/.env`)
Create a `.env` file in the `server/` root directory:
```env
# The database connection string (required)
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fault_localization?schema=public"

# The port the Express API binds to (default: 3000)
PORT=3000

# Optional: Required only if you want OpenAI-generated summaries. 
# Without this, the system uses deterministic template fallbacks.
OPENAI_API_KEY="sk-..."
```

### Frontend (`client/.env`)
Create a `.env` file in the `client/` root directory:
```env
# The URL pointing to the PropelAI Express Backend
VITE_API_URL=http://localhost:3000
```

---

## Running Locally (Development)

This is the recommended workflow for developing and debugging.

1. **Start the Database**
   ```bash
   docker compose up postgres -d
   ```
2. **Apply Prisma Migrations & Seed Data**
   ```bash
   cd server
   npm install
   npx prisma db push
   npx ts-node prisma/seedNetwork.ts
   ```
3. **Start the Backend**
   ```bash
   npm run dev
   ```
4. **Start the Frontend**
   ```bash
   cd ../client
   npm install
   npm run dev
   ```
   The backend will be available at `http://localhost:3000` and the frontend at `http://localhost:5173`.

---

## Running with Docker (Local Production Simulation)

You can spin up the entire stack using `docker-compose.yml`.

1. **Build and Start**
   ```bash
   docker compose up --build -d
   ```
2. **Database Migrations**
   The `server` container's `Dockerfile` is configured to run `npx prisma db push` automatically on startup. However, you will need to manually seed the database the first time:
   ```bash
   docker compose exec server npx tsx prisma/seedNetwork.ts
   ```

---

## Deploying Backend on Render (Production)

Render is ideal for hosting Node.js services.

1. **Connect Repository**: Link your GitHub repository in the Render dashboard and create a new **Web Service**.
2. **Root Directory**: Set to `server`.
3. **Environment**: Select `Node`.
4. **Build Command**: 
   ```bash
   npm install && npm run build
   ```
5. **Start Command**: 
   ```bash
   npm start
   ```
6. **Environment Variables**:
   Add `DATABASE_URL` (pointing to your managed PostgreSQL database) and `NODE_ENV=production`.
7. **Migrations**: 
   Render provides a "Pre-Deploy Command". Set it to:
   ```bash
   npx prisma db push
   ```

---

## Deploying Frontend on Vercel (Production)

Vercel is optimized for Vite/React applications.

1. **Connect Repository**: Link your GitHub repository to Vercel and create a new Project.
2. **Framework Preset**: Select `Vite`.
3. **Root Directory**: Set to `client`.
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. **Environment Variables**:
   Add `VITE_API_URL` pointing to your deployed Render backend URL (e.g., `https://propelai-backend.onrender.com`).

---

## Common Deployment Issues & Troubleshooting

### 1. `PrismaClientInitializationError` in Production
**Symptom**: The backend crashes on startup with Prisma connection errors.
**Fix**: Ensure you ran `npx prisma generate` during the build step. The `npm run build` script in `package.json` automatically includes this step. Also, verify your `DATABASE_URL` is accessible from the deployment environment (ensure IP whitelisting is correct if using AWS RDS or similar).

### 2. Missing Topology / Empty Map
**Symptom**: The frontend map loads Karnataka, but no poles or lines are visible.
**Fix**: You forgot to seed the database. Run the seeding script: `npx tsx prisma/seedNetwork.ts`.

### 3. Frontend CORS Errors
**Symptom**: The browser console shows CORS policy blocks when fetching `/api/metrics`.
**Fix**: The `cors()` middleware is configured in `server/src/index.ts`. Ensure that if you set specific allowed origins, you include your Vercel deployment URL. By default, it allows all origins for ease of deployment.

### 4. `ESM syntax is not allowed in a CommonJS module` Build Error
**Symptom**: `npm run build` fails complaining about imports.
**Fix**: This has been resolved by configuring `verbatimModuleSyntax: false` in `server/tsconfig.json`. Ensure you are using the latest `tsconfig.json` configuration provided in the repository.
