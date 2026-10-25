# =============================================================================
# Virtual Gym Buddy — Cloud Run Deployment Helper Script (PowerShell)
# =============================================================================
# IMPORTANT: This script requires a configured Google Cloud account, billing,
# and explicit user approval before execution. Do NOT run with unverified credentials.
# =============================================================================

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$ProjectId,

  [Parameter(Mandatory=$false)]
  [string]$Region = "us-central1",

  [Parameter(Mandatory=$true)]
  [string]$GeminiApiKey,

  [Parameter(Mandatory=$true)]
  [string]$ViteFirebaseApiKey,

  [Parameter(Mandatory=$true)]
  [string]$ViteFirebaseAuthDomain,

  [Parameter(Mandatory=$true)]
  [string]$ViteFirebaseProjectId,

  [Parameter(Mandatory=$true)]
  [string]$ViteFirebaseAppId
)

$ErrorActionPreference = "Stop"

$ImageTag = "${Region}-docker.pkg.dev/${ProjectId}/virtual-gym-buddy/app:latest"
$ServiceAccount = "virtual-gym-buddy-runner@${ProjectId}.iam.gserviceaccount.com"

Write-Host "=== Virtual Gym Buddy Cloud Run Deployment ===" -ForegroundColor Cyan
Write-Host "Target Project ID : $ProjectId"
Write-Host "Target Region     : $Region"
Write-Host "Container Image   : $ImageTag"
Write-Host "Service Account   : $ServiceAccount"
Write-Host "=============================================="

# 1. Enable Required GCP APIs
Write-Host "--> Enabling required GCP APIs..." -ForegroundColor Yellow
gcloud services enable `
  run.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com `
  cloudbuild.googleapis.com `
  identitytoolkit.googleapis.com `
  firestore.googleapis.com `
  --project=$ProjectId

# 2. Ensure Artifact Registry repository exists
Write-Host "--> Ensuring Artifact Registry repository exists..." -ForegroundColor Yellow
$repoCheck = gcloud artifacts repositories describe virtual-gym-buddy --location=$Region --project=$ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
  gcloud artifacts repositories create virtual-gym-buddy `
    --repository-format=docker `
    --location=$Region `
    --description="Virtual Gym Buddy container repository" `
    --project=$ProjectId
}

# 3. Secret Manager: Store GEMINI_API_KEY
Write-Host "--> Ensuring GEMINI_API_KEY secret exists in Secret Manager..." -ForegroundColor Yellow
$secretCheck = gcloud secrets describe GEMINI_API_KEY --project=$ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
  [System.IO.File]::WriteAllText("$env:TEMP\gemini.key", $GeminiApiKey)
  gcloud secrets create GEMINI_API_KEY --data-file="$env:TEMP\gemini.key" --replication-policy="automatic" --project=$ProjectId
  Remove-Item "$env:TEMP\gemini.key" -Force
} else {
  [System.IO.File]::WriteAllText("$env:TEMP\gemini.key", $GeminiApiKey)
  gcloud secrets versions add GEMINI_API_KEY --data-file="$env:TEMP\gemini.key" --project=$ProjectId
  Remove-Item "$env:TEMP\gemini.key" -Force
}

# 4. Service Account & Least-Privilege IAM Bindings
Write-Host "--> Ensuring runtime service account exists..." -ForegroundColor Yellow
$saCheck = gcloud iam service-accounts describe $ServiceAccount --project=$ProjectId 2>&1
if ($LASTEXITCODE -ne 0) {
  gcloud iam service-accounts create virtual-gym-buddy-runner `
    --display-name="Virtual Gym Buddy Cloud Run Runner" `
    --project=$ProjectId
}

Write-Host "--> Granting Secret Manager Accessor role on GEMINI_API_KEY..." -ForegroundColor Yellow
gcloud secrets add-iam-policy-binding GEMINI_API_KEY `
  --member="serviceAccount:${ServiceAccount}" `
  --role="roles/secretmanager.secretAccessor" `
  --project=$ProjectId

# 5. Build Container via Google Cloud Build
Write-Host "--> Submitting container build to Cloud Build..." -ForegroundColor Yellow
gcloud builds submit `
  --tag=$ImageTag `
  --project=$ProjectId

# 6. Deploy to Google Cloud Run
Write-Host "--> Deploying service to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy virtual-gym-buddy `
  --image=$ImageTag `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --service-account=$ServiceAccount `
  --port=8080 `
  --concurrency=80 `
  --min-instances=0 `
  --max-instances=3 `
  --memory=512Mi `
  --cpu=1 `
  --set-env-vars="NODE_ENV=production,TRUST_PROXY=true,FIREBASE_PROJECT_ID=$ProjectId,ENABLE_HSTS=true" `
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" `
  --project=$ProjectId

Write-Host "`n=== Deployment Succeeded! ===" -ForegroundColor Green
gcloud run services describe virtual-gym-buddy --region=$Region --project=$ProjectId --format='value(status.url)'
