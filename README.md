# AutoClaim AI — Smart Insurance Claim Automation

A full-stack motor insurance claim platform: customer panel, administration console, AI verification pipeline, policy dataset and demo settlement gateway.

Built with **Node.js + Express + EJS + MySQL** (no build step, no frontend framework — clone, install, run).

---

## 1. What is included

**Public website** — landing page explaining the 8-stage pipeline, about/architecture, help centre with FAQ, contact form, public policy-status lookup, terms & privacy, English / हिन्दी / मराठी, light & dark theme.

**Customer panel**

- Dashboard: active policies, open claims, settled amount, pending payout, next renewal
- Garage: add/remove vehicles, link a policy
- Policies: schedule, add-ons, full clause library
- Claims: list with filters, 3-step claim wizard (incident → photos + documents → declaration), live verification screen, full claim report, timeline, settlement
- Notifications, support tickets with conversation thread, profile & password, language/theme preferences

**Admin console**

- Operations dashboard: claim volume, status mix, STP-eligible rate, fraud flags, average verification time, review queue
- Claims queue with search + status/risk filters
- Claim review: OCR result, image forensics, damage list, severity, repair cost, fraud signals, RAG coverage reason, decision record
- Manual decision (approve with amount / reject with remarks), manual assessment override, re-run AI, offline NEFT payout
- Register a claim on a customer's behalf, with optional immediate AI run
- Customers, vehicles, policies (with clause editor), CSV dataset import
- Payments, support tickets, contact enquiries, audit trail, AI thresholds

**AI verification layer** (`src/services/ai-engine.js`)
Eight stages with a stable input/output contract: OCR extraction & cross-check, AI-image/deepfake scoring, CNN vehicle match, YOLOv11-style damage detection, severity scoring, repair-cost estimation, RAG policy coverage with clause citation, fraud/risk scoring, and a structured decision record.

> **Important for the report/panel:** this repository ships a **deterministic verification engine**, not trained weights. Each stage is a separate function with the same contract the Python service will expose, clearly documented at the top of the file. Replace a function body with an HTTP call to FastAPI and the rest of the product keeps working. The UI labels the demo honestly, and the claim pipeline, audit trail, coverage retrieval and decision logic are real.

---

## 2. Requirements

- Node.js 18 or newer
- MySQL 8.x or MariaDB 10.4+ (XAMPP / MySQL Workbench / local install)

---

## 3. Setup

```bash
# 1. install dependencies
npm install

# 2. configure environment
cp .env.example .env        # Windows: copy .env.example .env
#    edit DB_USER / DB_PASSWORD if your MySQL root account has a password

# 3. create the database, tables and demo dataset
npm run db:init -- --seed

# 4. start
npm start
```

Open <http://localhost:3000>.

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Customer | `rohit@autoclaim.ai` | `Auto@123` |
| Customer | `vasudha@autoclaim.ai` | `Auto@123` |
| Admin | `admin@autoclaim.ai` | `Auto@123` locally; private generated password on Render |
| Adjuster | `adjuster@autoclaim.ai` | `Auto@123` locally; private generated password on Render |

The seed creates 10 customers, 11 vehicles/policies and 9 claims spread across every stage (settled, approved, manual review, fraud-flagged, rejected, pending AI).

### Useful commands

```bash
npm run db:init              # create database + tables (keeps data)
npm run db:init -- --seed    # create + seed
npm run db:reset             # drop, recreate and seed
npm run dev                  # node --watch
```

If MySQL is not installed, `scripts/dev-mysql.js` can start a temporary server on port 3307 (requires `npm i -D mysql-memory-server`), then run with `DB_PORT=3307`.

---

## Free public demo deployment

The included [`render.yaml`](./render.yaml) configures a Render free web service with a TiDB Cloud MySQL-compatible database. Free-tier availability and limits are controlled by the providers and can change. The app seeds demo records on first start only; later restarts leave existing database data alone.

1. Create a TiDB Cloud Starter cluster and a database user. Enable its public endpoint, configure its IP access list to allow Render connections, and note the TLS MySQL connection host, port, username, password, and database name.
2. In Render, choose **New → Blueprint**, connect this repository, and deploy. When prompted, enter those five database values for `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. The blueprint enables TLS, generates private session/admin passwords, and advertises the customer demo account on the login page. The free web service initializes the schema at startup; demo data is inserted only if the database is empty, so restarts do not overwrite existing data.
3. Wait for the first deployment to finish. The service startup command applies the schema and seeds the demo data. The public URL is shown in the Render dashboard.

The public customer demo login is `rohit@autoclaim.ai` / `Auto@123`. The admin password is generated by Render and is not shown on the public login page or in logs. Keep it private.

This is a demo deployment, not production hosting: Render's free service may sleep when idle, its local filesystem is ephemeral (uploaded evidence can disappear after restarts/redeploys), and sessions are in memory. Do not enter real customer or insurance information.

---

## 4. Claim flow

1. Customer opens **Claims → File a new claim**, selects a vehicle (policy is resolved automatically), enters incident details.
2. Uploads 2+ accident photos and documents (RC, licence, policy copy, claim form; FIR optional).
3. Submits → the verification screen runs the 8 stages → claim moves to **manual review** with an AI recommendation.
4. Adjuster opens the claim in **Admin → Claims queue**, reviews the evidence, may override the assessment, then approves an amount or rejects with remarks.
5. Customer completes the settlement (Razorpay if configured, otherwise the labelled demo gateway) and the claim becomes **Settled**.

Claims are only admissible if a policy was in force on the incident date; the coverage agent cites the clause it used either way.

### Try the demo scenarios

| Vehicle | What it demonstrates |
| --- | --- |
| `MH12AB1234` | Fully approved and settled claim with complete evidence |
| `MH14CD2211` | Medium-risk claim waiting for manual review |
| `MH15GH4432` | Third-party-only policy → own damage rejected by coverage agent |
| `MH09IJ7755` | Expired policy → claim rejected at intake |
| `MH12KL3322` | High AI-image probability → fraud suspected |
| `MH04QR5566` | Fresh claim with no AI run yet |

---

## 5. Razorpay

Settlement uses the real Razorpay Orders API when keys exist, otherwise the demo gateway.

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
```

Restart the server afterwards. Keep `.env` out of version control — it is already git-ignored.

---

## 6. CSV dataset import

**Admin → Import CSV** accepts a header row with:

```
customer_name,email,phone,city,reg_no,make,model,year,fuel,policy_number,policy_type,start_date,end_date,sum_insured,idv,premium,status
```

Required: `email`, `reg_no`, `make`, `model`, `policy_number`. Existing customers are matched by email, vehicles by registration, policy numbers are unique. Rows are reported individually if skipped.

---

## 7. Project structure

```
server.js                 Express app, session, error handling
db/schema.sql             MySQL schema (13 tables)
scripts/init-db.js        create database + apply schema
scripts/seed-data.js      demo customers, vehicles, policies, clauses, claims
src/config.js             environment configuration
src/db.js                 connection pool + query helpers
src/i18n.js, locales/     English / Hindi / Marathi dictionaries
src/services/ai-engine.js verification pipeline (integration seam)
src/services/claims.js    claim lifecycle, notifications, audit
src/services/payment.js   Razorpay + demo gateway
src/routes/               public, auth, user, admin, api
views/                    EJS templates (public, auth, user, admin)
public/css/app.css        design system incl. dark theme
public/js/app.js          theme, wizard, uploads, analysis animation
```

---

## 8. Notes & limitations

- Uploaded evidence is stored in `public/uploads/` (excluded from git). In production this belongs in object storage with signed URLs.
- Sessions use the default in-memory store — fine for a single-process demo, use a MySQL/Redis store for deployment.
- AI stages are deterministic stand-ins; accuracy figures in the report must come from the trained models, not this demo.
- Email/SMS notifications are represented by in-app notifications only.
- Password reset is handled by the claims desk (no outbound email in this build).

**Claims desk** — Rohit Khobare · +91 9096809820 · rohitkhobare2005@gmail.com
