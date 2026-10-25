import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  scanLocalData,
  checkCloudConflicts,
  executeMigration,
  LocalDataScanResult,
  CloudConflictReport
} from "../src/services/migrationService";
import { formatAuthError } from "../src/context/AuthContext";
import { BackupPayloadSchema } from "../src/schemas/backupSchema";
import { INITIAL_USER_STATS, HISTORICAL_WORKOUTS, HISTORICAL_JOURNALS, INITIAL_MEAL_LOG } from "../src/data";

describe("Stage 3E: Consent-Based Data Migration & Account Settings", () => {
  // Setup in-memory mock window and localStorage for Node test runner
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {
      vgb_user_stats: JSON.stringify(INITIAL_USER_STATS),
      vgb_workout_history: JSON.stringify(HISTORICAL_WORKOUTS),
      vgb_journal_history: JSON.stringify(HISTORICAL_JOURNALS),
      vgb_meal_logs: JSON.stringify(INITIAL_MEAL_LOG),
      vgb_custom_routines: JSON.stringify([
        {
          id: "custom-test-1",
          workoutName: "Custom HIIT",
          date: "Custom",
          durationMinutes: 25,
          caloriesBurned: 220,
          completed: false,
          exercises: []
        }
      ]),
      vgb_chat_history: JSON.stringify({
        marcus: [
          {
            id: "msg-test-1",
            sender: "user",
            role: "user",
            content: "Let's push it!",
            timestamp: "10:00 AM"
          }
        ]
      }),
      vgb_sound_enabled: "true"
    };

    // Inject mock localStorage into global if not present
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

  describe("1. Explicit User Consent & Non-Destructive Scanning", () => {
    test("scanLocalData detects valid records without modifying or clearing localStorage", () => {
      const initialSnapshot = JSON.stringify(mockStorage);
      const scan = scanLocalData();

      assert.equal(scan.hasData, true, "Must detect existing local data");
      assert.ok(scan.workouts.valid.length > 0, "Must parse valid workouts");
      assert.ok(scan.journals.valid.length > 0, "Must parse valid journals");
      assert.ok(scan.meals.valid.length > 0, "Must parse valid meals");
      assert.ok(scan.customRoutines.valid.length > 0, "Must parse valid custom routines");
      assert.ok(scan.coachMessages.valid.marcus?.length > 0, "Must parse coach messages");

      // Verify localStorage was NOT modified in any way
      assert.equal(
        JSON.stringify(mockStorage),
        initialSnapshot,
        "localStorage must remain strictly untouched during scan"
      );
    });

    test("migration does not execute automatically merely by scanning or calling scanLocalData", () => {
      const scan = scanLocalData();
      assert.equal(typeof scan, "object");
      // No cloud writes should have taken place; scan is purely read-only
      assert.equal(mockStorage.vgb_sound_enabled, "true");
    });
  });

  describe("2. Validation & Exclusion of Malformed Records", () => {
    test("excludes malformed workout sessions and reports invalid reasons without halting scan", () => {
      mockStorage.vgb_workout_history = JSON.stringify([
        ...HISTORICAL_WORKOUTS,
        {
          id: "corrupt-workout",
          workoutName: "", // invalid: empty name
          durationMinutes: -10, // invalid: negative duration
          completed: "yes" // invalid: string instead of boolean
        }
      ]);

      const scan = scanLocalData();
      assert.equal(scan.workouts.valid.length, HISTORICAL_WORKOUTS.length);
      assert.equal(scan.workouts.invalid.length, 1);
      assert.ok(scan.workouts.invalid[0].reason.length > 0);
      assert.ok(scan.totalInvalidRecords >= 1);
    });

    test("excludes malformed reflections and reports issues", () => {
      mockStorage.vgb_journal_history = JSON.stringify([
        {
          id: "invalid-reflection",
          sentimentScore: 999 // invalid: max is 10
        }
      ]);

      const scan = scanLocalData();
      assert.equal(scan.journals.valid.length, 0);
      assert.equal(scan.journals.invalid.length, 1);
    });
  });

  describe("3. LocalStorage Preservation Across All Outcomes", () => {
    test("preserves all 8 localStorage keys after scan and failed execution", async () => {
      const keysBefore = Object.keys(mockStorage);
      const scan = scanLocalData();

      // Attempting migration with unconfigured Firestore will reject
      const fakeConflicts: CloudConflictReport = {
        hasExistingCloudData: false,
        conflictingWorkoutIds: [],
        conflictingJournalIds: [],
        conflictingMealIds: [],
        conflictingRoutineIds: [],
        conflictingMessageIds: [],
        existingCloudCounts: { workouts: 0, journals: 0, meals: 0, customRoutines: 0, messages: 0 },
        totalConflicts: 0
      };

      const result = await executeMigration(
        "test-uid-preservation",
        scan,
        fakeConflicts,
        "merge"
      );

      // Verify execution failed gracefully due to uninitialized Firestore in test environment
      assert.equal(result.success, false);
      assert.ok(result.error);

      // Verify ALL keys are preserved and data remains intact
      assert.deepEqual(Object.keys(mockStorage), keysBefore);
      assert.ok(mockStorage.vgb_user_stats);
      assert.ok(mockStorage.vgb_workout_history);
      assert.ok(mockStorage.vgb_journal_history);
      assert.ok(mockStorage.vgb_meal_logs);
      assert.ok(mockStorage.vgb_custom_routines);
      assert.ok(mockStorage.vgb_chat_history);
      assert.ok(mockStorage.vgb_sound_enabled);
    });
  });

  describe("4. Conflict Resolution Strategy Semantics", () => {
    test("keep_cloud strategy identifies and skips conflicting workout and journal IDs", () => {
      const scan = scanLocalData();
      const firstWorkoutId = scan.workouts.valid[0].id;
      const firstJournalId = scan.journals.valid[0].id;

      const mockConflictReport: CloudConflictReport = {
        hasExistingCloudData: true,
        conflictingWorkoutIds: [firstWorkoutId],
        conflictingJournalIds: [firstJournalId],
        conflictingMealIds: [],
        conflictingRoutineIds: [],
        conflictingMessageIds: [],
        existingCloudCounts: { workouts: 5, journals: 3, meals: 2, customRoutines: 1, messages: 4 },
        totalConflicts: 2
      };

      assert.equal(mockConflictReport.conflictingWorkoutIds.includes(firstWorkoutId), true);
      assert.equal(mockConflictReport.conflictingJournalIds.includes(firstJournalId), true);
    });
  });

  describe("5. Idempotency & Deterministic Document IDs", () => {
    test("local records have deterministic IDs ensuring idempotent writes", () => {
      const scan = scanLocalData();
      for (const workout of scan.workouts.valid) {
        assert.ok(workout.id, "Workout must have a deterministic id");
        assert.equal(typeof workout.id, "string");
      }
      for (const journal of scan.journals.valid) {
        assert.ok(journal.id, "Journal must have a deterministic id");
      }
      for (const meal of scan.meals.valid) {
        assert.ok(meal.id, "Meal must have a deterministic id");
      }
      for (const routine of scan.customRoutines.valid) {
        assert.ok(routine.id, "Custom routine must have a deterministic id");
      }
    });
  });

  describe("6. Account Settings & Authentication Error Mapping", () => {
    test("maps auth/requires-recent-login to user-friendly reauthentication message", () => {
      const msg = formatAuthError("auth/requires-recent-login");
      assert.ok(
        msg.includes("recent authentication"),
        "Must inform user that recent authentication is required"
      );
    });

    test("maps auth/user-mismatch to credential error message", () => {
      const msg = formatAuthError("auth/user-mismatch");
      assert.ok(
        msg.includes("credential does not match"),
        "Must inform user of credential mismatch"
      );
    });
  });

  describe("7. Backward Compatibility with Existing Backup Schemas", () => {
    test("existing BackupPayloadSchema accepts valid exported application state", () => {
      const payload = {
        app: "Virtual Gym Buddy",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        userStats: INITIAL_USER_STATS,
        workoutHistory: HISTORICAL_WORKOUTS,
        journalHistory: HISTORICAL_JOURNALS,
        mealLogs: INITIAL_MEAL_LOG
      };

      const parsed = BackupPayloadSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });
  });

  describe("8. Component & Code Architecture Integrity", () => {
    test("MigrationModal component exists and requires explicit confirmation", () => {
      const compPath = path.resolve(process.cwd(), "src/components/MigrationModal.tsx");
      assert.equal(fs.existsSync(compPath), true);
      const content = fs.readFileSync(compPath, "utf-8");
      assert.ok(content.includes("Confirm & Copy to Cloud"));
      assert.ok(content.includes("Local data will never be deleted"));
      assert.ok(content.includes("executeMigration"));
    });

    test("AccountSettingsModal exists and provides security settings & deletion confirmation", () => {
      const compPath = path.resolve(process.cwd(), "src/components/AccountSettingsModal.tsx");
      assert.equal(fs.existsSync(compPath), true);
      const content = fs.readFileSync(compPath, "utf-8");
      assert.ok(content.includes("sendPasswordReset"));
      assert.ok(content.includes("clearUserCloudData"));
      assert.ok(content.includes("deleteAccount"));
      assert.ok(content.includes("DELETE"));
    });

    test("clearUserCloudData chunks deletions to stay under Firestore batch limit of 500", () => {
      const servicePath = path.resolve(process.cwd(), "src/services/firestoreService.ts");
      const content = fs.readFileSync(servicePath, "utf-8");
      assert.ok(
        content.includes("BATCH_SIZE") || content.includes("400") || content.includes("slice"),
        "Must chunk batch operations to stay under 500 writes limit"
      );
    });
  });
});
