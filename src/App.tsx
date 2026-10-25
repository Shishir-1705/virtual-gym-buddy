import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import MobileFrame from "./components/MobileFrame";
import GymBuddyChat from "./components/GymBuddyChat";
import WorkoutTracker from "./components/WorkoutTracker";
import JournalLogger from "./components/JournalLogger";
import DietPlanner from "./components/DietPlanner";
import AuthModal from "./components/AuthModal";
import AccountSettingsModal from "./components/AccountSettingsModal";
import MigrationModal from "./components/MigrationModal";
import { useAuth } from "./context/AuthContext";
import {
  getUserProfile,
  saveUserProfile,
  getUserWorkouts,
  addWorkout,
  deleteWorkout,
  getUserJournals,
  addJournal,
  deleteJournal,
  getUserMeals,
  addMeal,
  deleteMeal,
  getCoachMessages,
  clearUserCloudData
} from "./services/firestoreService";
import { GYM_BUDDIES, INITIAL_USER_STATS, HISTORICAL_WORKOUTS, HISTORICAL_JOURNALS, INITIAL_MEAL_LOG } from "./data";
import { UserStats, WorkoutSession, JournalEntry, MealLog, GymBuddy, Message } from "./types";
import { BackupPayloadSchema } from "./schemas/backupSchema";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid
} from "recharts";
import {
  Trophy,
  Flame,
  Dumbbell,
  MessageSquare,
  BookOpen,
  Apple,
  Settings,
  Scale,
  Sparkles,
  Award,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Compass,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Volume2,
  VolumeX,
  Download,
  Upload,
  Trash2,
  Droplet,
  X,
  LogIn,
  LogOut,
  User,
  CloudUpload
} from "lucide-react";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-xl shadow-xl text-xs text-left min-w-[140px]">
        <p className="font-semibold text-slate-200 truncate">{data.workout}</p>
        <p className="text-[9px] text-slate-500 mt-0.5">{data.fullDate || "Session"}</p>
        <div className="mt-2 flex items-center justify-between gap-4">
          <span className="text-slate-400">Calories:</span>
          <span className="font-mono font-bold text-amber-500">+{data.calories} kcal</span>
        </div>
        {data.avgCalories !== undefined && (
          <div className="flex items-center justify-between gap-4 mt-0.5">
            <span className="text-slate-400">7-Day Avg:</span>
            <span className="font-mono font-bold text-sky-400">{data.avgCalories} kcal</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 mt-0.5">
          <span className="text-slate-400">Duration:</span>
          <span className="font-mono font-bold text-slate-300">{data.duration} m</span>
        </div>
      </div>
    );
  }
  return null;
};

// Elegant, glow-enhanced custom active dot powered by framer-motion circle elements
const CustomActiveDot = (props: any) => {
  const { cx, cy } = props;
  if (cx === undefined || cy === undefined) return null;
  return (
    <g>
      {/* Outer subtle glow/pulse effect ring */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={8}
        fill="#f59e0b"
        opacity={0.3}
        initial={{ scale: 0.8, opacity: 0.3 }}
        animate={{ scale: [0.9, 2.2, 0.9], opacity: [0.35, 0, 0.35] }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      {/* Dynamic interactive core dot with hover amplification */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#f59e0b"
        stroke="#ffffff"
        strokeWidth={2}
        initial={{ scale: 0.8, filter: "drop-shadow(0px 0px 0px rgba(245, 158, 11, 0))" }}
        animate={{ scale: 1.25, filter: "drop-shadow(0px 0px 8px rgba(245, 158, 11, 0.85))" }}
        whileHover={{ scale: 1.6, filter: "drop-shadow(0px 0px 12px rgba(245, 158, 11, 1))" }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 12
        }}
      />
    </g>
  );
};

// Clean, high-fidelity Web Audio API synthesizer for positive workout accomplishment sound
let sharedAppAudioCtx: AudioContext | null = null;
const playSuccessChime = () => {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("vgb_sound_enabled") === "false") {
      return;
    }
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!sharedAppAudioCtx || sharedAppAudioCtx.state === "closed") {
      sharedAppAudioCtx = new AudioContextClass();
    }
    const ctx = sharedAppAudioCtx;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // A beautiful 4-note ascending major chord arpeggio: C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz) -> C6 (1046.50 Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const duration = 0.35; // envelope duration

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + duration);
    });
  } catch (err) {
    console.warn("Web Audio API not allowed or failed to play: ", err);
  }
};

export default function App() {
  // Mobile frame simulator viewport toggle state
  const [isMobileMode, setIsMobileMode] = useState(true);

  // Core application states loaded securely from localStorage or initialized with our default high-fidelity data
  const [userStats, setUserStats] = useState<UserStats>(() => {
    const cached = localStorage.getItem("vgb_user_stats");
    return cached ? JSON.parse(cached) : INITIAL_USER_STATS;
  });

  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>(() => {
    const cached = localStorage.getItem("vgb_workout_history");
    return cached ? JSON.parse(cached) : HISTORICAL_WORKOUTS;
  });

  const [journalHistory, setJournalHistory] = useState<JournalEntry[]>(() => {
    const cached = localStorage.getItem("vgb_journal_history");
    return cached ? JSON.parse(cached) : HISTORICAL_JOURNALS;
  });

  const [mealLogs, setMealLogs] = useState<MealLog[]>(() => {
    const cached = localStorage.getItem("vgb_meal_logs");
    return cached ? JSON.parse(cached) : INITIAL_MEAL_LOG;
  });

  const [gymBuddies, setGymBuddies] = useState<GymBuddy[]>(() => {
    const cached = localStorage.getItem("vgb_gym_buddies");
    return cached ? JSON.parse(cached) : GYM_BUDDIES;
  });

  const [chatHistories, setChatHistories] = useState<Record<string, Message[]>>(() => {
    const cached = localStorage.getItem("vgb_chat_history");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse cached chat history", e);
      }
    }
    return {};
  });

  // Navigation tab state: "dashboard" | "chat" | "workout" | "journal" | "diet"
  const [activeTab, setActiveTab] = useState<"dashboard" | "chat" | "workout" | "journal" | "diet">("dashboard");

  // Authentication & Modal states
  const { user, isGuest, loading: authLoading, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "register">("signin");
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [hasLocalGuestData, setHasLocalGuestData] = useState<boolean>(() => {
    try {
      const workouts = localStorage.getItem("vgb_workout_history");
      const journals = localStorage.getItem("vgb_journal_history");
      const meals = localStorage.getItem("vgb_meal_logs");
      return Boolean(
        (workouts && JSON.parse(workouts).length > 0) ||
        (journals && JSON.parse(journals).length > 0) ||
        (meals && JSON.parse(meals).length > 0)
      );
    } catch {
      return false;
    }
  });

  // Cloud loading and error states for Firestore per-user data isolation
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Reload cloud data after successful migration
  const handleReloadCloudData = async () => {
    if (!user) return;
    setIsCloudLoading(true);
    try {
      const profile = await getUserProfile(user.uid);
      if (profile) setUserStats(profile);
      const workouts = await getUserWorkouts(user.uid);
      setWorkoutHistory(workouts);
      const journals = await getUserJournals(user.uid);
      setJournalHistory(journals);
      const meals = await getUserMeals(user.uid);
      setMealLogs(meals);
      const coachHistories: Record<string, Message[]> = {};
      for (const buddy of GYM_BUDDIES) {
        const msgs = await getCoachMessages(user.uid, buddy.id);
        if (msgs.length > 0) coachHistories[buddy.id] = msgs;
      }
      setChatHistories(coachHistories);
    } catch (err) {
      console.error("Failed to reload cloud data after migration:", err);
    } finally {
      setIsCloudLoading(false);
    }
  };

  // Synchronize Firestore data when user logs in, or restore local guest data on logout/switch
  useEffect(() => {
    let isCancelled = false;

    async function syncUserData() {
      if (user) {
        setIsCloudLoading(true);
        setCloudError(null);
        // Reset in-memory collections immediately to eliminate cross-account stale state
        setWorkoutHistory([]);
        setJournalHistory([]);
        setMealLogs([]);
        setChatHistories({});
        try {
          // 1. Fetch user profile from Firestore
          const profile = await getUserProfile(user.uid);
          if (isCancelled) return;

          if (profile) {
            setUserStats(profile);
          } else {
            // New user: bootstrap initial profile document in Firestore
            await saveUserProfile(user.uid, INITIAL_USER_STATS, soundEnabled);
            if (isCancelled) return;
            setUserStats(INITIAL_USER_STATS);
          }

          // 2. Fetch workouts
          const workouts = await getUserWorkouts(user.uid);
          if (isCancelled) return;
          setWorkoutHistory(workouts);

          // 3. Fetch journals
          const journals = await getUserJournals(user.uid);
          if (isCancelled) return;
          setJournalHistory(journals);

          // 4. Fetch meals
          const meals = await getUserMeals(user.uid);
          if (isCancelled) return;
          setMealLogs(meals);

          // 5. Fetch coach messages
          const coachHistories: Record<string, Message[]> = {};
          for (const buddy of GYM_BUDDIES) {
            const msgs = await getCoachMessages(user.uid, buddy.id);
            if (isCancelled) return;
            if (msgs.length > 0) {
              coachHistories[buddy.id] = msgs;
            }
          }
          setChatHistories(coachHistories);
        } catch (err: any) {
          if (!isCancelled) {
            console.error("Failed to load user cloud data from Firestore:", err);
            setCloudError(err?.message || "Failed to load cloud profile data.");
          }
        } finally {
          if (!isCancelled) {
            setIsCloudLoading(false);
          }
        }
      } else {
        // Guest mode: restore local storage state safely without data loss
        setIsCloudLoading(false);
        setCloudError(null);
        try {
          const cachedStats = localStorage.getItem("vgb_user_stats");
          setUserStats(cachedStats ? JSON.parse(cachedStats) : INITIAL_USER_STATS);

          const cachedWorkouts = localStorage.getItem("vgb_workout_history");
          setWorkoutHistory(cachedWorkouts ? JSON.parse(cachedWorkouts) : HISTORICAL_WORKOUTS);

          const cachedJournals = localStorage.getItem("vgb_journal_history");
          setJournalHistory(cachedJournals ? JSON.parse(cachedJournals) : HISTORICAL_JOURNALS);

          const cachedMeals = localStorage.getItem("vgb_meal_logs");
          setMealLogs(cachedMeals ? JSON.parse(cachedMeals) : INITIAL_MEAL_LOG);

          const cachedBuddies = localStorage.getItem("vgb_gym_buddies");
          setGymBuddies(cachedBuddies ? JSON.parse(cachedBuddies) : GYM_BUDDIES);

          const cachedChat = localStorage.getItem("vgb_chat_history");
          if (cachedChat) {
            const parsed = JSON.parse(cachedChat);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setChatHistories(parsed);
            } else {
              setChatHistories({});
            }
          } else {
            setChatHistories({});
          }
        } catch (e) {
          console.error("Failed to restore guest data from localStorage", e);
        }
      }
    }

    syncUserData();

    return () => {
      isCancelled = true;
    };
  }, [user?.uid]);

  // Congratulatory overlay modal states
  const [congratsWorkout, setCongratsWorkout] = useState<WorkoutSession | null>(null);

  // Non-blocking in-app confirmation modal (replaces window.confirm)
  const [appConfirmModal, setAppConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Settings pane variables
  const [editWeight, setEditWeight] = useState(userStats.weightKg.toString());
  const [editHeight, setEditHeight] = useState(userStats.heightCm.toString());
  const [editGoal, setEditGoal] = useState(userStats.goal);
  const [editStreak, setEditStreak] = useState(userStats.streak.toString());
  const [editTotalWorkouts, setEditTotalWorkouts] = useState(userStats.totalWorkouts.toString());
  const [editTotalCalories, setEditTotalCalories] = useState(userStats.totalCalories.toString());
  const [editWaterLogged, setEditWaterLogged] = useState(userStats.waterLoggedMl.toString());
  const [editTargetCalories, setEditTargetCalories] = useState(userStats.targetCalories.toString());
  const [editWaterTarget, setEditWaterTarget] = useState(userStats.waterTargetMl.toString());
  // Sound setting state (toggle chimes & celebrations)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem("vgb_sound_enabled") !== "false";
  });
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("vgb_sound_enabled", soundEnabled ? "true" : "false");
  }, [soundEnabled]);

  const [isSavedStats, setIsSavedStats] = useState(false);

  // Sync edit stats state if userStats changes
  useEffect(() => {
    setEditWeight(userStats.weightKg.toString());
    setEditHeight(userStats.heightCm.toString());
    setEditGoal(userStats.goal);
    setEditStreak(userStats.streak.toString());
    setEditTotalWorkouts(userStats.totalWorkouts.toString());
    setEditTotalCalories(userStats.totalCalories.toString());
    setEditWaterLogged(userStats.waterLoggedMl.toString());
    setEditTargetCalories(userStats.targetCalories.toString());
    setEditWaterTarget(userStats.waterTargetMl.toString());
  }, [
    userStats.weightKg,
    userStats.heightCm,
    userStats.goal,
    userStats.streak,
    userStats.totalWorkouts,
    userStats.totalCalories,
    userStats.waterLoggedMl,
    userStats.targetCalories,
    userStats.waterTargetMl
  ]);

  // Write changes to cache only in guest mode to prevent overwriting guest data with authenticated account data
  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_user_stats", JSON.stringify(userStats));
    }
  }, [userStats, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_workout_history", JSON.stringify(workoutHistory));
    }
  }, [workoutHistory, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_journal_history", JSON.stringify(journalHistory));
    }
  }, [journalHistory, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_meal_logs", JSON.stringify(mealLogs));
    }
  }, [mealLogs, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_gym_buddies", JSON.stringify(gymBuddies));
    }
  }, [gymBuddies, user]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_chat_history", JSON.stringify(chatHistories));
    }
  }, [chatHistories, user]);

  // Trigger interactive confetti celebration when congrats overlay is activated
  useEffect(() => {
    if (congratsWorkout) {
      // Primary explosive burst
      confetti({
        particleCount: 140,
        spread: 85,
        origin: { y: 0.6 },
        colors: ["#f59e0b", "#10b981", "#3b82f6", "#ec4899", "#8b5cf6"]
      });

      // Side cannons after brief delay
      const delayTimer = setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.8 }
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.8 }
        });
      }, 250);

      // Light ambient raining effect for 2.5 seconds
      const end = Date.now() + 2500;
      const interval = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(interval);
          return;
        }
        confetti({
          startVelocity: 25,
          spread: 360,
          ticks: 50,
          origin: {
            x: Math.random(),
            y: Math.random() - 0.2
          }
        });
      }, 250);

      return () => {
        clearTimeout(delayTimer);
        clearInterval(interval);
      };
    }
  }, [congratsWorkout]);

  // Global keyboard shortcuts (Escape key dismisses modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (appConfirmModal?.isOpen) {
          setAppConfirmModal(null);
        } else if (congratsWorkout) {
          setCongratsWorkout(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appConfirmModal, congratsWorkout]);

  const activeBuddy = gymBuddies.find((b) => b.id === userStats.selectedBuddyId) || gymBuddies[0];

  // Handler: Completed a workout session
  const handleWorkoutCompleted = (session: WorkoutSession) => {
    setWorkoutHistory((prev) => [session, ...prev]);
    
    // Check if user already logged a workout today to prevent artificial streak inflation
    const todayStr = new Date().toLocaleDateString([], { month: "short", day: "numeric" });
    const alreadyLoggedToday = workoutHistory.some(
      (w) => w.date === "Today" || (w.date && w.date.includes(todayStr))
    );

    // Update daily statistics
    const updatedStats: UserStats = {
      ...userStats,
      totalWorkouts: userStats.totalWorkouts + 1,
      totalCalories: userStats.totalCalories + session.caloriesBurned,
      streak: alreadyLoggedToday ? userStats.streak : userStats.streak + 1,
      recentMood: "Energized"
    };
    setUserStats(updatedStats);

    if (user) {
      addWorkout(user.uid, session).catch((err) => console.error("Failed to save workout to Firestore:", err));
      saveUserProfile(user.uid, updatedStats, soundEnabled).catch((err) => console.error("Failed to update profile stats in Firestore:", err));
    }

    // Play celebratory synthesized sound
    playSuccessChime();

    // Open congrats modal overlay
    setCongratsWorkout(session);
    setActiveTab("dashboard");
  };

  // Handler: Added journal entry reflection
  const handleAddJournal = (entry: JournalEntry) => {
    setJournalHistory((prev) => [...prev, entry]);
    const updatedStats: UserStats = {
      ...userStats,
      recentMood: entry.sentiment
    };
    setUserStats(updatedStats);

    if (user) {
      addJournal(user.uid, entry).catch((err) => console.error("Failed to save journal to Firestore:", err));
      saveUserProfile(user.uid, updatedStats, soundEnabled).catch((err) => console.error("Failed to update profile mood in Firestore:", err));
    }
  };

  // Handler: Added meal log
  const handleAddMeal = (meal: MealLog) => {
    setMealLogs((prev) => [meal, ...prev]);
    if (user) {
      addMeal(user.uid, meal).catch((err) => console.error("Failed to save meal to Firestore:", err));
    }
  };

  // Handler: Delete meal log
  const handleDeleteMeal = (id: string) => {
    setMealLogs((prev) => prev.filter((m) => m.id !== id));
    if (user) {
      deleteMeal(user.uid, id).catch((err) => console.error("Failed to delete meal from Firestore:", err));
    }
  };

  // Handler: Water logging
  const handleLogWater = (amount: number) => {
    const updatedStats: UserStats = {
      ...userStats,
      waterLoggedMl: userStats.waterLoggedMl + amount
    };
    setUserStats(updatedStats);
    if (user) {
      saveUserProfile(user.uid, updatedStats, soundEnabled).catch((err) => console.error("Failed to update water in Firestore:", err));
    }
  };

  // Handler: Delete workout history entry
  const handleDeleteWorkout = (id: string) => {
    const found = workoutHistory.find((w) => w.id === id);
    let updatedStats = userStats;
    if (found) {
      updatedStats = {
        ...userStats,
        totalWorkouts: Math.max(0, userStats.totalWorkouts - 1),
        totalCalories: Math.max(0, userStats.totalCalories - found.caloriesBurned)
      };
      setUserStats(updatedStats);
    }
    setWorkoutHistory((prev) => prev.filter((w) => w.id !== id));

    if (user) {
      deleteWorkout(user.uid, id).catch((err) => console.error("Failed to delete workout from Firestore:", err));
      if (found) {
        saveUserProfile(user.uid, updatedStats, soundEnabled).catch((err) => console.error("Failed to update stats in Firestore:", err));
      }
    }
  };

  // Handler: Delete journal history entry
  const handleDeleteJournal = (id: string) => {
    setJournalHistory((prev) => prev.filter((j) => j.id !== id));
    if (user) {
      deleteJournal(user.uid, id).catch((err) => console.error("Failed to delete journal from Firestore:", err));
    }
  };

  // Handler: Update physical stats
  const handleSaveStats = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedStats: UserStats = {
      ...userStats,
      weightKg: parseFloat(editWeight) || userStats.weightKg,
      heightCm: parseFloat(editHeight) || userStats.heightCm,
      goal: editGoal,
      streak: parseInt(editStreak) ?? userStats.streak,
      totalWorkouts: parseInt(editTotalWorkouts) ?? userStats.totalWorkouts,
      totalCalories: parseInt(editTotalCalories) ?? userStats.totalCalories,
      waterLoggedMl: parseInt(editWaterLogged) ?? userStats.waterLoggedMl,
      targetCalories: parseInt(editTargetCalories) ?? userStats.targetCalories,
      waterTargetMl: parseInt(editWaterTarget) ?? userStats.waterTargetMl
    };
    setUserStats(updatedStats);
    if (user) {
      saveUserProfile(user.uid, updatedStats, soundEnabled).catch((err) => console.error("Failed to save stats to Firestore:", err));
    }
    setIsSavedStats(true);
    setTimeout(() => setIsSavedStats(false), 2000);
  };

  // Handler: Reset App back to original mock databases or reset cloud data
  const handleResetApp = () => {
    if (user) {
      setAppConfirmModal({
        isOpen: true,
        title: "Reset Cloud Account Data?",
        message: "Are you sure you want to reset all your cloud workouts, reflections, and nutrition logs? This clears your data from Firestore. (Your local guest data remains untouched.)",
        confirmLabel: "Reset Cloud Data",
        onConfirm: async () => {
          try {
            await clearUserCloudData(user.uid);
            await saveUserProfile(user.uid, INITIAL_USER_STATS, soundEnabled);
            setUserStats(INITIAL_USER_STATS);
            setWorkoutHistory([]);
            setJournalHistory([]);
            setMealLogs([]);
            setChatHistories({});
            setEditWeight(INITIAL_USER_STATS.weightKg.toString());
            setEditHeight(INITIAL_USER_STATS.heightCm.toString());
            setEditGoal(INITIAL_USER_STATS.goal);
            setActiveTab("dashboard");
          } catch (err) {
            console.error("Failed to reset cloud data:", err);
          } finally {
            setAppConfirmModal(null);
          }
        }
      });
    } else {
      setAppConfirmModal({
        isOpen: true,
        title: "Reset Application Data?",
        message: "Are you sure you want to reset all workouts, reflections, and nutrition logs back to factory defaults? All custom entries will be cleared.",
        confirmLabel: "Reset Everything",
        onConfirm: () => {
          localStorage.removeItem("vgb_user_stats");
          localStorage.removeItem("vgb_workout_history");
          localStorage.removeItem("vgb_journal_history");
          localStorage.removeItem("vgb_meal_logs");
          localStorage.removeItem("vgb_gym_buddies");
          localStorage.removeItem("vgb_custom_routines");
          localStorage.removeItem("vgb_chat_history");
          setUserStats(INITIAL_USER_STATS);
          setWorkoutHistory(HISTORICAL_WORKOUTS);
          setJournalHistory(HISTORICAL_JOURNALS);
          setMealLogs(INITIAL_MEAL_LOG);
          setGymBuddies(GYM_BUDDIES);
          setChatHistories({});
          setEditWeight(INITIAL_USER_STATS.weightKg.toString());
          setEditHeight(INITIAL_USER_STATS.heightCm.toString());
          setEditGoal(INITIAL_USER_STATS.goal);
          setActiveTab("dashboard");
          setAppConfirmModal(null);
        }
      });
    }
  };

  // Handler: Export all application data as JSON
  const handleExportData = () => {
    try {
      const dataToExport = {
        app: "Virtual Gym Buddy",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        userStats,
        workoutHistory,
        journalHistory,
        mealLogs,
        gymBuddies,
        chatHistories,
        customRoutines: JSON.parse(localStorage.getItem("vgb_custom_routines") || "[]")
      };
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gym_buddy_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupStatus("Data exported successfully!");
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (err) {
      console.error("Export error:", err);
      setBackupStatus("Failed to export data.");
    }
  };

  // Handler: Import application data from JSON with Zod schema validation
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawJson = JSON.parse(event.target?.result as string);
        const validation = BackupPayloadSchema.safeParse(rawJson);

        if (!validation.success) {
          const issueSummary = validation.error.issues
            .slice(0, 2)
            .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
            .join("; ");
          setBackupStatus(`Import failed: Invalid backup schema (${issueSummary})`);
          setTimeout(() => setBackupStatus(null), 5000);
          return;
        }

        const validData = validation.data;
        if (validData.userStats) setUserStats(validData.userStats as UserStats);
        if (validData.workoutHistory) setWorkoutHistory(validData.workoutHistory as WorkoutSession[]);
        if (validData.journalHistory) setJournalHistory(validData.journalHistory as JournalEntry[]);
        if (validData.mealLogs) setMealLogs(validData.mealLogs as MealLog[]);
        if (validData.customRoutines) {
          localStorage.setItem("vgb_custom_routines", JSON.stringify(validData.customRoutines));
        }
        if (validData.chatHistories) {
          setChatHistories(validData.chatHistories as Record<string, Message[]>);
          localStorage.setItem("vgb_chat_history", JSON.stringify(validData.chatHistories));
        }
        setBackupStatus("Data imported and validated successfully!");
        setTimeout(() => setBackupStatus(null), 3500);
      } catch (err: any) {
        console.error("Import error:", err);
        setBackupStatus("Invalid JSON file format. Import aborted.");
        setTimeout(() => setBackupStatus(null), 4000);
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  };

  // Calculate BMI
  const bmiValue = () => {
    const hMeter = userStats.heightCm / 100;
    if (hMeter <= 0) return 0;
    return (userStats.weightKg / (hMeter * hMeter)).toFixed(1);
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Optimal Weight";
    if (bmi < 30) return "Overweight";
    return "Obese";
  };

  // Determine what active workout is current
  const todayWorkoutText = workoutHistory.length > 0 && workoutHistory[0].date === "Today" || workoutHistory[0]?.id.startsWith("active")
    ? workoutHistory[0].workoutName 
    : "None scheduled yet";

  // Prepare last 7 workouts trend data for Recharts (chronological order)
  const sliced7 = [...workoutHistory].slice(0, 7);
  const last7Workouts = sliced7
    .reverse()
    .map((session, index) => {
      let formattedName = session.date;
      if (session.date === "Today") {
        formattedName = "Today";
      } else {
        const parts = session.date.split(",");
        if (parts.length > 0) {
          formattedName = parts[0].trim();
        }
      }

      // Calculate 7-workout rolling average ending at this session
      const actualIndexInHistory = workoutHistory.findIndex(s => s.id === session.id);
      let avgCalories = session.caloriesBurned;
      if (actualIndexInHistory !== -1) {
        // Take up to 7 sessions starting from actualIndexInHistory (which goes backward in time)
        const windowSessions = workoutHistory.slice(actualIndexInHistory, actualIndexInHistory + 7);
        const sum = windowSessions.reduce((acc, curr) => acc + curr.caloriesBurned, 0);
        avgCalories = Math.round(sum / windowSessions.length);
      }

      return {
        name: formattedName,
        fullDate: session.date,
        workout: session.workoutName,
        calories: session.caloriesBurned,
        avgCalories: avgCalories,
        duration: session.durationMinutes,
      };
    });

  // Calculate daily calories and water intake progress for dashboard banners
  const currentDailyCalories = mealLogs.reduce((acc, curr) => acc + curr.calories, 0);
  const caloriePercent = Math.min(100, Math.round((currentDailyCalories / (userStats.targetCalories || 2000)) * 100)) || 0;
  const waterPercent = Math.min(100, Math.round((userStats.waterLoggedMl / (userStats.waterTargetMl || 2500)) * 100)) || 0;

  // Subtle Account Control header element
  const accountControl = (
    <div className="flex items-center gap-2">
      {authLoading ? (
        <div className="h-7 w-20 bg-slate-800/60 rounded-full animate-pulse" />
      ) : user ? (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setIsAccountModalOpen(true)}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-full text-xs text-slate-200 transition-colors cursor-pointer"
            title="Account Settings & Security"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="max-w-[90px] sm:max-w-[140px] truncate text-[11px] font-medium">
              {user.email || "Athlete"}
            </span>
            <Settings className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-red-400 hover:bg-slate-800/80 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
            title="Log out of account"
            aria-label="Log out"
          >
            <LogOut className="w-3 h-3" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 font-medium hidden sm:inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Guest Mode
          </span>
          <button
            type="button"
            onClick={() => {
              setAuthModalMode("signin");
              setIsAuthModalOpen(true);
            }}
            className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold rounded-full transition-colors flex items-center gap-1 cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign in</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <MobileFrame isMobileMode={isMobileMode} setIsMobileMode={setIsMobileMode} accountControl={accountControl}>
      {/* Outer App Frame Wrapper */}
      <div id="vgb-application" className="flex flex-col h-full bg-slate-950 font-sans text-slate-100 select-none relative">
        
        {/* Navigation / Brand Sidebars for Desktop Fluid View */}
        {!isMobileMode && (
          <div id="desktop-sidebar-nav" className="hidden lg:flex w-64 bg-slate-900 border-r border-slate-800 flex-col fixed top-[60px] bottom-0 left-0 p-4 space-y-6">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest pl-2">Navigation Panel</span>
              <nav className="flex flex-col space-y-1">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "dashboard" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Main Center</span>
                </button>
                <button
                  onClick={() => setActiveTab("chat")}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "chat" ? `${activeBuddy.primaryColor} text-slate-950 shadow` : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>AI Gym Buddy Chat</span>
                </button>
                <button
                  onClick={() => setActiveTab("workout")}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "workout" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <Dumbbell className="w-4 h-4" />
                  <span>Workout Tracker</span>
                </button>
                <button
                  onClick={() => setActiveTab("journal")}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "journal" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Reflection Logs</span>
                </button>
                 <button
                  onClick={() => setActiveTab("diet")}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === "diet" ? "bg-amber-500 text-slate-950 shadow" : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <Apple className="w-4 h-4" />
                  <span>Diet & Calorie Coach</span>
                </button>
              </nav>
            </div>

            {/* Micro active buddy banner inside sidebar */}
            <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center space-x-3 relative overflow-hidden group`}>
              <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-tr ${activeBuddy.gradient} opacity-5 blur-xl`}></div>
              <span className="text-xl">{activeBuddy.avatarUrl}</span>
              <div>
                <p className="text-[10px] font-bold text-slate-400">Companion Buddy</p>
                <h5 className="text-xs font-bold text-slate-200">{activeBuddy.name}</h5>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Inner Application Page viewport */}
        <div className={`flex-1 flex flex-col min-h-0 ${!isMobileMode ? "lg:pl-64" : ""}`}>
          
          {/* RENDER ACTIVE TAB VIEWPORT */}
          <div className="flex-1 min-h-0">
            {activeTab === "dashboard" && (
              /* Core Main Center Dashboard View */
              <div id="dashboard-viewport" className="h-full p-4 space-y-5 overflow-y-auto scrollbar-thin">
                
                {/* Visual Header Spark Title */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>My Progress Hub</span>
                    </span>
                    <h2 className="text-lg font-extrabold text-slate-100 mt-0.5">Welcome Back, Champ</h2>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-400 font-medium">Daily Streak:</span>
                    <div className="flex items-center space-x-1 bg-amber-500/10 border border-amber-900 px-2.5 py-1 rounded-xl text-amber-400 text-xs font-mono font-bold animate-pulse">
                      <Flame className="w-4 h-4 fill-current" />
                      <span>{userStats.streak} Days</span>
                    </div>
                  </div>
                </div>

                {/* Account Status / Cloud Sync Notice */}
                {isGuest ? (
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[11px]">Browsing in <strong className="text-slate-300">Guest Mode</strong> (saved locally).</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthModalMode("signin");
                        setIsAuthModalOpen(true);
                      }}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 cursor-pointer"
                    >
                      Sign in to sync
                    </button>
                  </div>
                ) : user ? (
                  <div className="space-y-2">
                    {cloudError && (
                      <div className="bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2 text-red-300">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-[11px]">{cloudError}</span>
                        </div>
                      </div>
                    )}
                    <div className="bg-slate-900/60 border border-emerald-900/50 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 text-slate-300">
                        {isCloudLoading ? (
                          <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                        <span className="text-[11px]">
                          Logged in as <strong className="text-emerald-300">{user.email}</strong>
                          {isCloudLoading ? " • Syncing cloud profile..." : " • Cloud isolated"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">Firestore</span>
                    </div>

                    {hasLocalGuestData && (
                      <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl px-3 py-2 flex items-center justify-between text-xs animate-fade-in">
                        <div className="flex items-center space-x-2 text-amber-300">
                          <CloudUpload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-[11px]">Unmigrated local guest records detected on this device.</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsMigrationModalOpen(true)}
                          className="text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          Review & Migrate
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Dashboard Metrics Banners Grid */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: {
                        staggerChildren: 0.1,
                        delayChildren: 0.1
                      }
                    }
                  }}
                  className={`grid gap-3 ${isMobileMode ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5"}`}
                >
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 15 },
                      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
                    }}
                    className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center space-x-3 shadow hover:border-slate-700 transition-all min-w-0"
                  >
                    <div className="p-2.5 bg-slate-950 rounded-xl text-amber-500 shrink-0">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-medium block truncate">Total Workouts</span>
                      <p className="text-sm font-mono font-bold text-slate-100 mt-0.5 whitespace-nowrap">{userStats.totalWorkouts} sessions</p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 15 },
                      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
                    }}
                    className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center space-x-3 shadow hover:border-slate-700 transition-all min-w-0"
                  >
                    <div className="p-2.5 bg-slate-950 rounded-xl text-red-500 shrink-0">
                      <Flame className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-medium block truncate">Calories Burned</span>
                      <p className="text-sm font-mono font-bold text-slate-100 mt-0.5 whitespace-nowrap">{userStats.totalCalories} kcal</p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 15 },
                      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
                    }}
                    className={`bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center space-x-3 shadow hover:border-slate-700 transition-all min-w-0 ${isMobileMode ? "col-span-2" : "col-span-2 md:col-span-1"}`}
                  >
                    <div className="p-2.5 bg-slate-950 rounded-xl text-emerald-400 shrink-0">
                      <Scale className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 font-medium block truncate">Weight / Height</span>
                      <p className="text-xs font-mono font-bold text-slate-200 mt-0.5 whitespace-nowrap">{userStats.weightKg} kg / {userStats.heightCm} cm</p>
                    </div>
                  </motion.div>

                  {/* Enhanced Calorie Intake Progress Card */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 15 },
                      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
                    }}
                    className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-between shadow hover:border-slate-700 transition-all min-w-0"
                  >
                    <div className="flex items-center space-x-3 min-w-0 w-full">
                      <div className="p-2.5 bg-slate-950 rounded-xl text-orange-400 shrink-0">
                        <Apple className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[10px] text-slate-400 font-medium block truncate">Calorie Intake</span>
                          <span className="text-[9px] font-bold text-orange-400 font-mono shrink-0">{caloriePercent}%</span>
                        </div>
                        <p className="text-xs font-mono font-bold text-slate-100 mt-0.5 whitespace-nowrap">
                          {currentDailyCalories} / {userStats.targetCalories} kcal
                        </p>
                      </div>
                    </div>
                    
                    {/* Animated Progress Bar */}
                    <div className="mt-2.5 w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${caloriePercent}%` }}
                        transition={{ duration: 1.0, ease: "easeOut" }}
                        className="bg-orange-500 h-full rounded-full"
                      />
                    </div>
                  </motion.div>

                  {/* Enhanced Water Intake Progress Card */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, scale: 0.95, y: 15 },
                      visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
                    }}
                    className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex flex-col justify-between shadow hover:border-slate-700 transition-all min-w-0"
                  >
                    <div className="flex items-center space-x-3 min-w-0 w-full">
                      <div className="p-2.5 bg-slate-950 rounded-xl text-cyan-400 shrink-0">
                        <Droplet className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[10px] text-slate-400 font-medium block truncate">Water Logged</span>
                          <span className="text-[9px] font-bold text-cyan-400 font-mono shrink-0">{waterPercent}%</span>
                        </div>
                        <p className="text-xs font-mono font-bold text-slate-100 mt-0.5 whitespace-nowrap">
                          {userStats.waterLoggedMl} / {userStats.waterTargetMl} ml
                        </p>
                      </div>
                    </div>
                    
                    {/* Animated Progress Bar */}
                    <div className="mt-2.5 w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850/50">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${waterPercent}%` }}
                        transition={{ duration: 1.0, ease: "easeOut" }}
                        className="bg-cyan-500 h-full rounded-full"
                      />
                    </div>

                    {/* Quick Hydration Tap Buttons */}
                    <div className="mt-2.5 flex items-center gap-1.5 pt-1.5 border-t border-slate-850/60">
                      <button
                        type="button"
                        onClick={() => handleLogWater(250)}
                        aria-label="Add 250ml water"
                        className="flex-1 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[9px] font-bold transition-all cursor-pointer text-center"
                      >
                        +250ml
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLogWater(500)}
                        aria-label="Add 500ml water"
                        className="flex-1 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[9px] font-bold transition-all cursor-pointer text-center"
                      >
                        +500ml
                      </button>
                    </div>
                  </motion.div>
                </motion.div>

                 {/* Calories Burned Trend Chart (Recharts) */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: 0.5,
                        ease: "easeOut",
                        staggerChildren: 0.15,
                        delayChildren: 0.1
                      }
                    }
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl"
                >
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
                    }}
                    className="flex items-center justify-between mb-3"
                  >
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                        <span>Calories Burned Trend</span>
                      </h4>
                      <div className="flex items-center gap-3 mt-1.5 text-[9px] font-semibold text-slate-500">
                        <span className="flex items-center gap-1 text-amber-500">
                          <span className="w-2 h-0.5 bg-amber-500 inline-block rounded"></span>
                          <span>Workout Burn</span>
                        </span>
                        <span className="flex items-center gap-1 text-sky-400">
                          <span className="w-2 h-0.5 border-t border-dashed border-sky-400 inline-block"></span>
                          <span>7-Day Average</span>
                        </span>
                      </div>
                    </div>
                    {last7Workouts.length > 0 && (
                      <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-950/40 font-bold px-2 py-0.5 rounded">
                        Last 7 Sessions
                      </span>
                    )}
                  </motion.div>

                  {last7Workouts.length === 0 ? (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
                      }}
                      className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 p-4 text-center"
                    >
                      <TrendingUp className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-xs font-semibold text-slate-400">No session data available</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">Complete workouts to view your calorie burning trend line over time.</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, scale: 0.98 },
                        visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } }
                      }}
                      className="h-52 w-full pt-2"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={last7Workouts}
                          margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="colorCalories" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis
                            dataKey="name"
                            stroke="#64748b"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                          />
                          <ChartTooltip content={<CustomTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                          <Area
                            type="monotone"
                            dataKey="calories"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorCalories)"
                            activeDot={<CustomActiveDot />}
                          />
                          <Line
                            type="monotone"
                            dataKey="avgCalories"
                            stroke="#38bdf8"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 1, stroke: "#38bdf8", fill: "#1e293b" }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </motion.div>
                  )}
                </motion.div>

                {/* Active companion selection tray */}
                <div className="bg-slate-900/60 border border-slate-850 rounded-2xl p-4 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Companion Selection</h4>
                      <p className="text-[10px] text-slate-500">Swap buddy personalities in real-time to match your workout focus!</p>
                    </div>
                    <span className="text-[9px] bg-amber-500/10 text-amber-500 font-bold px-2 py-0.5 rounded border border-amber-950">
                      Live Swapping
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {gymBuddies.map((buddy) => {
                      const isSelected = userStats.selectedBuddyId === buddy.id;
                      return (
                        <button
                          key={buddy.id}
                          onClick={() => {
                            const updated = { ...userStats, selectedBuddyId: buddy.id };
                            setUserStats(updated);
                            if (user) {
                              saveUserProfile(user.uid, updated, soundEnabled).catch((err) => {
                                console.error("Failed to update companion buddy in Firestore:", err);
                              });
                            }
                          }}
                          className={`p-3 rounded-xl border text-center relative transition-all flex flex-col items-center ${
                            isSelected
                              ? `${buddy.borderColor} bg-slate-950 scale-[1.02] shadow`
                              : "border-slate-850 bg-slate-900/30 hover:border-slate-800 hover:bg-slate-900/55"
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-tr ${buddy.gradient} flex items-center justify-center text-lg shadow relative`}>
                            <span>{buddy.avatarUrl}</span>
                            {isSelected && (
                              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border border-slate-950 flex items-center justify-center">
                                <UserCheck className="w-2 h-2 text-slate-950 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <h5 className="text-[11px] font-bold text-slate-200 mt-2">{buddy.name}</h5>
                          <span className="text-[8px] text-slate-400 font-medium scale-90 mt-0.5 block line-clamp-1">{buddy.role.split(" & ")[0]}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Persona description widget */}
                  <div className="bg-slate-950 border border-slate-900 p-3 rounded-xl text-xs relative overflow-hidden flex items-start space-x-2.5">
                    <span className="text-xl mt-0.5">{activeBuddy.avatarUrl}</span>
                    <div>
                      <span className="text-[8px] font-extrabold uppercase text-amber-500">ACTIVE BUDDY CONFIG</span>
                      <p className="text-slate-200 font-semibold mt-0.5">"{activeBuddy.tagline}"</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                        {activeBuddy.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Main Interactive CTA Panels Row */}
                <div className={`grid gap-4 ${isMobileMode ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
                  
                  {/* Chat Call To Action card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl relative overflow-hidden group">
                    <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-tr ${activeBuddy.gradient} opacity-5 blur-2xl group-hover:scale-110 transition-all`}></div>
                    <div>
                      <div className="flex justify-between items-start mb-2.5">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Need Motivation?</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-950 font-bold px-1.5 py-0.5 rounded">
                          AI Online
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
                        <span>Chat with {activeBuddy.name}</span>
                      </h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                        Feeling tired? Stressed? Ask your buddy for customized routines, macro critiques, or daily psychological support.
                      </p>
                    </div>

                    <button
                      onClick={() => setActiveTab("chat")}
                      className={`w-full py-2 mt-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-200 hover:scale-[1.01]`}
                    >
                      <span>Open AI Chat Companion</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Workout Hub CTA Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-xl relative overflow-hidden group">
                    <div>
                      <div className="flex justify-between items-start mb-2.5">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Ready to sweat?</span>
                        <span className="text-[9px] text-amber-500 bg-amber-500/10 border border-amber-950 font-bold px-1.5 py-0.5 rounded">
                          Streak Boost
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-100">Workout Training Hub</h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                        Select a preloaded workout or generate an optimized fitness schedule using Gemini based on your equipment and targets.
                      </p>
                    </div>

                    <button
                      onClick={() => setActiveTab("workout")}
                      className="w-full py-2 mt-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-1 bg-amber-500 text-slate-950 hover:scale-[1.01]"
                    >
                      <span>Start Workout Session</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Section: Physical Profile & BMI Calculator Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3.5">Physical BMI Calculator & Goals</h4>
                  
                  <div className="grid grid-cols-3 gap-3 items-center">
                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl text-center">
                      <span className="text-[8px] uppercase font-bold text-slate-500 block">Estimated BMI</span>
                      <p className="text-sm font-mono font-extrabold text-amber-500 mt-1">{bmiValue()}</p>
                    </div>
                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl text-center">
                      <span className="text-[8px] uppercase font-bold text-slate-500 block">BMI Category</span>
                      <p className="font-bold text-slate-300 mt-1 text-xs truncate">
                        {getBMICategory(parseFloat(bmiValue().toString()))}
                      </p>
                    </div>
                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-xl text-center">
                      <span className="text-[8px] uppercase font-bold text-slate-500 block">Recent Mood</span>
                      <p className="font-bold text-emerald-400 mt-1 text-xs truncate">
                        {userStats.recentMood}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveStats} className="mt-4 pt-3 border-t border-slate-850/50 space-y-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Weight (kg)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editWeight}
                          onChange={(e) => setEditWeight(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Height (cm)</label>
                        <input
                          type="number"
                          value={editHeight}
                          onChange={(e) => setEditHeight(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Daily Streak (days)</label>
                        <input
                          type="number"
                          value={editStreak}
                          onChange={(e) => setEditStreak(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Total Workouts (sessions)</label>
                        <input
                          type="number"
                          value={editTotalWorkouts}
                          onChange={(e) => setEditTotalWorkouts(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Total Calories Burned (kcal)</label>
                        <input
                          type="number"
                          value={editTotalCalories}
                          onChange={(e) => setEditTotalCalories(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Water Logged Today (ml)</label>
                        <input
                          type="number"
                          value={editWaterLogged}
                          onChange={(e) => setEditWaterLogged(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Daily Intake Target (kcal)</label>
                        <input
                          type="number"
                          value={editTargetCalories}
                          onChange={(e) => setEditTargetCalories(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Daily Water Target (ml)</label>
                        <input
                          type="number"
                          value={editWaterTarget}
                          onChange={(e) => setEditWaterTarget(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Fitness Target/Goal Statement</label>
                        <input
                          type="text"
                          value={editGoal}
                          onChange={(e) => setEditGoal(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5 pt-1">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md"
                      >
                        Save & Apply Changes
                      </button>
                      
                      {isSavedStats && (
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1 animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>All details updated successfully!</span>
                        </span>
                      )}
                    </div>
                  </form>
                </div>

                 {/* Section: Historical Logs list */}
                 {workoutHistory.length > 0 && (
                   <div className="space-y-3">
                     <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Workout Log History</h4>
                     {workoutHistory.map((h, idx) => (
                       <div key={h.id || idx} className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl hover:border-slate-700 transition-all flex justify-between items-center text-xs gap-3">
                         <div className="flex-1 min-w-0">
                           <p className="font-semibold text-slate-200 truncate">{h.workoutName}</p>
                           <p className="text-[10px] text-slate-500 mt-1">Logged: {h.date} • Duration: {h.durationMinutes} mins</p>
                         </div>
                         <div className="flex items-center space-x-3 shrink-0">
                           <span className="text-xs font-mono font-bold text-amber-500">+{h.caloriesBurned} kcal</span>
                           <button
                             onClick={() => {
                               setAppConfirmModal({
                                 isOpen: true,
                                 title: "Delete Workout Session?",
                                 message: `Are you sure you want to delete "${h.workoutName}" from history? This action cannot be undone.`,
                                 confirmLabel: "Delete Entry",
                                 onConfirm: () => {
                                   handleDeleteWorkout(h.id);
                                   setAppConfirmModal(null);
                                 }
                               });
                             }}
                             className="p-1.5 rounded-lg bg-slate-950 border border-slate-850 text-red-400 hover:text-red-300 hover:border-red-950 transition-all cursor-pointer"
                             title="Delete workout entry"
                           >
                             <Trash2 className="w-3.5 h-3.5" />
                           </button>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}

                {/* Audio & Sound Settings */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-slate-950 rounded-xl text-amber-500 shadow">
                        {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-100">Audio & Sound Chimes</h4>
                        <p className="text-[10px] text-slate-400">Synthesized audio cues for set completion and workout victories.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        soundEnabled
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {soundEnabled ? "Enabled" : "Muted"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-850/80 text-xs">
                    <span className="text-[10px] text-slate-500">Test audio volume:</span>
                    <button
                      type="button"
                      onClick={playSuccessChime}
                      className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-amber-400 hover:border-slate-700 text-[10px] font-semibold transition-all flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>Test Chime</span>
                    </button>
                  </div>
                </div>

                {/* Data Persistence, Backup & Restore */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-slate-950 rounded-xl text-sky-400 shadow">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">Data Backup & Portability</h4>
                      <p className="text-[10px] text-slate-400">Download your history as JSON or restore from a backup file.</p>
                    </div>
                  </div>

                  {backupStatus && (
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-sky-500/40 text-[11px] text-sky-300 font-medium animate-fade-in flex items-center space-x-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>{backupStatus}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleExportData}
                      className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-sky-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Data</span>
                    </button>

                    <label className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-sky-300 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import Data</span>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportData}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Factory Reset App Button */}
                <div className="pt-2 text-center">
                  <button
                    onClick={handleResetApp}
                    className="text-slate-500 hover:text-slate-400 hover:underline text-xs flex items-center space-x-1.5 mx-auto cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reset companion database</span>
                  </button>
                </div>

              </div>
            )}

            {activeTab === "chat" && (
              <GymBuddyChat
                selectedBuddy={activeBuddy}
                userStats={userStats}
                todayWorkoutName={todayWorkoutText}
                onAddCalories={(cals) => {
                  setUserStats((prev) => ({
                    ...prev,
                    totalCalories: prev.totalCalories + cals
                  }));
                }}
                chatHistories={chatHistories}
                onUpdateChatHistories={setChatHistories}
              />
            )}

            {activeTab === "workout" && (
              <WorkoutTracker
                selectedBuddy={activeBuddy}
                userStats={userStats}
                onWorkoutCompleted={handleWorkoutCompleted}
                onUpdateStats={(weight, height) => {
                  setUserStats((prev) => ({
                    ...prev,
                    weightKg: weight,
                    heightCm: height
                  }));
                }}
                workoutHistory={workoutHistory}
                onDeleteWorkout={handleDeleteWorkout}
              />
            )}

            {activeTab === "journal" && (
              <JournalLogger
                selectedBuddy={activeBuddy}
                history={journalHistory}
                onAddJournal={handleAddJournal}
                onDeleteJournal={handleDeleteJournal}
              />
            )}

            {activeTab === "diet" && (
              <DietPlanner
                selectedBuddy={activeBuddy}
                userStats={userStats}
                mealLogs={mealLogs}
                onAddMeal={handleAddMeal}
                onDeleteMeal={handleDeleteMeal}
                onLogWater={handleLogWater}
              />
            )}
          </div>

          {/* Celebratory Workout Finished Overlay Modal */}
          {congratsWorkout && (
            <div id="congrats-modal-overlay" className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-fade-in select-none">
              <div role="dialog" aria-modal="true" aria-labelledby="congrats-title" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl relative overflow-hidden space-y-4">
                <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${activeBuddy.gradient}`}></div>
                <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto ring-4 ring-amber-500/5 shadow animate-bounce">
                  <Award className="w-8 h-8 stroke-[2.5]" />
                </div>
                
                <div>
                  <h3 id="congrats-title" className="text-base font-extrabold text-slate-100">Workout Logged!</h3>
                  <p className="text-slate-400 text-xs mt-1">Excellent effort completing your session.</p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-850 grid grid-cols-2 gap-3.5">
                  <div className="text-center">
                    <span className="text-[9px] uppercase font-semibold text-slate-500">Duration</span>
                    <p className="text-sm font-mono font-bold text-slate-200 mt-0.5">{congratsWorkout.durationMinutes} mins</p>
                  </div>
                  <div className="text-center">
                    <span className="text-[9px] uppercase font-semibold text-slate-500">Calories Burned</span>
                    <p className="text-sm font-mono font-bold text-amber-500 mt-0.5">+{congratsWorkout.caloriesBurned} kcal</p>
                  </div>
                </div>

                {congratsWorkout.buddyFeedback && (
                  <div className="bg-slate-950 border border-slate-900 p-3 rounded-xl text-xs text-left relative overflow-hidden flex items-start space-x-2 text-slate-300">
                    <span className="text-lg mt-0.5">{activeBuddy.avatarUrl}</span>
                    <p className="leading-relaxed text-[11px] italic font-medium">{congratsWorkout.buddyFeedback}</p>
                  </div>
                )}

                {/* Audio chime replay tool */}
                <button
                  type="button"
                  onClick={playSuccessChime}
                  className="w-full py-2 rounded-xl text-[11px] font-bold text-slate-400 hover:text-amber-400 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Replay Success Chime</span>
                </button>

                <button
                  onClick={() => setCongratsWorkout(null)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow ${activeBuddy.primaryColor} text-slate-950 uppercase tracking-wide cursor-pointer`}
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Bottom Tab Bar (Mobile/Frame Mode Only) */}
          {isMobileMode && (
            <div id="mobile-tab-bar" className="bg-slate-900 border-t border-slate-800 py-2.5 px-3 flex justify-around items-center z-40 relative">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`flex flex-col items-center space-y-1 transition-all ${
                  activeTab === "dashboard" ? "text-amber-500 scale-105 font-bold" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <Compass className="w-5 h-5" />
                <span className="text-[9px] font-semibold">Center</span>
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex flex-col items-center space-y-1 transition-all ${
                  activeTab === "chat" ? `${activeBuddy.primaryColor} scale-105 font-bold` : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <span className="text-[9px] font-semibold">Buddy</span>
              </button>
              <button
                onClick={() => setActiveTab("workout")}
                className={`flex flex-col items-center space-y-1 transition-all ${
                  activeTab === "workout" ? "text-amber-500 scale-105 font-bold" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <Dumbbell className="w-5 h-5" />
                <span className="text-[9px] font-semibold">Workout</span>
              </button>
              <button
                onClick={() => setActiveTab("journal")}
                className={`flex flex-col items-center space-y-1 transition-all ${
                  activeTab === "journal" ? "text-amber-500 scale-105 font-bold" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span className="text-[9px] font-semibold">Reflect</span>
              </button>
              <button
                onClick={() => setActiveTab("diet")}
                className={`flex flex-col items-center space-y-1 transition-all ${
                  activeTab === "diet" ? "text-amber-500 scale-105 font-bold" : "text-slate-500 hover:text-slate-400"
                }`}
              >
                <Apple className="w-5 h-5" />
                <span className="text-[9px] font-semibold">Diet</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Non-blocking in-app confirmation modal (Replaces window.confirm) */}
      {appConfirmModal && appConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4 animate-fade-in select-none">
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2 text-amber-500">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h4 id="modal-title" className="font-bold text-sm text-slate-100">{appConfirmModal.title}</h4>
              </div>
              <button
                onClick={() => setAppConfirmModal(null)}
                aria-label="Close modal"
                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{appConfirmModal.message}</p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setAppConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={appConfirmModal.onConfirm}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-400 text-slate-950 transition-colors shadow cursor-pointer"
              >
                {appConfirmModal.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      {/* Account Settings Modal */}
      <AccountSettingsModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onOpenMigration={() => setIsMigrationModalOpen(true)}
        hasLocalData={hasLocalGuestData}
      />

      {/* Consent-Based Data Migration Modal */}
      <MigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        onMigrationComplete={handleReloadCloudData}
        onExportBackup={handleExportData}
      />
    </MobileFrame>
  );
}
