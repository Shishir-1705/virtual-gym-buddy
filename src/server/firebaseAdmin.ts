import fs from "fs";
import { initializeApp, getApps, getApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  isGuest?: boolean;
}

// Ensure Firebase Admin is initialized once
let adminApp: App | null = null;

export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    adminApp = existingApps[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "demo-virtual-gym-buddy";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // 1. Support Render Secret Files or external file path credentials
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    try {
      const saJson = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      adminApp = initializeApp({
        credential: cert(saJson),
        projectId: saJson.project_id || projectId
      });
      return adminApp;
    } catch (err) {
      console.warn("Failed to load Firebase service account from file path:", serviceAccountPath, err);
    }
  }

  // 2. Support environment variable credentials (FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
  if (clientEmail && privateKey) {
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n")
      })
    });
  } else {
    // 3. Local Emulator or Application Default Credentials
    adminApp = initializeApp({
      projectId
    });
  }

  return adminApp;
}

// Token verifier hook for testing without live emulator or network calls
export type TokenVerifier = (token: string) => Promise<{ uid: string; email?: string }>;
let customTokenVerifier: TokenVerifier | null = null;

export function setCustomTokenVerifier(verifier: TokenVerifier | null) {
  customTokenVerifier = verifier;
}

export async function verifyIdToken(token: string): Promise<{ uid: string; email?: string }> {
  if (customTokenVerifier) {
    return customTokenVerifier(token);
  }
  const app = getFirebaseAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email
  };
}

// Optional Authentication Middleware
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  // 1. If no Authorization header is present, treat as Guest
  if (!authHeader) {
    req.user = undefined;
    req.isGuest = true;
    return next();
  }

  // 2. If Authorization header is present, validate Bearer format
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    return res.status(401).json({
      error: "Unauthorized: Malformed Authorization header. Expected 'Bearer <token>'"
    });
  }

  const idToken = match[1];

  try {
    const verified = await verifyIdToken(idToken);
    // Attach verified identity strictly from the verified token
    req.user = {
      uid: verified.uid,
      email: verified.email
    };
    req.isGuest = false;
    return next();
  } catch (err: any) {
    // Never fall back to guest if an invalid or expired token was supplied
    if (err.code === "auth/id-token-expired") {
      return res.status(401).json({
        error: "Unauthorized: Authentication token has expired"
      });
    }
    return res.status(401).json({
      error: "Unauthorized: Invalid authentication token"
    });
  }
}

// Configurable Dual Rate Limiters
export function getRateLimitConfig() {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);
  const guestMax = parseInt(process.env.RATE_LIMIT_GUEST_MAX || "10", 10);
  const authMax = parseInt(process.env.RATE_LIMIT_AUTH_MAX || "60", 10);

  return { windowMs, guestMax, authMax };
}

export function createDualRateLimiters(overrides?: {
  windowMs?: number;
  guestMax?: number;
  authMax?: number;
}) {
  const defaults = getRateLimitConfig();
  const windowMs = overrides?.windowMs ?? defaults.windowMs;
  const guestMax = overrides?.guestMax ?? defaults.guestMax;
  const authMax = overrides?.authMax ?? defaults.authMax;

  const retrySeconds = Math.ceil(windowMs / 1000);

  // Guest Limiter: Keyed strictly by client IP using built-in standard helper
  const guestLimiter = rateLimit({
    windowMs,
    limit: guestMax,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: "Too many requests to AI endpoints. Guest rate limit exceeded, please sign in or wait a few minutes.",
      retryAfterSeconds: retrySeconds
    },
    // Skip if request has a verified UID attached
    skip: (req) => Boolean((req as AuthenticatedRequest).user?.uid)
  });

  // Authenticated Limiter: Keyed strictly by verified Firebase UID
  const authLimiter = rateLimit({
    windowMs,
    limit: authMax,
    keyGenerator: (req) => `uid:${(req as AuthenticatedRequest).user?.uid}`,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error: "Too many requests to AI endpoints. Authenticated rate limit exceeded, please wait a few minutes.",
      retryAfterSeconds: retrySeconds
    },
    // Skip if request is unauthenticated / guest
    skip: (req) => !(req as AuthenticatedRequest).user?.uid
  });

  return { guestLimiter, authLimiter };
}
