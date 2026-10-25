import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ChatRequestSchema,
  JournalRequestSchema,
  WorkoutGenerateRequestSchema,
  DietPlanGenerateRequestSchema,
  RemainingMealsRequestSchema
} from "../src/schemas/apiSchemas";
import { BackupPayloadSchema } from "../src/schemas/backupSchema";

describe("API Request Schemas Validation", () => {
  describe("ChatRequestSchema", () => {
    test("accepts a valid chat request payload", () => {
      const validPayload = {
        messages: [
          { role: "user", content: "Hello coach Marcus!" }
        ],
        buddyId: "marcus",
        userContext: {
          streak: 5,
          goal: "Build Muscle",
          waterMl: 1500,
          todayWorkout: "Push Day",
          mood: "Motivated"
        }
      };

      const parsed = ChatRequestSchema.safeParse(validPayload);
      assert.equal(parsed.success, true);
    });

    test("applies default buddyId 'marcus' when buddyId is omitted", () => {
      const payload = {
        messages: [{ role: "user", content: "Need quick motivation" }]
      };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.buddyId, "marcus");
      }
    });

    test("rejects an empty messages array", () => {
      const payload = { messages: [] };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
      if (!parsed.success) {
        assert.ok(parsed.error.issues.some(i => i.message.includes("At least one message is required")));
      }
    });

    test("rejects empty or whitespace-only message content", () => {
      const payload = {
        messages: [{ role: "user", content: "   " }]
      };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    test("rejects message content that exceeds 4000 characters", () => {
      const payload = {
        messages: [{ role: "user", content: "a".repeat(4001) }]
      };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
      if (!parsed.success) {
        assert.ok(parsed.error.issues.some(i => i.message.includes("exceeds limit")));
      }
    });

    test("rejects unrecognized coach persona IDs", () => {
      const payload = {
        messages: [{ role: "user", content: "Hello" }],
        buddyId: "unauthorized_coach"
      };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    test("rejects unrecognized extraneous properties (strict schema)", () => {
      const payload = {
        messages: [{ role: "user", content: "Hello" }],
        maliciousField: "injection"
      };
      const parsed = ChatRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });
  });

  describe("JournalRequestSchema", () => {
    test("accepts valid journal entry", () => {
      const payload = {
        journalText: "Had a great chest workout, feel refreshed.",
        buddyId: "aria"
      };
      const parsed = JournalRequestSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test("rejects empty journal entry", () => {
      const payload = { journalText: "  " };
      const parsed = JournalRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });

    test("rejects oversized journal entry (> 5000 characters)", () => {
      const payload = { journalText: "x".repeat(5001) };
      const parsed = JournalRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });
  });

  describe("WorkoutGenerateRequestSchema", () => {
    test("accepts valid workout generation parameters and supplies defaults", () => {
      const payload = {};
      const parsed = WorkoutGenerateRequestSchema.safeParse(payload);
      assert.equal(parsed.success, true);
      if (parsed.success) {
        assert.equal(parsed.data.target, "Full Body");
        assert.equal(parsed.data.durationMinutes, 20);
        assert.equal(parsed.data.fitnessLevel, "Intermediate");
        assert.equal(parsed.data.buddyId, "marcus");
      }
    });

    test("rejects workout duration less than 5 minutes", () => {
      const payload = { durationMinutes: 2 };
      const parsed = WorkoutGenerateRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
      if (!parsed.success) {
        assert.ok(parsed.error.issues.some(i => i.message.includes("at least 5 minutes")));
      }
    });

    test("rejects workout duration greater than 180 minutes", () => {
      const payload = { durationMinutes: 240 };
      const parsed = WorkoutGenerateRequestSchema.safeParse(payload);
      assert.equal(parsed.success, false);
    });
  });

  describe("DietPlanGenerateRequestSchema", () => {
    test("accepts valid diet plan generation parameters", () => {
      const payload = {
        userGoal: "Muscle Gain",
        dietaryPreference: "High Protein",
        weightKg: 75,
        heightCm: 180,
        bmi: 23.1,
        buddyId: "jax"
      };
      const parsed = DietPlanGenerateRequestSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test("rejects impossible physiological numbers", () => {
      const payload1 = { weightKg: 10 }; // below 20 kg
      assert.equal(DietPlanGenerateRequestSchema.safeParse(payload1).success, false);

      const payload2 = { heightCm: 450 }; // above 300 cm
      assert.equal(DietPlanGenerateRequestSchema.safeParse(payload2).success, false);

      const payload3 = { bmi: 150 }; // above 100
      assert.equal(DietPlanGenerateRequestSchema.safeParse(payload3).success, false);
    });
  });

  describe("RemainingMealsRequestSchema", () => {
    test("accepts valid remaining calories meal request", () => {
      const payload = {
        remainingCalories: 550,
        userGoal: "Fat Loss",
        weightKg: 80,
        heightCm: 178,
        dietaryPreference: "Vegetarian",
        buddyId: "aria"
      };
      const parsed = RemainingMealsRequestSchema.safeParse(payload);
      assert.equal(parsed.success, true);
    });

    test("rejects out-of-range calories", () => {
      assert.equal(RemainingMealsRequestSchema.safeParse({ remainingCalories: -2000 }).success, false);
      assert.equal(RemainingMealsRequestSchema.safeParse({ remainingCalories: 25000 }).success, false);
    });
  });
});

describe("Backup Import Schema Validation", () => {
  test("accepts a comprehensive valid backup object", () => {
    const validBackup = {
      app: "VirtualGymBuddy",
      version: "1.0.0",
      exportedAt: "2026-10-25T11:00:00.000Z",
      userStats: {
        streak: 7,
        totalWorkouts: 12,
        totalCalories: 4500,
        weightKg: 72,
        heightCm: 175,
        waterTargetMl: 2500,
        waterLoggedMl: 1750,
        goal: "Muscle Gain",
        targetCalories: 2400,
        recentMood: "Energized",
        selectedBuddyId: "marcus"
      },
      workoutHistory: [
        {
          id: "w-1",
          workoutName: "Full Body Blast",
          date: "2026-10-24",
          durationMinutes: 45,
          caloriesBurned: 350,
          exercises: [
            {
              name: "Push Ups",
              repsOrTime: "12 reps",
              sets: 3,
              rest: "60s"
            }
          ],
          completed: true,
          buddyFeedback: "Great effort!"
        }
      ],
      journalHistory: [
        {
          id: "j-1",
          date: "2026-10-24",
          entryText: "Felt strong today",
          sentiment: "Positive",
          sentimentScore: 8,
          fatigueLevel: 3,
          stressLevel: 2,
          motivationLevel: 9,
          feedback: "Keep this momentum going"
        }
      ],
      mealLogs: [
        {
          id: "m-1",
          name: "Oatmeal and Protein Shake",
          calories: 450,
          proteinG: 35,
          carbsG: 50,
          fatG: 8,
          timestamp: "08:30 AM"
        }
      ],
      chatHistories: {
        marcus: [
          {
            id: "msg-1",
            sender: "user",
            role: "user",
            content: "Ready to work",
            timestamp: "09:00 AM"
          },
          {
            id: "msg-2",
            sender: "buddy",
            role: "model",
            content: "Let's crush it today!",
            timestamp: "09:01 AM"
          }
        ]
      }
    };

    const parsed = BackupPayloadSchema.safeParse(validBackup);
    assert.equal(parsed.success, true);
  });

  test("accepts minimal empty backup object", () => {
    const parsed = BackupPayloadSchema.safeParse({});
    assert.equal(parsed.success, true);
  });

  test("rejects invalid non-object payload", () => {
    assert.equal(BackupPayloadSchema.safeParse("not an object").success, false);
    assert.equal(BackupPayloadSchema.safeParse(null).success, false);
    assert.equal(BackupPayloadSchema.safeParse([1, 2, 3]).success, false);
  });

  test("rejects unknown malicious root fields (strict schema)", () => {
    const payload = {
      app: "VirtualGymBuddy",
      injectedCode: "<script>alert(1)</script>"
    };
    const parsed = BackupPayloadSchema.safeParse(payload);
    assert.equal(parsed.success, false);
  });

  test("rejects corrupt userStats with negative values", () => {
    const payload = {
      userStats: {
        streak: -5,
        totalWorkouts: 12,
        totalCalories: 4500,
        weightKg: 72,
        heightCm: 175,
        waterTargetMl: 2500,
        waterLoggedMl: 1750,
        goal: "Muscle Gain",
        targetCalories: 2400,
        recentMood: "Energized",
        selectedBuddyId: "marcus"
      }
    };
    const parsed = BackupPayloadSchema.safeParse(payload);
    assert.equal(parsed.success, false);
  });

  test("rejects corrupt message history with invalid roles", () => {
    const payload = {
      chatHistories: {
        marcus: [
          {
            id: "msg-1",
            sender: "invalid-sender",
            role: "hacker",
            content: "Exploit",
            timestamp: "12:00 PM"
          }
        ]
      }
    };
    const parsed = BackupPayloadSchema.safeParse(payload);
    assert.equal(parsed.success, false);
  });
});
