export interface GymBuddy {
  id: string;
  name: string;
  role: string;
  tagline: string;
  description: string;
  primaryColor: string; // Tailwind class e.g., 'bg-amber-500' / 'text-amber-500'
  accentColor: string; // e.g., 'amber'
  borderColor: string; // Tailwind class e.g., 'border-amber-500'
  avatarUrl: string;
  gradient: string; // e.g. 'from-amber-500 to-orange-600'
  chatHeaderBg: string; // e.g. 'bg-amber-950/40'
}

export interface Message {
  id: string;
  sender: "user" | "buddy";
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export interface Exercise {
  name: string;
  repsOrTime: string;
  sets: number;
  rest: string;
  tip?: string;
  completedSets?: boolean[]; // Track sets completed dynamically
}

export interface WorkoutSession {
  id: string;
  workoutName: string;
  date: string;
  durationMinutes: number;
  caloriesBurned: number;
  exercises: Exercise[];
  completed: boolean;
  buddyFeedback?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  entryText: string;
  sentiment: string;
  sentimentScore: number; // 1 to 10
  fatigueLevel: number; // 1 to 10
  stressLevel: number; // 1 to 10
  motivationLevel: number; // 1 to 10
  feedback: string;
}

export interface MealLog {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  timestamp: string;
}

export interface UserStats {
  streak: number;
  totalWorkouts: number;
  totalCalories: number;
  weightKg: number;
  heightCm: number;
  waterTargetMl: number;
  waterLoggedMl: number;
  goal: string;
  targetCalories: number;
  recentMood: string;
  selectedBuddyId: string;
}
