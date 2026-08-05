# Deployment & Secret Management

This project is built to support both local development and containerized deployment via Docker Compose.

## 1. Environment Configuration

To protect sensitive data, no secret files are ever committed to version control. 

1. Copy the example environment file in the `server` directory:
   ```bash
   cp server/.env.example server/.env
   ```
2. Open `server/.env` and update the values as needed.

### 1.1 Safe Defaults
The `.env.example` provides safe defaults for all variables:
- **`DATABASE_URL`**: Safely hardcoded to a local postgres instance (`postgresql://postgres:postgres@localhost:5433/fault_localization?schema=public`).
- **`OPENAI_API_KEY`**: Left intentionally blank. The AI Summary integration is fully optional and the application will gracefully fall back to a deterministic rule-based generator if no key is provided.

**NEVER commit real API keys to the repository.**

---

## 2. Running Locally (No Docker)

If you prefer to run the Node servers directly on your host machine:

1. Start the PostgreSQL database via Docker Compose:
   ```bash
   docker compose up -d postgres
   ```
2. Initialize the database schema and dependencies from the root directory:
   ```bash
   npm run install:all
   cd server && npx prisma generate && npx prisma db push
   ```
3. Start both the client and server locally:
   ```bash
   npm run dev
   ```

---

## 3. Running via Docker Compose (Full Stack)

To spin up the entire stack using Docker Compose:

1. Ensure Docker is running.
2. Build and start the containers from the root directory:
   ```bash
   docker compose up --build -d
   ```
3. The server container is explicitly configured to run `npx prisma db push` before booting, meaning the database schema will be automatically initialized and ready to go.

### 3.1 Docker Networking & Environment Variables
When running the `server` via Docker Compose, it will automatically load all environment variables from `server/.env` using the `env_file` directive. This ensures the AI Summary service and Express share the same configuration. However, `docker-compose.yml` explicitly overrides the `DATABASE_URL` internally to connect to the `postgres` container over the Docker network, meaning you do not need to alter your `.env` file between run modes.
