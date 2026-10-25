import { z } from "zod";

// Coach personas enum
export const CoachIdSchema = z.enum(["marcus", "aria", "jax"]);

// 1. Chat Endpoint Schema
export const ChatMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  content: z.string().trim().min(1, "Message content cannot be empty").max(4000, "Message content exceeds limit")
});

export const UserContextSchema = z.object({
  streak: z.number().int().min(0).max(10000).optional(),
  goal: z.string().trim().max(200).optional(),
  waterMl: z.number().min(0).max(20000).optional(),
  todayWorkout: z.string().trim().max(200).optional(),
  mood: z.string().trim().max(100).optional()
}).strict();

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1, "At least one message is required").max(50, "Exceeded maximum message history limit"),
  buddyId: CoachIdSchema.optional().default("marcus"),
  userContext: UserContextSchema.optional()
}).strict();

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// 2. Journal Reflection Endpoint Schema
export const JournalRequestSchema = z.object({
  journalText: z.string().trim().min(1, "Journal text cannot be empty").max(5000, "Journal entry exceeds maximum length"),
  buddyId: CoachIdSchema.optional().default("marcus")
}).strict();

export type JournalRequest = z.infer<typeof JournalRequestSchema>;

// 3. Quick AI Workout Generator Schema
export const WorkoutGenerateRequestSchema = z.object({
  target: z.string().trim().min(1).max(100).optional().default("Full Body"),
  durationMinutes: z.coerce.number().int().min(5, "Workout duration must be at least 5 minutes").max(180, "Workout duration cannot exceed 180 minutes").optional().default(20),
  equipment: z.string().trim().max(100).optional().default("Bodyweight"),
  fitnessLevel: z.string().trim().max(100).optional().default("Intermediate"),
  buddyId: CoachIdSchema.optional().default("marcus")
}).strict();

export type WorkoutGenerateRequest = z.infer<typeof WorkoutGenerateRequestSchema>;

// 4. Structured Full Day Diet & Grocery Planner Schema
export const DietPlanGenerateRequestSchema = z.object({
  userGoal: z.string().trim().max(100).optional().default("Muscle Gain"),
  dietaryPreference: z.string().trim().max(100).optional().default("High Protein"),
  weightKg: z.coerce.number().min(20, "Weight must be at least 20 kg").max(400, "Weight exceeds valid range").optional().default(70),
  heightCm: z.coerce.number().min(50, "Height must be at least 50 cm").max(300, "Height exceeds valid range").optional().default(175),
  bmi: z.coerce.number().min(10, "BMI must be at least 10").max(100, "BMI exceeds valid range").optional().default(22.8),
  buddyId: CoachIdSchema.optional().default("marcus")
}).strict();

export type DietPlanGenerateRequest = z.infer<typeof DietPlanGenerateRequestSchema>;

// 5. Remaining Calories Meal Plan Schema
export const RemainingMealsRequestSchema = z.object({
  userGoal: z.string().trim().max(100).optional().default("Stay active and healthy"),
  remainingCalories: z.coerce.number().min(-1000, "Calories out of range").max(10000, "Calories out of range").optional().default(650),
  weightKg: z.coerce.number().min(20).max(400).optional().default(70),
  heightCm: z.coerce.number().min(50).max(300).optional().default(175),
  dietaryPreference: z.string().trim().max(100).optional().default("Balanced/No limits"),
  buddyId: CoachIdSchema.optional().default("marcus")
}).strict();

export type RemainingMealsRequest = z.infer<typeof RemainingMealsRequestSchema>;
