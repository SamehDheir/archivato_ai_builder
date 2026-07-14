# API Reference

All routes are served under `http://localhost:3001/api` (global prefix).

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
| POST   | `/api/auth/register`       | Create an account; sets auth cookies         |
| POST   | `/api/auth/login`          | Sign in; sets auth cookies                   |
| POST   | `/api/auth/refresh`        | Rotate the refresh cookie + re-issue access  |
| POST   | `/api/auth/logout`         | Revoke the refresh token and clear cookies   |
| POST   | `/api/auth/verify-email`   | Confirm an email-verification token (public) |
| POST   | `/api/auth/resend-verification`| Re-send the verification email (guarded) |
| GET    | `/api/auth/me`             | Current user (requires a valid access cookie)|
| PATCH  | `/api/auth/profile`        | Update the signed-in user's display name     |
| PUT    | `/api/auth/avatar`         | Set the profile picture (base64 image data URI) |
| DELETE | `/api/auth/avatar`         | Remove the profile picture (falls back to initials) |
| POST   | `/api/auth/change-password`| Change/set password; revokes other sessions  |
| DELETE | `/api/auth/me`             | Permanently delete the account (cascades)    |
| GET    | `/api/interview`           | List the signed-in user's projects           |
| POST   | `/api/interview`           | Start an interview from a raw idea (owned)    |
| GET    | `/api/interview/:id`       | Fetch current interview state (owner only)   |
| POST   | `/api/interview/:id/answer`| Answer the current question and advance      |
| POST   | `/api/interview/:id/confirm`| Confirm the summarized requirements (gate)  |
| DELETE | `/api/interview/:id`       | Delete a project + its artifacts (owner only)|
| POST   | `/api/requirements/:sessionId/generate`| Generate the Requirement Document (confirmed only) |
| GET    | `/api/requirements/:sessionId`| Fetch a generated Requirement Document    |
| POST   | `/api/system-design/:sessionId/generate`| Generate the System Design (requirements required) |
| GET    | `/api/system-design/:sessionId`| Fetch a generated System Design          |
| POST   | `/api/system-design/:sessionId/explain`| Explain one design decision (rationale/tradeoffs; ephemeral) |
| POST   | `/api/database-design/:sessionId/generate`| Generate the Database Design (system design required) |
| GET    | `/api/database-design/:sessionId`| Fetch a generated Database Design       |
| POST   | `/api/api-design/:sessionId/generate`| Generate the API Design (database design required) |
| GET    | `/api/api-design/:sessionId`| Fetch a generated API Design                 |
| POST   | `/api/review/:sessionId/generate`| Run the AI Review (full pipeline required)  |
| GET    | `/api/review/:sessionId`| Fetch a generated Review report                  |
| POST   | `/api/threat-model/:sessionId/generate`| Generate the STRIDE threat model (Pro; full pipeline) |
| GET    | `/api/threat-model/:sessionId`| Fetch a generated threat model             |
| POST   | `/api/qa-plan/:sessionId/generate`| Generate the test/QA plan (Pro; full pipeline) |
| GET    | `/api/qa-plan/:sessionId`| Fetch a generated QA plan                       |
| POST   | `/api/chat/:sessionId`  | Refine the design from a chat instruction        |
| GET    | `/api/chat/:sessionId`  | Fetch the refinement conversation                |
| POST   | `/api/jobs/:sessionId/:stage` | Enqueue async generation of a stage        |
| GET    | `/api/jobs/:sessionId/:jobId` | Poll a generation job's status + result    |
| GET    | `/api/stream/:sessionId/:stage` | Stream a stage's generation as SSE narration (owner-scoped) |
| GET    | `/api/versions/:sessionId` | List a project's version history             |
| GET    | `/api/versions/:sessionId/:version` | Fetch one version's full snapshot   |
| POST   | `/api/versions/:sessionId/:version/restore` | Restore the project to a version |
| GET    | `/api/diagrams/:sessionId` | Architecture diagrams (Mermaid source per kind) |
| GET    | `/api/billing/plans`       | Public plan catalogue (Free / Pro)           |
| GET    | `/api/billing`             | Current subscription + project-quota usage   |
| POST   | `/api/billing/checkout`    | Upgrade to Pro at `{billingCycle}` monthly/annual (mock activates; Paddle checkout) |
| POST   | `/api/billing/cancel`      | Cancel Pro                                   |
| POST   | `/api/billing/webhook`     | Paddle webhook (HMAC-verified; no auth)      |
| GET    | `/api/export/:sessionId/json`| Full artifact bundle (JSON)                 |
| GET    | `/api/export/:sessionId/markdown`| Markdown report                         |
| GET    | `/api/export/:sessionId/openapi`| OpenAPI 3.0 spec (JSON)                   |
| GET    | `/api/export/:sessionId/openapi.yaml`| OpenAPI 3.0 spec (YAML)              |
| GET    | `/api/export/:sessionId/schema.sql`| PostgreSQL DDL for the database design  |
| GET    | `/api/export/:sessionId/postman`| Postman collection (v2.1) of the API     |
| GET    | `/api/export/:sessionId/all.zip`| All formats bundled into one .zip        |
| GET    | `/api/export/:sessionId/structure`| GitHub project structure manifest       |
| GET    | `/api/share/:sessionId`    | My public link for this project (null if unshared) |
| POST   | `/api/share/:sessionId`    | Mint a public link — idempotent (Pro)        |
| DELETE | `/api/share/:sessionId`    | Revoke the public link (permanent)           |
| GET    | `/api/shared/:token`       | **Public**: read a shared design (no auth)   |
| GET    | `/api/scaffold/:sessionId` | Scaffold file manifest (Pro)                 |
| GET    | `/api/scaffold/:sessionId/zip`| Download the generated backend as a .zip (Pro)|
| POST   | `/api/scaffold/:sessionId/github`| Create a GitHub repo + push the scaffold (Pro)|
| GET    | `/api/scaffold/github/connection`| GitHub connection status (available/connected)|
| GET    | `/api/scaffold/github/connect/start`| Begin the Connect-with-GitHub OAuth popup |
| GET    | `/api/scaffold/github/connect/callback`| OAuth callback (stores the connection)  |
| DELETE | `/api/scaffold/github/connection`| Disconnect the stored GitHub connection      |
| GET    | `/api/notifications`       | My notifications + unread count (bell)       |
| POST   | `/api/notifications/read-all`| Mark all my notifications read             |
| PATCH  | `/api/notifications/:id/read`| Mark one notification read                 |
| POST   | `/api/analytics/track`     | Anonymous pageview beacon (no auth)          |
| GET    | `/api/admin/stats`         | Admin: KPIs + 30-day trends (admin only)     |
| GET    | `/api/admin/traffic`       | Admin: traffic detail (admin only)           |
| GET    | `/api/admin/users`         | Admin: paginated users (admin only)          |
| PATCH  | `/api/admin/users/:id/role`| Admin: promote/demote a user (bridges to RBAC)|
| DELETE | `/api/admin/users/:id`     | Admin: delete a user                         |
| GET    | `/api/admin/roles`         | List roles + user counts (`admin:roles:manage`)|
| POST   | `/api/admin/roles`         | Create a custom role                         |
| PATCH  | `/api/admin/roles/:id`     | Edit a role's name/description/permissions   |
| DELETE | `/api/admin/roles/:id`     | Delete a custom role (system roles protected)|
| GET    | `/api/admin/roles/user/:id`| A user's assigned role ids                   |
| PUT    | `/api/admin/roles/user/:id`| Replace a user's whole role set              |
| POST   | `/api/admin/roles/provision-user`| Provision a staff account (generated password, returned once)|
| POST   | `/api/waitlist`            | Public: join the marketing waitlist (idempotent)|
| GET    | `/api/waitlist/admin`      | Super-admin: filtered/paginated waitlist signups (`admin:roles:manage`)|
| GET    | `/api/billing/admin`       | Billing-admin: KPIs + filtered/paginated subscriptions (`billing:manage`)|
| GET    | `/api/billing/admin/trends`| Billing-admin: 30-day new-Pro vs churn series                |
| GET    | `/api/billing/admin/subscriptions/:id`| Billing-admin: one customer's detail + event history|
| POST   | `/api/billing/admin/subscriptions/:id/grant-pro`| Billing-admin: comp a user to Pro   |
| POST   | `/api/billing/admin/subscriptions/:id/revoke`| Billing-admin: downgrade a user to Free|
| GET    | `/api/support/stats`       | Customer's ticket counts by status           |
| GET    | `/api/support/kb`          | Published KB articles (optional `?q=` search; also used by the AI)|
| GET    | `/api/support/kb/:id`      | One published KB article (full body)         |
| GET    | `/api/support/admin/kb`    | List all KB articles incl. drafts (`support:kb:manage`)|
| POST   | `/api/support/admin/kb`    | Create a KB article (`support:kb:manage`)    |
| GET    | `/api/support/admin/kb/:id`| Fetch one KB article for editing (`support:kb:manage`)|
| PATCH  | `/api/support/admin/kb/:id`| Update a KB article (`support:kb:manage`)    |
| DELETE | `/api/support/admin/kb/:id`| Delete a KB article (`support:kb:manage`)    |
| GET    | `/api/support/tickets`     | List my tickets (filter/search/paginate)     |
| POST   | `/api/support/tickets`     | Open a new support ticket                    |
| GET    | `/api/support/tickets/:id` | Ticket detail (conversation + timeline)      |
| POST   | `/api/support/tickets/:id/reply`   | Reply to a ticket                    |
| POST   | `/api/support/tickets/:id/close`   | Close my ticket                      |
| POST   | `/api/support/tickets/:id/reopen`  | Reopen a resolved/closed ticket      |
| POST   | `/api/support/tickets/:id/attachments` | Attach a file (metadata + text)  |
| POST   | `/api/support/ai/deflect`  | Pre-ticket AI deflection (KB + past tickets) |
| POST   | `/api/support/tickets/:id/ai/analyze` | In-ticket AI assistant            |
| GET    | `/api/support/admin/stats` | Admin support dashboard metrics (admin only) |
| GET    | `/api/support/admin/agents`| Assignable admins (admin only)               |
| GET    | `/api/support/admin/tickets`| All tickets, filtered (admin only)          |
| PATCH  | `/api/support/admin/tickets/:id`| Change status/priority/category/assignee|
| POST   | `/api/support/admin/tickets/:id/notes`  | Add an internal note (admin)    |
| POST   | `/api/support/admin/tickets/:id/ai/copilot` | AI Copilot (admin only)     |

---

## Notes
- All pipeline data is **persisted in PostgreSQL** (Prisma); artifacts survive
  API restarts. The API requires a reachable `DATABASE_URL` to boot.
- **Production boot is validated.** With `NODE_ENV=production` the API refuses to
  start on an insecure config — a missing / default / too-short `JWT_ACCESS_SECRET`
  (generate one with `openssl rand -base64 48`), or `COOKIE_SAMESITE=none` without
  Secure cookies. See `apps/api/src/config/env.validation.ts`. For a cross-domain
  deploy (web + API on different hosts) set `COOKIE_SAMESITE=none` and
  `COOKIE_SECURE=true` (auto-on in production) so the auth cookies are sent.
- See [`CLAUDE.md`](./CLAUDE.md) for the running log of decisions and phase status.