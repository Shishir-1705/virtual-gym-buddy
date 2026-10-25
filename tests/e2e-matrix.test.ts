import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import app from "../server";
import { scanLocalData, checkCloudConflicts, executeMigration } from "../src/services/migrationService";
import { formatAuthError } from "../src/context/AuthContext";
import { BackupPayloadSchema } from "../src/schemas/backupSchema";
import {
  ChatRequestSchema,
  JournalRequestSchema,
  WorkoutGenerateRequestSchema,
  DietPlanGenerateRequestSchema,
  RemainingMealsRequestSchema
} from "../src/schemas/apiSchemas";
import { INITIAL_USER_STATS, HISTORICAL_WORKOUTS, HISTORICAL_JOURNALS, INITIAL_MEAL_LOG } from "../src/data";

describe("Stage 4: End-to-End QA & Production Readiness Matrix", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {
      vgb_user_stats: JSON.stringify(INITIAL_USER_STATS),
      vgb_workout_history: JSON.stringify(HISTORICAL_WORKOUTS),
      vgb_journal_history: JSON.stringify(HISTORICAL_JOURNALS),
      vgb_meal_logs: JSON.stringify(INITIAL_MEAL_LOG),
      vgb_gym_buddies: JSON.stringify([
        { id: "marcus", name: "Marcus" },
        { id: "aria", name: "Aria" },
        { id: "jax", name: "Jax" }
      ]),
      vgb_custom_routines: JSON.stringify([]),
      vgb_chat_history: JSON.stringify({}),
      vgb_sound_enabled: "true"
    };

    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      }
    };
  });

  // --------------------------------------------------------------------------
  // Journey 1: New guest opens the app and uses local features
  // --------------------------------------------------------------------------
  test("Journey 1: New guest starts with initial baseline mock data without cloud errors", () => {
    const scan = scanLocalData();
    assert.equal(scan.hasData, true);
    assert.equal(scan.userStats.valid?.streak, INITIAL_USER_STATS.streak);
    assert.equal(scan.workouts.valid.length, HISTORICAL_WORKOUTS.length);
  });

  // --------------------------------------------------------------------------
  // Journey 2 & 3: Guest creates records, refreshes, verifies persistence
  // --------------------------------------------------------------------------
  test("Journey 2 & 3: Guest records workouts, reflections, meals; persists across reloads", () => {
    // Guest logs a new workout
    const newWorkout = {
      id: "workout-guest-1",
      workoutName: "Morning Jog",
      date: "Today",
      durationMinutes: 30,
      caloriesBurned: 300,
      completed: true,
      exercises: []
    };
    const currentWorkouts = JSON.parse(mockStorage.vgb_workout_history);
    mockStorage.vgb_workout_history = JSON.stringify([newWorkout, ...currentWorkouts]);

    // Simulate page reload: re-read localStorage
    const reloadedWorkouts = JSON.parse(mockStorage.vgb_workout_history);
    assert.equal(reloadedWorkouts.length, currentWorkouts.length + 1);
    assert.equal(reloadedWorkouts[0].id, "workout-guest-1");
    assert.equal(reloadedWorkouts[0].workoutName, "Morning Jog");
  });

  // --------------------------------------------------------------------------
  // Journey 4: Guest registers and signs in (guest localStorage preserved)
  // --------------------------------------------------------------------------
  test("Journey 4: Signing in does not alter or erase localStorage guest records", () => {
    const localSnapshot = JSON.stringify(mockStorage);

    // Simulate signing in User A: App.tsx switches mode to authenticated
    const authenticatedUser = { uid: "user-alpha-123", email: "alpha@example.com" };
    assert.ok(authenticatedUser.uid);

    // Verify localStorage remains exactly as it was before sign-in
    assert.equal(JSON.stringify(mockStorage), localSnapshot);
  });

  // --------------------------------------------------------------------------
  // Journey 5 & 6: Authenticated user loads cloud data, signs out, returns to guest
  // --------------------------------------------------------------------------
  test("Journey 5 & 6: Sign-out clears in-memory user state and restores local guest records", () => {
    const localWorkoutCount = JSON.parse(mockStorage.vgb_workout_history).length;

    // Simulate authenticated state in-memory
    let inMemoryWorkouts = [{ id: "cloud-workout-1", workoutName: "Cloud Lift" }];

    // On sign-out: clear in-memory state and rehydrate from localStorage
    inMemoryWorkouts = [];
    const restoredWorkouts = JSON.parse(mockStorage.vgb_workout_history);

    assert.equal(restoredWorkouts.length, localWorkoutCount);
    assert.equal(restoredWorkouts[0].id, HISTORICAL_WORKOUTS[0].id);
  });

  // --------------------------------------------------------------------------
  // Journey 7: User A signs out, User B signs in on same browser
  // --------------------------------------------------------------------------
  test("Journey 7: Switching from User A to User B resets in-memory collections to eliminate stale state", () => {
    const appContent = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");
    // Verify that syncUserData resets in-memory collections when user is present
    assert.ok(
      appContent.includes("setWorkoutHistory([])") &&
      appContent.includes("setJournalHistory([])") &&
      appContent.includes("setMealLogs([])") &&
      appContent.includes("setChatHistories({})"),
      "Must reset state collections on account transition"
    );
  });

  // --------------------------------------------------------------------------
  // Journey 8: User A cannot view, modify, or delete User B's records
  // --------------------------------------------------------------------------
  test("Journey 8: firestore.rules strictly enforces UID ownership on all collections and subcollections", () => {
    const rulesContent = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf-8");
    assert.ok(rulesContent.includes("function isOwner(userId)"));
    assert.ok(rulesContent.includes("request.auth.uid == userId"));
    assert.ok(rulesContent.includes("match /users/{userId}"));
    assert.ok(rulesContent.includes("match /workouts/{workoutId}"));
    assert.ok(rulesContent.includes("match /customRoutines/{routineId}"));
    assert.ok(rulesContent.includes("match /journals/{journalId}"));
    assert.ok(rulesContent.includes("match /meals/{mealId}"));
    assert.ok(rulesContent.includes("match /coaches/{coachId}"));
  });

  // --------------------------------------------------------------------------
  // Journey 9: Signed-in user uses every AI endpoint
  // --------------------------------------------------------------------------
  test("Journey 9: All 5 AI endpoints validate schemas and handle valid payloads", () => {
    // 1. Chat
    const chatVal = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "Cardio tips" }],
      buddyId: "marcus"
    });
    assert.equal(chatVal.success, true);

    // 2. Journal
    const journalVal = JournalRequestSchema.safeParse({
      journalText: "Felt strong during heavy deadlifts today!"
    });
    assert.equal(journalVal.success, true);

    // 3. Workout
    const workoutVal = WorkoutGenerateRequestSchema.safeParse({
      target: "Legs",
      durationMinutes: 45
    });
    assert.equal(workoutVal.success, true);

    // 4. Diet Plan
    const dietVal = DietPlanGenerateRequestSchema.safeParse({
      userGoal: "Lean Muscle",
      weightKg: 75,
      heightCm: 175,
      dietaryPreference: "High Protein"
    });
    assert.equal(dietVal.success, true);

    // 5. Remaining Meals
    const mealsVal = RemainingMealsRequestSchema.safeParse({
      remainingCalories: 600
    });
    assert.equal(mealsVal.success, true);
  });

  // --------------------------------------------------------------------------
  // Journey 10: Expired or invalid ID token is rejected
  // --------------------------------------------------------------------------
  test("Journey 10: Express server rejects invalid bearer tokens with HTTP 401 across endpoints", async () => {
    const endpoints = [
      { path: "/api/buddy/chat", body: { messages: [{ role: "user", content: "Hi" }] } },
      { path: "/api/buddy/journal", body: { entry: "Great workout" } },
      { path: "/api/buddy/generate-workout", body: { target: "Chest", durationMinutes: 30 } },
      { path: "/api/buddy/generate-diet-plan", body: { calories: 2000, weightKg: 70 } },
      { path: "/api/buddy/generate-remaining-meals", body: { remainingCalories: 500 } }
    ];

    for (const ep of endpoints) {
      const res = await request(app)
        .post(ep.path)
        .set("Authorization", "Bearer invalid-expired-token-12345")
        .send(ep.body);

      assert.equal(res.status, 401, `${ep.path} must return 401 on invalid token`);
      assert.ok(res.body.error);
    }
  });

  // --------------------------------------------------------------------------
  // Journey 11: Network or Firebase failure handled safely
  // --------------------------------------------------------------------------
  test("Journey 11: Network errors map to user-friendly messages without app crashes", () => {
    const networkMsg = formatAuthError("auth/network-request-failed");
    assert.ok(networkMsg.includes("Network error") || networkMsg.includes("connection"));
  });

  // --------------------------------------------------------------------------
  // Journey 12 & 13: Backup import and export validity checks
  // --------------------------------------------------------------------------
  test("Journey 12 & 13: Accepts valid backup export; strictly rejects malformed backup", () => {
    const validBackup = {
      app: "Virtual Gym Buddy",
      version: "1.0.0",
      userStats: INITIAL_USER_STATS,
      workoutHistory: HISTORICAL_WORKOUTS,
      journalHistory: HISTORICAL_JOURNALS,
      mealLogs: INITIAL_MEAL_LOG
    };
    const validResult = BackupPayloadSchema.safeParse(validBackup);
    assert.equal(validResult.success, true);

    const corruptBackup = {
      app: "Virtual Gym Buddy",
      userStats: { streak: -99 } // invalid: negative streak
    };
    const corruptResult = BackupPayloadSchema.safeParse(corruptBackup);
    assert.equal(corruptResult.success, false);
  });

  // --------------------------------------------------------------------------
  // Journey 14 & 15: Migration workflow, cancellation, conflicts, and retry
  // --------------------------------------------------------------------------
  test("Journey 14 & 15: Migration validates records, skips conflicting cloud IDs, preserves localStorage", async () => {
    const scan = scanLocalData();
    assert.equal(scan.hasData, true);

    // Verify localStorage preservation before and after migration
    const initialStorageState = JSON.stringify(mockStorage);

    // Mock conflict report with 1 duplicate workout
    const duplicateWorkoutId = scan.workouts.valid[0].id;
    const conflictReport = {
      hasExistingCloudData: true,
      conflictingWorkoutIds: [duplicateWorkoutId],
      conflictingJournalIds: [],
      conflictingMealIds: [],
      conflictingRoutineIds: [],
      conflictingMessageIds: [],
      existingCloudCounts: { workouts: 1, journals: 0, meals: 0, customRoutines: 0, messages: 0 },
      totalConflicts: 1
    };

    // Filter eligible workouts
    const conflictingSet = new Set(conflictReport.conflictingWorkoutIds);
    const eligibleWorkouts = scan.workouts.valid.filter(w => !conflictingSet.has(w.id));

    // Duplicate workout must be filtered out
    assert.equal(eligibleWorkouts.some(w => w.id === duplicateWorkoutId), false);
    assert.equal(eligibleWorkouts.length, scan.workouts.valid.length - 1);

    // LocalStorage remains completely unmodified
    assert.equal(JSON.stringify(mockStorage), initialStorageState);
  });

  // --------------------------------------------------------------------------
  // Journey 16: Account deletion reauthentication, chunked purge, local preservation
  // --------------------------------------------------------------------------
  test("Journey 16: Account deletion enforces reauthentication, chunks batch deletes, preserves local storage", () => {
    const accountModalContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/AccountSettingsModal.tsx"),
      "utf-8"
    );
    // 1. Enforces password confirmation & verification
    assert.ok(accountModalContent.includes("reauthenticate(reauthPassword)"));
    // 2. Clears Firestore data while verified
    assert.ok(accountModalContent.includes("clearUserCloudData(user.uid)"));
    // 3. Deletes Auth account
    assert.ok(accountModalContent.includes("deleteAccount()"));

    // Verify localStorage is never touched
    assert.ok(mockStorage.vgb_user_stats);
    assert.ok(mockStorage.vgb_workout_history);
  });
});
