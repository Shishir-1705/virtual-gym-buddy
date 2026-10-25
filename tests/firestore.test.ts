import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("Firestore Persistence & Per-User Data Isolation", () => {
  describe("Firestore Security Rules (firestore.rules)", () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");

    test("firestore.rules exists at project root", () => {
      assert.equal(fs.existsSync(rulesPath), true, "firestore.rules must exist at project root");
    });

    test("enforces version 2 rules and default deny", () => {
      const content = fs.readFileSync(rulesPath, "utf-8");
      assert.ok(content.includes("rules_version = '2';"), "Must declare rules_version = '2'");
      assert.ok(content.includes("allow read, write: if false;"), "Must declare default-deny fallback rule");
    });

    test("enforces isOwner helper checking request.auth.uid == userId", () => {
      const content = fs.readFileSync(rulesPath, "utf-8");
      assert.ok(
        content.includes("function isOwner(userId)") || content.includes("request.auth.uid == userId"),
        "Must verify authentication and match UID"
      );
      assert.ok(
        content.includes("request.auth != null"),
        "Must require non-null request.auth"
      );
    });

    test("protects user profile root document (/users/{userId})", () => {
      const content = fs.readFileSync(rulesPath, "utf-8");
      assert.ok(content.includes("match /users/{userId}"), "Must define match rule for /users/{userId}");
      assert.ok(content.includes("allow read, write: if isOwner(userId)"), "Must restrict root user profile to owner");
    });

    test("protects all 5 subcollections under /users/{userId}", () => {
      const content = fs.readFileSync(rulesPath, "utf-8");
      const requiredSubcollections = [
        "workouts",
        "customRoutines",
        "journals",
        "meals",
        "coaches/{coachId}/messages"
      ];
      for (const subcol of requiredSubcollections) {
        assert.ok(
          content.includes(subcol),
          `firestore.rules must specify access rules for subcollection: ${subcol}`
        );
      }
    });
  });

  describe("Emulator Configuration (firebase.json)", () => {
    const configPath = path.resolve(process.cwd(), "firebase.json");

    test("firebase.json exists and configures emulators", () => {
      assert.equal(fs.existsSync(configPath), true, "firebase.json must exist at project root");
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      assert.ok(config.emulators, "Must define emulators object in firebase.json");
      assert.equal(config.emulators.firestore?.port, 8080, "Firestore emulator must be on port 8080");
      assert.equal(config.emulators.auth?.port, 9099, "Auth emulator must be on port 9099");
      assert.equal(config.firestore?.rules, "firestore.rules", "Must point to firestore.rules");
    });
  });

  describe("Firestore Service & Data Mapping Contracts", () => {
    test("firestoreService module exports all required CRUD and reset functions", async () => {
      const service = await import("../src/services/firestoreService");

      assert.equal(typeof service.getUserProfile, "function");
      assert.equal(typeof service.saveUserProfile, "function");
      assert.equal(typeof service.getUserWorkouts, "function");
      assert.equal(typeof service.addWorkout, "function");
      assert.equal(typeof service.deleteWorkout, "function");
      assert.equal(typeof service.getUserCustomRoutines, "function");
      assert.equal(typeof service.saveCustomRoutine, "function");
      assert.equal(typeof service.deleteCustomRoutine, "function");
      assert.equal(typeof service.getUserJournals, "function");
      assert.equal(typeof service.addJournal, "function");
      assert.equal(typeof service.deleteJournal, "function");
      assert.equal(typeof service.getUserMeals, "function");
      assert.equal(typeof service.addMeal, "function");
      assert.equal(typeof service.deleteMeal, "function");
      assert.equal(typeof service.getCoachMessages, "function");
      assert.equal(typeof service.saveCoachMessage, "function");
      assert.equal(typeof service.clearUserCloudData, "function");
    });

    test("throws descriptive error when Firestore is accessed without initialization", async () => {
      const service = await import("../src/services/firestoreService");
      // In testing environment without Firebase client config, assertDb throws
      await assert.rejects(
        async () => {
          await service.getUserProfile("test-uid-uninitialized");
        },
        {
          name: "Error",
          message: /Firestore is not initialized/
        }
      );
    });
  });

  describe("Guest Mode & Local Storage Isolation Guarantees", () => {
    test("preserves all 8 standard localStorage keys", () => {
      const expectedKeys = [
        "vgb_user_stats",
        "vgb_workout_history",
        "vgb_journal_history",
        "vgb_meal_logs",
        "vgb_gym_buddies",
        "vgb_chat_history",
        "vgb_custom_routines",
        "vgb_sound_enabled"
      ];

      const appContent = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");

      for (const key of expectedKeys) {
        assert.ok(
          appContent.includes(`"${key}"`),
          `App.tsx must continue to support and preserve key: ${key}`
        );
      }
    });

    test("guards all localStorage.setItem sync effects with if (!user)", () => {
      const appContent = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");

      // Verify that localStorage writes in App.tsx are strictly guarded for guest mode
      const guestGuardPattern = /if \(!user\) \{\s*localStorage\.setItem/g;
      const matches = appContent.match(guestGuardPattern);
      assert.ok(matches && matches.length >= 6, "Must guard state sync to localStorage with if (!user)");
    });
  });

  describe("Component Token Attachment Integrity", () => {
    test("GymBuddyChat attaches Bearer token when authenticated", () => {
      const chatContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/GymBuddyChat.tsx"), "utf-8");
      assert.ok(chatContent.includes("user.getIdToken()"), "GymBuddyChat must retrieve ID token");
      assert.ok(chatContent.includes("Bearer ${idToken}"), "GymBuddyChat must set Authorization Bearer header");
    });

    test("JournalLogger attaches Bearer token when authenticated", () => {
      const journalContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/JournalLogger.tsx"), "utf-8");
      assert.ok(journalContent.includes("user.getIdToken()"), "JournalLogger must retrieve ID token");
      assert.ok(journalContent.includes("Bearer ${idToken}"), "JournalLogger must set Authorization Bearer header");
    });

    test("WorkoutTracker attaches Bearer token when authenticated", () => {
      const workoutContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/WorkoutTracker.tsx"), "utf-8");
      assert.ok(workoutContent.includes("user.getIdToken()"), "WorkoutTracker must retrieve ID token");
      assert.ok(workoutContent.includes("Bearer ${idToken}"), "WorkoutTracker must set Authorization Bearer header");
    });

    test("DietPlanner attaches Bearer token on all AI requests when authenticated", () => {
      const dietContent = fs.readFileSync(path.resolve(process.cwd(), "src/components/DietPlanner.tsx"), "utf-8");
      assert.ok(dietContent.includes("user.getIdToken()"), "DietPlanner must retrieve ID token");
      assert.ok(dietContent.includes("Bearer ${idToken}"), "DietPlanner must set Authorization Bearer header");
    });
  });

  describe("Frontend Bundle Security (No admin SDK leakage)", () => {
    test("src/lib/firebase.ts imports only client SDK, never firebase-admin", () => {
      const fbClientContent = fs.readFileSync(path.resolve(process.cwd(), "src/lib/firebase.ts"), "utf-8");
      assert.equal(fbClientContent.includes("firebase-admin"), false, "Must never import firebase-admin in client code");
    });

    test("src/services/firestoreService.ts imports only client SDK, never firebase-admin", () => {
      const serviceContent = fs.readFileSync(path.resolve(process.cwd(), "src/services/firestoreService.ts"), "utf-8");
      assert.equal(serviceContent.includes("firebase-admin"), false, "Must never import firebase-admin in client services");
    });
  });
});
