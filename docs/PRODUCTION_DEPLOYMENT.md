# Virtual Gym Buddy — Production Deployment Guide

This guide provides instructions for deploying the **Virtual Gym Buddy** application into production.

> [!IMPORTANT]
> **Pre-Deployment Notice**: All deployment steps in this document represent **future production operations**. Do not execute live deployments or connect real billing accounts without explicit review and approval.

---

## 1. Hosting Architecture & Recommendation

### Recommended Target: Unified Node.js Container / PaaS (Google Cloud Run)
Virtual Gym Buddy combines a Vite-built React single-page application (SPA) with a secured Express backend serving Gemini AI endpoints. 

**Why Google Cloud Run (or Render / Railway container):**
- **Single Service**: The Express server (`dist/server.cjs`) serves both the pre-built static frontend assets (`dist/`) and all API endpoints (`/api/buddy/*`, `/api/health`).
- **Zero CORS Complexity**: Serving client and API from the exact same origin eliminates cross-origin browser restrictions.
- **Native Google Cloud Integration**: Cloud Run natively authenticates to Firebase services and Google Cloud APIs via Application Default Credentials (ADC), removing the need to manage and rotate manual private key JSON files.
- **Automatic HTTPS & Reverse Proxy**: HTTPS termination, DDoS protection, and HTTP/2 ingress are handled at the platform edge.
- **Cost & Elasticity**: Scales to zero when inactive and auto-scales on demand.
- **Server Artifact Protection**: In production, direct requests to `/server.cjs`, `/server.cjs.map`, and `.cjs` files are strictly blocked with HTTP 404, preventing source code exposure.
- **Graceful Shutdown**: The Express server catches `SIGTERM` and `SIGINT` signals, draining in-flight requests before exiting cleanly within a 10s grace window.

**Alternative Platform Support**:
The production build runs standard Node.js (`node dist/server.cjs`) and is compatible with any container or Node.js PaaS (Render, Railway, Fly.io, Heroku, or AWS App Runner).

---

## 2. Prerequisites & Accounts Required

Before deploying, ensure you have set up:

1. **Google Cloud / Firebase Account**:
   - Access to the [Firebase Console](https://console.firebase.google.com).
   - A created Firebase project (e.g. `virtual-gym-buddy-prod`).
2. **Google AI Studio / Gemini API Key**:
   - An active API key from [Google AI Studio](https://aistudio.google.com).
3. **Container / Hosting Account**:
   - Google Cloud Project with Cloud Run enabled, OR an account on Render, Railway, or Fly.io.
4. **Local Tools** (optional for manual CLI deployments):
   - `firebase-tools` CLI (`npm install -g firebase-tools`).
   - `gcloud` CLI (if deploying to Cloud Run via CLI).

---

## 3. Environment Variables Specification

Configure the following environment variables in your hosting provider's management console or secret manager.

| Variable Name | Required? | Location | Type | Description |
|---|---|---|---|---|
| `GEMINI_API_KEY` | **Required** | Server Only | **Secret** | API key for Gemini 2.5 Flash model used by `/api/buddy/*` routes. |
| `NODE_ENV` | **Required** | Server Only | Public | Must be set to `"production"`. Controls static asset serving and error masking. |
| `PORT` | Optional | Server Only | Public | Port to bind (default `3000`). Cloud Run automatically sets `8080`. |
| `TRUST_PROXY` | **Required** | Server Only | Public | Set to `"true"` or `"1"` when behind Cloud Run, Render, or Cloudflare reverse proxy. |
| `ENABLE_HSTS` | Optional | Server Only | Public | Set to `"true"` to enable HTTP Strict Transport Security (HSTS) headers. |
| `ALLOWED_ORIGINS` | Optional | Server Only | Public | Comma-separated list of external CORS domains (leave empty for same-origin). |
| `FIREBASE_PROJECT_ID` | **Required** | Server Only | Public | Firebase project ID used by Firebase Admin to verify user ID tokens. |
| `FIREBASE_CLIENT_EMAIL` | Optional* | Server Only | Public | Service account email. *Not needed on Google Cloud Run with ADC.* |
| `FIREBASE_PRIVATE_KEY` | Optional* | Server Only | **Secret** | Service account private key. *Not needed on Google Cloud Run with ADC.* |
| `RATE_LIMIT_WINDOW_MS` | Optional | Server Only | Public | Sliding window duration in milliseconds (default: `900000` = 15m). |
| `RATE_LIMIT_GUEST_MAX` | Optional | Server Only | Public | Maximum AI requests allowed per guest IP per window (default: `10`). |
| `RATE_LIMIT_AUTH_MAX` | Optional | Server Only | Public | Maximum AI requests allowed per user UID per window (default: `60`). |
| `VITE_FIREBASE_API_KEY` | **Required** | Build & Client | Public | Firebase Web Client API key (embedded into frontend bundle). |
| `VITE_FIREBASE_AUTH_DOMAIN` | **Required** | Build & Client | Public | Firebase Auth domain (e.g. `your-project.firebaseapp.com`). |
| `VITE_FIREBASE_PROJECT_ID` | **Required** | Build & Client | Public | Firebase Web Project ID. |
| `VITE_FIREBASE_APP_ID` | **Required** | Build & Client | Public | Firebase Web App ID (`1:1234567890:web:...`). |
| `VITE_USE_FIREBASE_EMULATOR` | **Required** | Build & Client | Public | **MUST be set to `"false"`** in production. |

> [!CAUTION]
> **Zero Secret Leak Rule**: Never prefix `GEMINI_API_KEY`, `FIREBASE_PRIVATE_KEY`, or service account keys with `VITE_`. Any variable starting with `VITE_` is baked into client browser JavaScript.

---

## 4. Firebase Project Setup & Configuration

Follow these steps in the [Firebase Console](https://console.firebase.google.com):

### Step 1: Create or Select Production Project
1. Open Firebase Console and select **Add project**.
2. Name your project (e.g., `virtual-gym-buddy-prod`).
3. Google Analytics can be enabled or disabled as desired.

### Step 2: Enable Firebase Authentication
1. Navigate to **Build** -> **Authentication** -> **Get Started**.
2. Under the **Sign-in method** tab, click **Email/Password**.
3. Toggle **Enable** (Email link passwordless can remain disabled). Click **Save**.

### Step 3: Register Web App
1. Go to **Project Settings** (gear icon) -> **General** -> **Your apps**.
2. Click the **Web** icon (`</>`) to register an application.
3. Name it `Virtual Gym Buddy Web`.
4. Copy the values for `apiKey`, `authDomain`, `projectId`, and `appId`.
5. These map directly to:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

### Step 4: Deploy Firestore Security Rules
1. In the project root, ensure `firestore.rules` is present.
2. Deploy the rules to your live project using the Firebase CLI:
   ```bash
   firebase login
   firebase use <your-production-project-id>
   firebase deploy --only firestore:rules
   ```
3. Verify in the Firebase Console under **Firestore Database** -> **Rules** that default-deny and `isOwner(userId)` rules are active.

### Step 5: Database Indexes
- Virtual Gym Buddy queries subcollections using single-collection, single-field filters and limits (`limit(50)`).
- **No composite indexes are required**. Firestore's automatic single-field indexes cover all application queries.

---

## 5. Local Production Build & Verification

Before uploading code or triggering CI/CD, verify the production build locally:

```bash
# 1. Install production dependencies
npm ci

# 2. Run automated test suites (116 passing tests)
npm test

# 3. Perform TypeScript type check
npm run lint

# 4. Compile frontend SPA and backend bundle
npm run build

# 5. Verify production startup locally
NODE_ENV=production PORT=3000 npm start
```

Test the health endpoint locally:
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"...","uptime":...}
```

---

## 6. Deployment Step-by-Step

### Option A: Google Cloud Run (Container Deployment)

The repository provides automated deployment templates in the `deploy/` directory:
- [`deploy/cloudrun-service.yaml`](file:///d:/virtual-gym-buddy (1)/deploy/cloudrun-service.yaml): Declarative Knative service specification.
- [`deploy/deploy-cloudrun.sh`](file:///d:/virtual-gym-buddy (1)/deploy/deploy-cloudrun.sh): Linux/macOS deployment script.
- [`deploy/deploy-cloudrun.ps1`](file:///d:/virtual-gym-buddy (1)/deploy/deploy-cloudrun.ps1): Windows PowerShell deployment script.

#### Manual Step-by-Step Deployment:

1. **Verify Dockerfile** in project root (pre-configured multi-stage build running as non-root `node` user on port 8080).

2. **Deploy via Google Cloud SDK**:
   ```bash
   gcloud run deploy virtual-gym-buddy \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --service-account "virtual-gym-buddy-runner@<your-project-id>.iam.gserviceaccount.com" \
     --set-env-vars NODE_ENV=production,TRUST_PROXY=true,FIREBASE_PROJECT_ID=<your-project-id>,ENABLE_HSTS=true \
     --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
   ```

3. **Or Deploy Declaratively via Service YAML**:
   ```bash
   # Replace PROJECT_ID placeholder with your actual GCP Project ID
   sed -i 's/PROJECT_ID/<your-project-id>/g' deploy/cloudrun-service.yaml
   gcloud run services replace deploy/cloudrun-service.yaml --region us-central1
   ```

---

### Option B: Render Free Web Service (₹0 Budget Target)

Render's native Node.js runtime is the optimal deployment target for a zero-cost budget.

#### Free Tier Operating Specifications
- **Cost**: ₹0 (No credit card required for standard account).
- **Compute**: 512 MB RAM, 0.1 vCPU.
- **Monthly Usage**: 750 free instance hours per month (sufficient for 24/7 single-service availability).
- **Cold-Start Behavior**: The service spins down after 15 minutes of inactivity. Incoming requests will experience a 30–50 second cold-start delay while the instance wakes up; subsequent requests respond instantly.
- **Zero CORS / Single Service**: The Express server hosts both the pre-built React frontend and the Gemini AI proxy from a single origin.

#### Deployment Method 1: Infrastructure as Code (`render.yaml` Blueprint)

The repository includes a ready-to-use [`render.yaml`](file:///d:/virtual-gym-buddy (1)/render.yaml) specification.

1. Push your repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Connect your repository. Render automatically reads `render.yaml` and prepares the `virtual-gym-buddy` Web Service.
4. Render prompts you for the missing secret values marked `sync: false`:
   - `GEMINI_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - Firebase credentials (see credential options below).
5. Click **Apply** to build and launch the service.

#### Deployment Method 2: Manual Web Service Setup

If you prefer configuring through the Render Web UI:

1. Click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the service settings:
   - **Name**: `virtual-gym-buddy`
   - **Region**: Choose closest to your users (e.g. `Frankfurt`, `Oregon`, or `Singapore`).
   - **Branch**: `main`
   - **Runtime**: **Node** (uses Node >=20 as specified in `package.json`).
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/server.cjs`
   - **Instance Type**: **Free** (512MB RAM, 0.1 CPU).
4. Under **Advanced** -> **Health Check Path**, enter: `/api/health`.
5. Under **Environment Variables**, add the variables documented in Section 3.

#### Firebase Admin Credentials on Render

Render does not use Google Cloud Application Default Credentials (ADC). Choose one of two safe credential methods:

- **Method 1 (Recommended): Render Secret File**
  1. In your Render Web Service dashboard, navigate to **Environment** -> **Secret Files**.
  2. Click **Add Secret File**.
  3. Filename: `serviceAccountKey.json` (Render stores this securely at `/etc/secrets/serviceAccountKey.json`).
  4. Contents: Paste your Firebase service account private key JSON downloaded from Firebase Console (**Project Settings** -> **Service accounts** -> **Generate new private key**).
  5. Under **Environment Variables**, add:
     - `FIREBASE_SERVICE_ACCOUNT_PATH`: `/etc/secrets/serviceAccountKey.json`
  6. The server automatically detects and loads the file via `fs.existsSync`.

- **Method 2: Direct Environment Variables**
  1. Under **Environment Variables**, add:
     - `FIREBASE_CLIENT_EMAIL`: Your service account email.
     - `FIREBASE_PRIVATE_KEY`: Your service account private key (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`). The server handles both literal linebreaks and `\n` escape sequences.

#### Frontend Client Environment Variables at Build Time

> [!IMPORTANT]
> Vite bakes all `VITE_*` variables into the static JavaScript bundle at **build time** (`npm run build`). You MUST configure the following variables in the Render dashboard **before** triggering the initial build:
> - `VITE_FIREBASE_API_KEY`
> - `VITE_FIREBASE_AUTH_DOMAIN`
> - `VITE_FIREBASE_PROJECT_ID`
> - `VITE_FIREBASE_APP_ID`
> - `VITE_USE_FIREBASE_EMULATOR="false"`

#### Rate Limiting & Reverse Proxy

Render places services behind a Cloudflare reverse proxy.
- Ensure `TRUST_PROXY=true` is set.
- This allows Express to inspect the `X-Forwarded-For` header for accurate client IP resolution, ensuring guest rate limits (10 requests / 15 minutes) apply per guest device rather than globally.

#### ₹0 Budget Architecture & Quota Summary

| Component | Provider / Tier | Free Quotas & Guardrails | Virtual Gym Buddy Safeguards |
|---|---|---|---|
| **Web Hosting** | Render Free Web Service | 512MB RAM, 0.1 CPU, 750 hrs/month | Auto-spins down after 15m idle; memory footprint is ~45MB RSS in production. |
| **User Database** | Firebase Firestore (Spark) | 50,000 reads/day, 20,000 writes/day, 1GB storage | Subcollection limits (`limit(50)`), client-side caching, local data preservation. |
| **User Identity** | Firebase Auth (Spark) | Unlimited email/password users | Client token refresh, server verification hook, secure sessions. |
| **AI Companion** | Google AI Studio (Gemini 2.5 Flash) | 15 RPM, 1,500 RPD free tier | Differentiated rate limiting (10 req/guest, 60 req/auth); graceful offline fallback. |

---

## 7. Post-Deployment Smoke Test Protocol

After deployment, perform this sequential verification on the production URL:

1. **Service Health Check**:
   - Browse to `https://<your-domain>/api/health`.
   - Confirm HTTP 200 with JSON `{ "status": "ok" }`.
2. **Guest Mode & Offline Persistence**:
   - Open an incognito browser window.
   - Confirm starter workout, water logging, and Marcus chat initialize without errors.
   - Refresh page; confirm logged water and workouts persist from `localStorage`.
3. **AI Endpoint Smoke Test**:
   - Send a message in companion chat.
   - Confirm companion responds (or returns fallback if key is missing/rate limited).
4. **Account Registration**:
   - Register a new test account (`test-user-prod@example.com`).
   - Confirm successful sign-in; verify existing guest data was NOT deleted from local storage.
5. **Per-User Isolation Check**:
   - Sign in as User A in Browser 1 and User B in Browser 2.
   - Add a workout in User A. Verify User B cannot view User A's workout.
6. **Data Migration Verification**:
   - Open Account Settings -> **Migrate Local Data**.
   - Review scanned local items and submit with explicit consent.
   - Confirm records appear in authenticated user profile.
7. **Offline Backup Export/Import**:
   - Click **Export Backup** in settings. Verify clean `.json` download.
   - Test JSON upload integrity.
8. **Account Deletion Test**:
   - In Account Settings, click **Delete Account**.
   - Confirm password re-authentication modal appears. Enter password and confirm.
   - Verify cloud documents are purged and user session is terminated.

---

## 8. Rollback & Troubleshooting

### Incident: Gemini AI Returns 429 Too Often
- **Cause**: Guest limit (10 req/15m) or Authenticated limit (60 req/15m) exceeded.
- **Remedy**: Adjust `RATE_LIMIT_GUEST_MAX` or `RATE_LIMIT_AUTH_MAX` in hosting environment settings.

### Incident: Token Verification Returns 401 for All Users
- **Cause**: `FIREBASE_PROJECT_ID` does not match the project ID used in `VITE_FIREBASE_PROJECT_ID`, or server-side service account is missing.
- **Remedy**: Confirm both project IDs match exactly in environment variables.

### Incident: Blank Screen or Firebase Client Warning
- **Cause**: Missing `VITE_FIREBASE_API_KEY` or `VITE_USE_FIREBASE_EMULATOR="true"`.
- **Remedy**: Verify build arguments were passed during `npm run build` and `VITE_USE_FIREBASE_EMULATOR` is set to `"false"`.

### Incident: Rollback Procedure
- In Cloud Run or Render, click **Revisions** / **Deployments** and click **Revert / Roll back to previous revision**. Rollbacks take effect instantaneously.

---

## 9. Known Architectural Limitations

1. **In-Memory Rate Limiting**:
   - The current rate limiter uses an in-memory sliding window store.
   - If running multiple container instances or autoscaling workers, each worker maintains its own quota counter.
   - For strict distributed rate limiting across horizontal clusters, upgrade `express-rate-limit` to use a Redis store (`rate-limit-redis`).
2. **Third-Party Transitive Dependencies**:
   - `npm audit` identifies transitive vulnerabilities in `@grpc/grpc-js` and `body-parser`.
   - These are mitigated in production by our 256 KB body size limit, strict Zod validation, and reverse proxy edge protections.
