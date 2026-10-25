import { GymBuddy, UserStats, WorkoutSession, JournalEntry, MealLog } from "./types";

export const GYM_BUDDIES: GymBuddy[] = [
  {
    id: "marcus",
    name: "Marcus",
    role: "Elite Motivator & Trainer",
    tagline: "Unleash your inner beast! No excuses, just results.",
    description: "Marcus focuses on explosive energy, discipline, and pushing past physical limits. He brings unmatched enthusiasm, loud motivation, and structured, fast-paced plans to keep you burning calories.",
    primaryColor: "bg-amber-500",
    accentColor: "amber",
    borderColor: "border-amber-500",
    avatarUrl: "⚡",
    gradient: "from-amber-500 via-orange-500 to-red-600",
    chatHeaderBg: "bg-amber-950/40"
  },
  {
    id: "aria",
    name: "Aria",
    role: "Mindful Recovery & Form Coach",
    tagline: "Flow with strength, breathe through resistance.",
    description: "Aria blends athletic strength with yoga and holistic recovery principles. She prioritizes immaculate execution form, mindful breathing, recovery nutrition, and emotional/stress balance.",
    primaryColor: "bg-emerald-500",
    accentColor: "emerald",
    borderColor: "border-emerald-500",
    avatarUrl: "🌸",
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    chatHeaderBg: "bg-emerald-950/40"
  },
  {
    id: "jax",
    name: "Jax",
    role: "Scientific Bio-Hacker & Advisor",
    tagline: "Optimize performance through empirical precision.",
    description: "Jax views fitness as a physics and biological puzzle. He is obsessed with macronutrient ratios, hypertrophy biomechanics, glycogen management, VO2 max, and optimal resting thresholds.",
    primaryColor: "bg-violet-500",
    accentColor: "violet",
    borderColor: "border-violet-500",
    avatarUrl: "🧬",
    gradient: "from-violet-500 via-indigo-600 to-blue-700",
    chatHeaderBg: "bg-violet-950/40"
  }
];

export const INITIAL_USER_STATS: UserStats = {
  streak: 5,
  totalWorkouts: 14,
  totalCalories: 8400,
  weightKg: 78,
  heightCm: 180,
  waterTargetMl: 3000,
  waterLoggedMl: 1250,
  goal: "Build Strength & Stay Motivated",
  targetCalories: 2500,
  recentMood: "Energized",
  selectedBuddyId: "marcus"
};

export const WORKOUT_LIBRARY: WorkoutSession[] = [
  {
    id: "lib-1",
    workoutName: "Marcus' Beast Mode Full Body Blast",
    date: "Library",
    durationMinutes: 25,
    caloriesBurned: 380,
    completed: false,
    exercises: [
      { name: "Jumping Jacks (Warmup)", repsOrTime: "45 sec", sets: 1, rest: "15 sec", tip: "Get the heart rate climbing early!" },
      { name: "Dumbbell Goblet Squats", repsOrTime: "12 reps", sets: 3, rest: "30 sec", tip: "Keep chest proud, drive through heels." },
      { name: "Push-ups (Max effort)", repsOrTime: "As many as possible", sets: 3, rest: "45 sec", tip: "Exhale on push, squeeze chest at top." },
      { name: "Dumbbell Rows", repsOrTime: "10 reps each side", sets: 3, rest: "30 sec", tip: "Squeeze shoulder blade back." },
      { name: "Plank to Push-up transition", repsOrTime: "40 sec", sets: 2, rest: "30 sec", tip: "Keep hips level, core locked tight." }
    ]
  },
  {
    id: "lib-2",
    workoutName: "Aria's Mindful Core & Flow Yoga",
    date: "Library",
    durationMinutes: 30,
    caloriesBurned: 190,
    completed: false,
    exercises: [
      { name: "Sun Salutation A", repsOrTime: "5 rounds", sets: 1, rest: "None", tip: "Inhale to expand, exhale to fold." },
      { name: "Warrior II Hold", repsOrTime: "45 sec per side", sets: 2, rest: "15 sec", tip: "Keep shoulders stacked over hips, gaze forward." },
      { name: "Crow Pose Practice (or Plank)", repsOrTime: "30 sec", sets: 3, rest: "45 sec", tip: "Engage your core, lift with your center." },
      { name: "Cobra to Child's Pose Flow", repsOrTime: "8 flows", sets: 2, rest: "20 sec", tip: "Loosen any tension in the spine." },
      { name: "Savasana Integration", repsOrTime: "3 min", sets: 1, rest: "None", tip: "Let go of all muscle tension completely." }
    ]
  },
  {
    id: "lib-3",
    workoutName: "Jax's ATP-CP Hypertrophy Push Day",
    date: "Library",
    durationMinutes: 35,
    caloriesBurned: 290,
    completed: false,
    exercises: [
      { name: "Rotator Cuff Warmup", repsOrTime: "15 reps", sets: 2, rest: "20 sec", tip: "Low weight, maintain concentric tension." },
      { name: "Barbell Bench Press (Heavy)", repsOrTime: "6 reps", sets: 4, rest: "90 sec", tip: "Allows 90s for complete ATP restoration." },
      { name: "Incline Dumbbell Flyes", repsOrTime: "10 reps", sets: 3, rest: "60 sec", tip: "Emphasize loaded stretch at 15% muscle elongation." },
      { name: "Overhead Dumbbell Triceps Extension", repsOrTime: "12 reps", sets: 3, rest: "60 sec", tip: "Keep elbows tucked to isolate tricep long-head." },
      { name: "Cable Lateral Raises", repsOrTime: "12 reps", sets: 3, rest: "45 sec", tip: "Keep resistance profile matching lateral deltoid." }
    ]
  }
];

export const HISTORICAL_WORKOUTS: WorkoutSession[] = [
  {
    id: "hist-1",
    workoutName: "Quick Morning Cardio Burn",
    date: "June 24",
    durationMinutes: 20,
    caloriesBurned: 220,
    completed: true,
    exercises: [],
    buddyFeedback: "Marcus: Great morning effort! You turned up, pushed through the burn, and started the day like a champion!"
  },
  {
    id: "hist-2",
    workoutName: "Upper Body Strength focus",
    date: "June 22",
    durationMinutes: 40,
    caloriesBurned: 310,
    completed: true,
    exercises: [],
    buddyFeedback: "Jax: Good tension control on your rows. We loaded the latissimus with maximum mechanical tension. Recovery index calculated at 92%."
  },
  {
    id: "hist-3",
    workoutName: "Vinyasa Tension Release",
    date: "June 20",
    durationMinutes: 25,
    caloriesBurned: 140,
    completed: true,
    exercises: [],
    buddyFeedback: "Aria: Beautiful synchronization of movement and breath. Your heart rate variability reflects deep recovery."
  }
];

export const HISTORICAL_JOURNALS: JournalEntry[] = [
  {
    id: "j-1",
    date: "June 25",
    entryText: "Felt super tired after work but Marcus motivated me to do a quick 20 minute session. Honestly, I feel a million times better now. Got sweaty and cleared my mind.",
    sentiment: "Determined",
    sentimentScore: 8,
    fatigueLevel: 4,
    stressLevel: 3,
    motivationLevel: 9,
    feedback: "Marcus: Boom! That's exactly what I'm talking about, Champ! The mind wanted to skip, but the BEAST inside showed up. Be proud of that sweat today!"
  },
  {
    id: "j-2",
    date: "June 23",
    entryText: "Work is piling up. Having a hard time staying consistent because of late nights. Feeling really stressed and stiff.",
    sentiment: "Stressed",
    sentimentScore: 4,
    fatigueLevel: 7,
    stressLevel: 8,
    motivationLevel: 5,
    feedback: "Aria: Take a deep breath, dear. It is okay if you have high-stress days. Do not treat exercise as another item on your to-do list. Let's do a gentle flow to soothe your nervous system tonight."
  },
  {
    id: "j-3",
    date: "June 21",
    entryText: "Did a massive leg day. Nutrition is perfectly dialed in with high protein. Ready to crush my weekly volume goal.",
    sentiment: "Positive",
    sentimentScore: 9,
    fatigueLevel: 5,
    stressLevel: 2,
    motivationLevel: 10,
    feedback: "Jax: Excellent glycogen load today. Sarcoplasmic hydration seems high based on your performance scores. Keep targeting 2.0g of protein per kg of bodyweight."
  }
];

export const INITIAL_MEAL_LOG: MealLog[] = [
  {
    id: "m-1",
    name: "Oatmeal with Protein Powder & Banana",
    calories: 450,
    proteinG: 32,
    carbsG: 60,
    fatG: 8,
    timestamp: "08:15 AM"
  },
  {
    id: "m-2",
    name: "Grilled Chicken Breast & Brown Rice",
    calories: 620,
    proteinG: 48,
    carbsG: 65,
    fatG: 12,
    timestamp: "01:30 PM"
  }
];
