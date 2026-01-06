# Trival Monitor - Implementation Plan

## Overview

Create a simplified monitoring solution where each monitored URL gets its own
isolated Cloudflare Worker, addressing the limitations of uptimeflare's
centralized architecture.

## Problems with Uptimeflare

1. **Terraform hardcoded names**: Worker and D1 database names are hardcoded
   (`uptimeflare_worker`, `uptimeflare_d1`), limiting to one instance per
   Cloudflare account
2. **Shared notification channel**: All monitors share a single notification
   configuration, can't have different email destinations per monitor
3. **Over-engineered**: Status page, KV/D1 storage, complex state management -
   too much for simple ping monitoring

## Requirements

- One Cloudflare Worker per monitored URL
- HTTP GET/POST ping monitoring only
- SMTP email notifications (configurable per worker)
- Statistics endpoint (protected by bearer token) returning JSON
- Environment variables for configuration:
  - `SERVICE_NAME`: Human-readable service name
  - `TARGET_URL`: URL to monitor
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: SMTP credentials
  - `NOTIFICATION_EMAIL`: Destination email for alerts
  - `API_BEARER_TOKEN`: Token to protect statistics endpoint
  - `CHECK_INTERVAL`: Cron schedule (default: every 1 minute)
  - `PING_TIMEOUT`: Configurable timeout for each health check
  - `GRACE_PERIOD_FAILURES`: Number of consecutive failures before alerting

## Key Decisions

### 1. Use D1 Instead of Durable Objects

**Rationale**: User wants SQL analysis capability

- Store health check history in D1 database
- Each worker has its own D1 database instance
- Enables direct SQL queries via wrangler CLI or dashboard
- More suitable for analytics and historical analysis

### 2. Use Alchemy (No Terraform)

**Decision**: Alchemy only for deployment

- **Alchemy**: TypeScript-native IaC (Infrastructure as Code)
- Resources are async functions - simple and type-safe
- Local state files (no remote backend complexity)
- Native D1 and Worker support
- Skip Terraform entirely - simpler toolchain

### 3. Use Drizzle ORM for D1

**Decision**: Drizzle ORM instead of raw SQL

- Type-safe schema definitions
- Native D1 support
- Built-in migrations
- User has experience with it
- Easy to extend schema later

### 4. Use Bun Instead of Node/npm

**Decision**: Bun for package management and runtime

- Faster than npm/node
- Native TypeScript support
- Built-in bundler
- Single tool for install/build/run

### 5. Implement Grace Period

**From Uptimeflare pattern**: Don't alert on first failure

- Store ALL health checks (successes and failures)
- Track consecutive failures
- Send notification only after N consecutive failures (configurable, default: 3)
- Example: ping fails at 10:00, 10:01, 10:02 → alert at 10:02
- On recovery: Send UP notification immediately

### 6. Add Service Name Configuration

**Why**: Generate meaningful notifications

- ENV var: `SERVICE_NAME` (e.g., "Trival.xyz Website")
- Used in email subjects and messages
- Different from worker name (e.g., "monitor-trival-xyz")

### 7. No Dashboard/UI Complexity

**Note**: Uptimeflare includes a complex Next.js dashboard coupled to the
backend

- We don't need any of that for this minimal proof of concept
- Just worker + D1 + API endpoint
- Separate aggregator/dashboard project will come later

## Tech Stack Summary

- **Runtime**: Cloudflare Workers
- **Database**: D1 with Drizzle ORM
- **SMTP**: worker-mailer library
- **Deployment**: Alchemy (TypeScript IaC)
- **Package Manager**: Bun
- **Language**: TypeScript

## Project Structure

```
trival-monitor/
├── src/                       # Worker code
│   ├── index.ts              # Entry point (scheduled + fetch handlers)
│   ├── monitor.ts            # HTTP ping logic (from uptimeflare)
│   ├── notifier.ts           # SMTP via worker-mailer
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema definitions
│   │   └── queries.ts        # Database query functions
│   └── types.ts              # TypeScript interfaces
├── deployments/               # One folder per monitor instance
│   └── trival-xyz/
│       ├── deploy.ts         # Alchemy deployment script
│       ├── .env              # Environment variables (gitignored)
│       └── .env.example      # Environment variables template
├── scripts/
│   └── new-monitor.sh        # Helper to scaffold new monitor
├── package.json               # Dependencies (Alchemy, Drizzle, etc.)
├── tsconfig.json             # TypeScript configuration
├── drizzle.config.ts         # Drizzle configuration
├── bunfig.toml               # Bun configuration
├── .gitignore
├── implementation-plan.md     # This file
└── README.md
```

## Implementation Stages

### Stage 1: Project Skeleton & Toolchain Validation ✅ COMPLETE

**Goal**: Verify Alchemy, Drizzle, and Bun work together before building features

**Status**: ✅ All tests passing - Stage 1 complete!

#### 1.1 Initialize Project Structure

- [x] Create root directory
- [x] Write implementation-plan.md
- [x] Create package.json with all dependencies (pinned versions)
- [x] ~~Create bunfig.toml~~ (determined unnecessary)
- [x] Create .gitignore (with Alchemy and Drizzle entries)
- [x] Create tsconfig.json (configured for Cloudflare Workers)
- [x] Create README.md with comprehensive documentation

#### 1.2 Minimal Worker (Hello World)

- [x] Create `src/index.ts` with fetch handler
- [x] Add `/insert` endpoint for D1 write operations
- [x] Add `/messages` endpoint for D1 read operations
- [x] Add 404 handling for unknown routes
- [x] Add automatic schema initialization on first request

#### 1.3 Minimal D1 + Drizzle Setup

- [x] Create `src/db/schema.ts` with test table
- [x] Create `src/db/queries.ts` with CRUD functions:
  - `createDb()` - Initialize Drizzle client
  - `initSchema()` - Auto-create table if not exists
  - `insertTestMessage()` - Insert test data
  - `getRecentMessages()` - Query recent messages
- [x] Create `drizzle.config.ts` at root
- [x] Generate initial migration with `bun run db:generate`

#### 1.4 Minimal Alchemy Deployment

- [x] Create `deployments/test/deploy.ts` with:
  - D1 database creation
  - Worker creation with D1 binding
  - `local: true` for dev mode
  - Absolute path resolution for entrypoint
- [x] Create `deployments/test/.env.example`
- [x] Test local deployment successfully

#### 1.5 Integration Test

- [x] Create `deployments/test/deploy.test.ts` with Bun test
- [x] Test root endpoint response
- [x] Test D1 insert operations
- [x] Test D1 query operations
- [x] Test 404 handling for unknown routes
- [x] Run tests: `bun run test:deploy`
- [x] Verify all tests pass ✅

**Test Results**:
```
✓ root endpoint responds with hello message
✓ can insert a message to D1
✓ can retrieve messages from D1
✓ returns 404 for unknown routes

4 pass, 0 fail, 15 expect() calls
```

**Success Criteria**: ✅ ALL MET

- ✅ Worker deploys locally with Alchemy (`local: true`)
- ✅ D1 database is created and accessible
- ✅ Drizzle can read/write to D1
- ✅ All tests pass (4/4 passing)
- ✅ Automatic schema initialization works
- ✅ Integration test framework established

**Key Learnings**:
- Alchemy requires Cloudflare credentials even in local mode
- Alchemy dev mode uses port 1337 (not 8787, but can vary to 1338+)
- `import.meta.dir` required for reliable path resolution in Alchemy
- Bun test integration works seamlessly with Alchemy deployments
- `nodejs_compat` compatibility flag added (required for worker_mailer in Stage 3)
- Worker code kept clean without hardcoded SQL
- **Alchemy has built-in Drizzle migration support via `migrationsDir` option**
- **Alchemy is embeddable - deployments can be directly imported in tests**
- **Export resources (`worker`, `db`) from deployment for test access**
- **Use `worker.url` for dynamic URL access (no hardcoded ports)**

**Migration Solution (SOLVED ✅)**:
- Alchemy's D1Database accepts a `migrationsDir` parameter
- Automatically applies all SQL migrations from the specified directory
- Migrations are tracked in Cloudflare's `d1_migrations` table
- Works seamlessly in both local mode and production
- No manual migration steps needed - migrations apply during deployment
- Integration tests can directly import and run deployments
- References: https://alchemy.run/providers/cloudflare/d1-database/

**Test Architecture (FINALIZED ✅)**:
- Tests directly `import("./deploy")` instead of spawning processes
- Deployment exports `worker` and `db` resources for test access
- Tests use `deployment.worker.url` to get actual local/production URL
- No hardcoded ports - works with whatever port Alchemy assigns
- Clean separation: deployment script is reusable, tests are independent
- Type-safe: TypeScript enforces proper resource access

---

### Stage 2: Core Monitoring Logic 🔍

**Goal**: Implement HTTP ping monitoring with grace period logic (console.log notifications only), bearer-token-protected API endpoints, and comprehensive integration tests.

**Key Decisions**:
- Tests moved to `test/` directory (deployments/ reserved for production)
- All endpoints require bearer token (including root)
- Default success codes: 2xx range (200-299)
- Flattened API routes: `/`, `/stats`, `/trigger-check`
- Configurable check interval via CHECK_INTERVAL_SECONDS
- Mock target in reusable `test/fixtures/` directory

#### 2.1 Types & Config (Foundation)

- [ ] Create `src/types.ts` with interfaces:
  - `Env` - Raw environment variables
  - `MonitorConfig` - Parsed config (serviceName, targetUrl, httpMethod, pingTimeout, gracePeriodFailures, expectedCodes, checkIntervalSeconds)
  - `AppConfig` - Full app config (monitor + apiBearerToken)
  - `HealthCheckResult` - Check result with consecutiveFailures
  - `Stats` - Statistics for any time range (not just 24h)
  - `Incident` - Incident tracking

- [ ] Create `src/config.ts` with `parseConfig()`:
  - Validate TARGET_URL and API_BEARER_TOKEN (both REQUIRED)
  - Parse numeric values (PING_TIMEOUT, GRACE_PERIOD_FAILURES, CHECK_INTERVAL_SECONDS)
  - Set defaults: serviceName="Service", httpMethod="GET", pingTimeout=10000, gracePeriodFailures=3, expectedCodes=[200-299], checkIntervalSeconds=60
  - Implement range parser for expectedCodes: "200-299" → [200,201,...,299]
  - Validate ranges: timeout 1-60000ms, grace period 1-10, interval 1-3600s

#### 2.2 Database Schema

- [ ] Update `src/db/schema.ts`:
  - Replace `testTable` with `healthChecks` table
  - Fields: id, timestamp, up, ping, err, statusCode, consecutiveFailures
  - Keep consecutiveFailures field (makes queries simpler - read most recent record vs scanning)
  - Add indexes: `timestamp_idx`, `up_timestamp_idx`

- [ ] Generate migration: `bun run db:generate`

#### 2.3 Monitor Logic

- [ ] Create `src/monitor.ts` with `checkTarget()`:
  - Use AbortController for timeout (uptimeflare pattern)
  - Track response time from start to finish
  - Validate status code against expectedCodes array (supports 2xx range)
  - Handle timeout, network, and HTTP errors
  - Return structured CheckResult: `{ up, ping, err, statusCode }`

#### 2.4 Database Queries

- [ ] Update `src/db/queries.ts`:
  - Replace test functions with monitoring queries
  - `saveHealthCheck()` - Save check result to D1
  - `getRecentChecks()` - Query recent checks (debugging)
  - `getConsecutiveFailures()` - Count consecutive failures from most recent
  - `getStats(startTime?, endTime?)` - Generalized stats with time range (defaults: now-24h to now)
  - `calculateIncidents()` helper - Extract incident periods from checks

#### 2.5 Mock Target Worker (Test Fixture)

- [ ] Create `test/fixtures/mock-target.ts`:
  - Controllable worker with query params: status, delay, message
  - Defaults: status=200, delay=0, message="OK"
  - Reusable across test suites
  - Test independently before integration

#### 2.6 Worker Implementation

- [ ] Update `src/index.ts`:
  - Remove old test endpoints (`/insert`, `/messages`)
  - Add `scheduled()` handler:
    - Parse config, create DB instance
    - Call checkTarget()
    - Get consecutiveFailures from DB
    - Calculate new consecutiveFailures (reset on success, increment on failure)
    - Save result with saveHealthCheck()
    - Grace period logging: console.log on threshold and recovery
  - Update `fetch()` handler with ALL PROTECTED endpoints:
    - `GET /` - Service info (name, target, status) - PROTECTED
    - `GET /stats` - 24h stats, optional ?start=X&end=Y - PROTECTED
    - `POST /trigger-check` - Manual health check - PROTECTED
    - 404 handler
  - Bearer token auth on every endpoint (extract from Authorization header)

#### 2.7 Test Infrastructure

- [ ] Create `test/deploy.ts` (NEW LOCATION):
  - Deploy mock target worker (from test/fixtures/mock-target.ts)
  - Deploy monitor worker with bindings:
    - TARGET_URL: mockTarget.url
    - CHECK_INTERVAL_SECONDS: "1" (fast testing)
    - API_BEARER_TOKEN: "test-token-12345"
  - Dynamic cron schedule: `*/${CHECK_INTERVAL_SECONDS} * * * * *`
  - Export both workers for test access

- [ ] Update package.json: `test` script should run from test/ directory

#### 2.8 Integration Tests

- [ ] Create `test/integration.test.ts`:
  - Test mock target controls (status, delay)
  - Test bearer auth on all endpoints (/, /stats, /trigger-check)
  - Test root endpoint returns service info
  - Test manual trigger endpoint
  - Test 2xx status code acceptance (200, 201, 299 → up; 300 → down)
  - Test grace period consecutive failures (3 checks → console log)
  - Test grace period reset on success (console log recovery)
  - Test /stats API with valid data structure
  - Test /stats with custom time range (?start=X&end=Y)
  - Test scheduled checks run automatically (wait 2-3s, verify multiple checks)

#### 2.9 Documentation

- [ ] Update README.md:
  - Document flattened API endpoints (/, /stats, /trigger-check)
  - Add curl examples with bearer token
  - Document new environment variables
  - Update test commands (now in test/ directory)

- [ ] Update implementation-plan.md:
  - Mark Stage 2 complete
  - Document key decisions made

#### 2.10 Cleanup

- [ ] Delete `deployments/test/` directory (old test location)
- [ ] Keep `deployments/` empty for production monitors (Stage 4)

**Success Criteria**:

✅ All TypeScript types compile
✅ Database schema migrated (test → health_checks)
✅ Monitor performs HTTP checks with timeout
✅ Grace period tracks consecutive failures (console.log only)
✅ All endpoints require bearer token (/, /stats, /trigger-check)
✅ Mock target responds to control parameters
✅ 11+ integration tests passing
✅ Manual trigger works for deterministic testing
✅ Scheduled checks run automatically (1s interval in tests)
✅ Stats API returns accurate data for any time range
✅ Documentation updated

---

### Stage 3: SMTP Notifications 📧

**Goal**: Add email notifications with worker-mailer

#### 3.1 SMTP Notifier

- [ ] Install worker-mailer: `bun add worker-mailer`
- [ ] Create `src/notifier.ts`
- [ ] Implement `sendEmailNotification()`
- [ ] Implement `formatMessage()` for plain text
- [ ] Implement `convertToHtml()` for HTML emails

#### 3.2 Integration with Worker

- [ ] Add SMTP config to types
- [ ] Wire up notifications in scheduled handler
- [ ] Test DOWN notification (after grace period)
- [ ] Test UP notification (immediate)

#### 3.3 Test with Real SMTP

- [ ] Configure test SMTP server (Mailtrap or similar)
- [ ] Deploy and trigger test failure
- [ ] Verify email received
- [ ] Verify HTML formatting

**Success Criteria**:

- Emails sent on state changes
- Grace period respected for DOWN alerts
- UP alerts sent immediately
- HTML emails render correctly

---

### Stage 4: Production Deployment Setup 🚀

**Goal**: Create real deployment configuration and tooling

#### 4.1 Real Deployment Config

- [ ] Create `deployments/trival-xyz/deploy.ts`
- [ ] Create `deployments/trival-xyz/.env.example`
- [ ] Add all ENV vars (SMTP, target URL, grace period, etc.)
- [ ] Update Drizzle config to point to real deployment

#### 4.2 Scaffold Script

- [ ] Create `scripts/new-monitor.sh`
- [ ] Script generates new deployment from template
- [ ] Make script executable: `chmod +x scripts/new-monitor.sh`
- [ ] Test scaffold: `./scripts/new-monitor.sh test-monitor`

#### 4.3 Documentation

- [ ] Create root README.md
- [ ] Document deployment workflow
- [ ] Document environment variables
- [ ] Document grace period behavior
- [ ] Add SQL query examples

#### 4.4 Deploy First Real Monitor

- [ ] Configure trival.xyz monitor
- [ ] Deploy: `cd deployments/trival-xyz && bun run deploy.ts`
- [ ] Apply migrations: `bun run db:push`
- [ ] Verify worker is running
- [ ] Test API endpoint
- [ ] Trigger test notification

**Success Criteria**:

- Real monitor deployed and running
- Cron triggers working
- Email notifications working
- Stats API accessible
- Documentation complete

---

### Stage 5: Polish & Optimization ✨

**Goal**: Clean up, optimize, and add nice-to-haves

#### 5.1 Cleanup & Refactoring

- [ ] Remove test deployment
- [ ] Clean up old test code
- [ ] Add JSDoc comments
- [ ] Ensure consistent code style

#### 5.2 Additional Features

- [ ] Add support for custom HTTP headers
- [ ] Add support for POST body
- [ ] Add support for custom expected codes

#### 5.3 Drizzle Studio

- [ ] Test Drizzle Studio: `bun run db:studio`
- [ ] Verify database browsing works
- [ ] Document in README

#### 5.4 Final Testing

- [ ] Test multiple concurrent monitors
- [ ] Test grace period edge cases
- [ ] Load test with high-frequency checks
- [ ] Verify 90-day cleanup works

**Success Criteria**:

- Code is clean and documented
- All features working
- Multiple monitors deployed
- Performance acceptable

---

### Stage 6: POST-MVP Features 📅

**Goal**: Add data retention and weekly reporting (implement after Stage 5)

#### 6.1 6-Month Data Retention

- [ ] Add `cleanupOldChecks()` function for 6-month retention
  ```typescript
  // Cleanup old checks (>6 months)
  export async function cleanupOldChecks(db: ReturnType<typeof createDb>) {
    const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000
    const result = await db
      .delete(healthChecks)
      .where(sql`${healthChecks.timestamp} < ${sixMonthsAgo}`)
    return result
  }
  ```
- [ ] Add ENV var: `DATA_RETENTION_DAYS` (default: 180)
- [ ] Integrate cleanup into weekly report (run before generating report)
- [ ] Add logging for cleanup actions (how many records deleted)
- [ ] Document retention policy in README

#### 6.2 Weekly Email Reports

- [ ] Add `getWeeklyStats()` query function:
  - Total checks in last 7 days
  - Uptime percentage
  - Average response time
  - Total downtime minutes
  - Number of incidents (consecutive failure groups)
- [ ] Create `formatWeeklyReport()` in notifier.ts:
  - Plain text format
  - HTML email with charts/tables
- [ ] Add new cron trigger for weekly reports:
  - Default: `0 9 * * 1` (Monday 9 AM)
  - Configurable via `WEEKLY_REPORT_SCHEDULE`
- [ ] Add ENV var: `WEEKLY_REPORT_EMAIL` (optional, defaults to `NOTIFICATION_EMAIL`)
- [ ] Combine weekly report with data cleanup:
  1. Generate weekly stats
  2. Send email report
  3. Run `cleanupOldChecks()` to delete 6-month-old data
  4. Log cleanup summary in report
- [ ] Add option to disable weekly reports: `ENABLE_WEEKLY_REPORTS` (default: true)

#### 6.3 Testing & Documentation

- [ ] Test 6-month cleanup with mock old data
- [ ] Test weekly report generation
- [ ] Verify cleanup doesn't affect recent data
- [ ] Document weekly report format in README
- [ ] Add examples of weekly report output
- [ ] Document data retention policy

**Success Criteria**:

- Old data (>6 months) is automatically cleaned up
- Weekly reports sent on schedule with accurate stats
- Cleanup runs together with weekly reports
- Database size stays manageable over time
- Reports are formatted nicely (plain text + HTML)

## Key Benefits vs Uptimeflare

| Feature                   | Uptimeflare           | Trival-Monitor       |
| ------------------------- | --------------------- | -------------------- |
| **Instances per account** | 1                     | Unlimited            |
| **Notification targets**  | 1 for all             | 1 per monitor        |
| **Deployment tool**       | Terraform             | Alchemy (TypeScript) |
| **Dashboard**             | Complex Next.js       | None (API only)      |
| **Configuration**         | TypeScript file       | ENV vars             |
| **State management**      | Complex grace periods | Simple up/down       |
| **Storage**               | D1 (shared)           | D1 (isolated)        |
| **Package manager**       | npm                   | Bun                  |
| **Database layer**        | Raw SQL               | Drizzle ORM          |

## Deployment Workflow (Using Bun)

### Initial Setup (One Time)

```bash
# 1. Initialize project with Bun
cd trival-monitor
bun install

# 2. Verify TypeScript setup
bun run typecheck
```

### Deploy a New Monitor

```bash
# 1. Use scaffold script
./scripts/new-monitor.sh trival-xyz

# 2. Configure environment
cd deployments/trival-xyz
cp .env.example .env
# Edit .env with your values

# 3. Deploy with Alchemy
bun run deploy.ts

# 4. Apply Drizzle migrations to D1
cd ../../shared
bun run db:push
```

### Query Statistics

**Via API:**

```bash
curl -H "Authorization: Bearer your-token" \
  https://monitor-trival-xyz.workers.dev/api/stats | jq
```

**Via Drizzle Studio (GUI):**

```bash
cd shared
bun run db:studio
# Opens browser with D1 database explorer
```

**Via SQL (wrangler CLI):**

```bash
wrangler d1 execute monitor_trival_xyz_d1 \
  --command "SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 10"
```

## Environment Variables

```bash
# Service Configuration
SERVICE_NAME=Trival.xyz Website          # Human-readable name
TARGET_URL=https://trival.xyz            # URL to monitor
HTTP_METHOD=GET                          # GET or POST
PING_TIMEOUT=10000                       # Timeout in milliseconds
CHECK_INTERVAL="* * * * *"               # Cron schedule (every 1 min)

# Grace Period Configuration
GRACE_PERIOD_FAILURES=3                  # Alert after N consecutive failures

# Optional HTTP Configuration
# HTTP_HEADERS={"Authorization":"Bearer token"}
# HTTP_BODY={"check":"health"}
# EXPECTED_CODES=200,301,302

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=your-app-password             # Use app-specific password
NOTIFICATION_EMAIL=oncall@example.com
# NOTIFICATION_EMAIL_FROM=monitoring@example.com

# API Security
API_BEARER_TOKEN=random-secure-token-here
```

## Grace Period Behavior

### Scenario 1: Service Goes Down

1. **10:00** - Check fails (consecutive failures: 1)
   - Action: Store failure, no notification
2. **10:01** - Check fails (consecutive failures: 2)
   - Action: Store failure, no notification
3. **10:02** - Check fails (consecutive failures: 3)
   - Action: Store failure, **send DOWN notification** ✉️
4. **10:03** - Check fails (consecutive failures: 4)
   - Action: Store failure, no notification (already alerted)

### Scenario 2: Service Recovers

1. **10:04** - Check succeeds
   - Action: Store success, **send UP notification immediately** ✉️

### Scenario 3: Transient Failures (No Alert)

1. **10:00** - Check fails (consecutive failures: 1)
2. **10:01** - Check fails (consecutive failures: 2)
3. **10:02** - Check succeeds (consecutive failures: 0)
   - Action: No notification sent (grace period not met)

## Sources

- [Alchemy GitHub](https://github.com/alchemy-run/alchemy)
- [Alchemy D1 + Drizzle Guide](https://alchemy.run/guides/drizzle-d1/)
- [Uptimeflare Repository](https://github.com/lyc8503/UptimeFlare)
- [worker-mailer](https://www.npmjs.com/package/worker-mailer)
- [Drizzle ORM](https://orm.drizzle.team/)

## Next Steps

Proceed with Stage 1 implementation:

1. ✅ Run `bun init` to initialize project
2. Update package.json with dependencies
3. Create bunfig.toml configuration
4. Update .gitignore for Alchemy state files
5. Create minimal worker in `src/index.ts`
6. Set up Drizzle with test schema
7. Create test deployment in `deployments/test/`
8. Verify Alchemy + Drizzle + Bun integration works

**Note**: POST-MVP features (6-month data retention and weekly reports) are documented in Stage 6.
