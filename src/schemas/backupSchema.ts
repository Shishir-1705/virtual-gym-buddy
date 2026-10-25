import { z } from "zod";

export const UserStatsBackupSchema = z.object({
  streak: z.number().int().min(0),
  totalWorkouts: z.number().int().min(0),
  totalCalories: z.number().min(0),
  weightKg: z.number().min(10).max(500),
  heightCm: z.number().min(30).max(350),
  waterTargetMl: z.number().min(0),
  waterLoggedMl: z.number().min(0),
  goal: z.string().max(300),
  targetCalories: z.number().min(0).max(20000),
  recentMood: z.string().max(100),
  selectedBuddyId: z.string().max(50)
});

export const ExerciseBackupSchema = z.object({
  name: z.string().min(1).max(200),
  repsOrTime: z.string().max(100),
  sets: z.number().int().min(1).max(50),
  rest: z.string().max(50),
  tip: z.string().max(500).optional(),
  completedSets: z.array(z.boolean()).optional()
});

export const WorkoutSessionBackupSchema = z.object({
  id: z.string().max(100),
  workoutName: z.string().min(1).max(200),
  date: z.string().max(100),
  durationMinutes: z.number().min(0).max(1440),
  caloriesBurned: z.number().min(0),
  exercises: z.array(ExerciseBackupSchema),
  completed: z.boolean(),
  buddyFeedback: z.string().max(3000).optional()
});

export const JournalEntryBackupSchema = z.object({
  id: z.string().max(100),
  date: z.string().max(100),
  entryText: z.string().max(10000),
  sentiment: z.string().max(100),
  sentimentScore: z.number().min(0).max(10),
  fatigueLevel: z.number().min(0).max(10),
  stressLevel: z.number().min(0).max(10),
  motivationLevel: z.number().min(0).max(10),
  feedback: z.string().max(3000)
});

export const MealLogBackupSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(200),
  calories: z.number().min(0).max(20000),
  proteinG: z.number().min(0).max(2000),
  carbsG: z.number().min(0).max(3000),
  fatG: z.number().min(0).max(2000),
  timestamp: z.string().max(50)
});

export const MessageBackupSchema = z.object({
  id: z.string().max(100),
  sender: z.enum(["user", "buddy"]),
  role: z.enum(["user", "model"]),
  content: z.string().max(10000),
  timestamp: z.string().max(50)
});

export const GymBuddyBackupSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  tagline: z.string(),
  description: z.string(),
  primaryColor: z.string(),
  accentColor: z.string(),
  borderColor: z.string(),
  avatarUrl: z.string(),
  gradient: z.string(),
  chatHeaderBg: z.string()
});

export const BackupPayloadSchema = z.object({
  app: z.string().optional(),
  version: z.string().optional(),
  exportedAt: z.string().optional(),
  userStats: UserStatsBackupSchema.optional(),
  workoutHistory: z.array(WorkoutSessionBackupSchema).optional(),
  journalHistory: z.array(JournalEntryBackupSchema).optional(),
  mealLogs: z.array(MealLogBackupSchema).optional(),
  gymBuddies: z.array(GymBuddyBackupSchema).optional(),
  customRoutines: z.array(WorkoutSessionBackupSchema).optional(),
  chatHistories: z.record(z.string(), z.array(MessageBackupSchema)).optional()
}).strict();

export type BackupPayload = z.infer<typeof BackupPayloadSchema>;
