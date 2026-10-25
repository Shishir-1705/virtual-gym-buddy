#!/usr/bin/env bash
# =============================================================================
# Virtual Gym Buddy — Cloud Run Deployment Helper Script
# =============================================================================
# IMPORTANT: This script requires a configured Google Cloud account, billing,
# and explicit user approval before execution. Do NOT run with unverified credentials.
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# 1. Environment Variable Pre-Flight Check
# -----------------------------------------------------------------------------
: "${PROJECT_ID:?Error: PROJECT_ID environment variable is required.}"
: "${REGION:=us-central1}"
: "${GEMINI_API_KEY:?Error: GEMINI_API_KEY environment variable is required.}"
: "${VITE_FIREBASE_API_KEY:?Error: VITE_FIREBASE_API_KEY is required for client build.}"
: "${VITE_FIREBASE_AUTH_DOMAIN:?Error: VITE_FIREBASE_AUTH_DOMAIN is required for client build.}"
: "${VITE_FIREBASE_PROJECT_ID:?Error: VITE_FIREBASE_PROJECT_ID is required for client build.}"
: "${VITE_FIREBASE_APP_ID:?Error: VITE_FIREBASE_APP_ID is required for client build.}"

IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/virtual-gym-buddy/app:$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"
SERVICE_ACCOUNT="virtual-gym-buddy-runner@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Virtual Gym Buddy Cloud Run Deployment ==="
echo "Target Project ID : ${PROJECT_ID}"
echo "Target Region     : ${REGION}"
echo "Container Image   : ${IMAGE_TAG}"
echo "Service Account   : ${SERVICE_ACCOUNT}"
echo "=============================================="

# -----------------------------------------------------------------------------
# 2. Enable Required Google Cloud Services
# -----------------------------------------------------------------------------
echo "--> Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  identitytoolkit.googleapis.com \
  firestore.googleapis.com \
  --project="${PROJECT_ID}"

# -----------------------------------------------------------------------------
# 3. Artifact Registry Repository
# -----------------------------------------------------------------------------
echo "--> Ensuring Artifact Registry repository exists..."
if ! gcloud artifacts repositories describe virtual-gym-buddy --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create virtual-gym-buddy \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Virtual Gym Buddy container repository" \
    --project="${PROJECT_ID}"
fi

# -----------------------------------------------------------------------------
# 4. Secret Manager: Store GEMINI_API_KEY
# -----------------------------------------------------------------------------
echo "--> Ensuring GEMINI_API_KEY secret exists in Secret Manager..."
if ! gcloud secrets describe GEMINI_API_KEY --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo -n "${GEMINI_API_KEY}" | gcloud secrets create GEMINI_API_KEY \
    --data-file=- \
    --replication-policy="automatic" \
    --project="${PROJECT_ID}"
else
  echo -n "${GEMINI_API_KEY}" | gcloud secrets versions add GEMINI_API_KEY \
    --data-file=- \
    --project="${PROJECT_ID}"
fi

# -----------------------------------------------------------------------------
# 5. Service Account & Least-Privilege IAM Bindings
# -----------------------------------------------------------------------------
echo "--> Ensuring runtime service account exists..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create virtual-gym-buddy-runner \
    --display-name="Virtual Gym Buddy Cloud Run Runner" \
    --project="${PROJECT_ID}"
fi

echo "--> Granting Secret Manager Accessor role on GEMINI_API_KEY..."
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}"

# -----------------------------------------------------------------------------
# 6. Build Container via Google Cloud Build (or Local Docker)
# -----------------------------------------------------------------------------
echo "--> Building container image with public client build arguments..."
gcloud builds submit \
  --tag="${IMAGE_TAG}" \
  --substitutions=\
_VITE_API_KEY="${VITE_FIREBASE_API_KEY}",\
_VITE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN}",\
_VITE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID}",\
_VITE_APP_ID="${VITE_FIREBASE_APP_ID}" \
  --project="${PROJECT_ID}"

# -----------------------------------------------------------------------------
# 7. Deploy to Google Cloud Run
# -----------------------------------------------------------------------------
echo "--> Deploying service to Cloud Run..."
gcloud run deploy virtual-gym-buddy \
  --image="${IMAGE_TAG}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="${SERVICE_ACCOUNT}" \
  --port=8080 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=3 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars="NODE_ENV=production,TRUST_PROXY=true,FIREBASE_PROJECT_ID=${PROJECT_ID},ENABLE_HSTS=true" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --project="${PROJECT_ID}"

echo ""
echo "=== Deployment Succeeded! ==="
gcloud run services describe virtual-gym-buddy --region="${REGION}" --project="${PROJECT_ID}" --format='value(status.url)'
