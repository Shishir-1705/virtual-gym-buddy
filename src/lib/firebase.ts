import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

// Public Firebase Web Client Configuration via Vite environment variables
const metaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;

const apiKey = metaEnv?.VITE_FIREBASE_API_KEY;
const authDomain = metaEnv?.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = metaEnv?.VITE_FIREBASE_PROJECT_ID;
const appId = metaEnv?.VITE_FIREBASE_APP_ID;

export const isFirebaseConfigured = Boolean(apiKey && projectId && appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp({
      apiKey,
      authDomain,
      projectId,
      appId
    });
    auth = getAuth(app);
    db = getFirestore(app);

    // Explicit flag required to connect to Auth/Firestore Emulators in development
    const useEmulator = metaEnv?.VITE_USE_FIREBASE_EMULATOR === "true";
    const authEmulatorHost = metaEnv?.VITE_FIREBASE_AUTH_EMULATOR_HOST || "http://127.0.0.1:9099";
    const firestoreHost = metaEnv?.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || "127.0.0.1";
    const firestorePort = parseInt(metaEnv?.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || "8080", 10);

    // Guard against duplicate emulator attachment during Vite HMR reloads
    const globalContext: any = typeof window !== "undefined" ? window : globalThis;
    if (useEmulator && auth && !globalContext.__VGB_AUTH_EMULATOR_INITIALIZED__) {
      try {
        connectAuthEmulator(auth, authEmulatorHost, { disableWarnings: true });
        globalContext.__VGB_AUTH_EMULATOR_INITIALIZED__ = true;
        console.log(`[Firebase Auth] Connected to Auth Emulator at ${authEmulatorHost}`);
      } catch (emuErr) {
        console.warn("[Firebase Auth] Warning: could not connect to emulator:", emuErr);
      }
    }

    if (useEmulator && db && !globalContext.__VGB_FIRESTORE_EMULATOR_INITIALIZED__) {
      try {
        connectFirestoreEmulator(db, firestoreHost, firestorePort);
        globalContext.__VGB_FIRESTORE_EMULATOR_INITIALIZED__ = true;
        console.log(`[Firebase Firestore] Connected to Firestore Emulator at ${firestoreHost}:${firestorePort}`);
      } catch (fsErr) {
        console.warn("[Firebase Firestore] Warning: could not connect to emulator:", fsErr);
      }
    }
  } catch (err) {
    console.error("[Firebase Auth/Firestore] Failed to initialize Firebase client:", err);
    auth = null;
    app = null;
    db = null;
  }
} else {
  // Silent fallback to Guest Mode when configuration is omitted
  if (typeof window !== "undefined" && metaEnv?.DEV) {
    console.info("[Firebase Auth] No Firebase configuration found. Running in Guest Mode.");
  }
}

export { app, auth, db };
