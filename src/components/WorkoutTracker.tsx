import React, { useState, useEffect } from "react";
import { WorkoutSession, GymBuddy, Exercise, UserStats } from "../types";
import { WORKOUT_LIBRARY } from "../data";
import { useAuth } from "../context/AuthContext";
import { getUserCustomRoutines, saveCustomRoutine, deleteCustomRoutine } from "../services/firestoreService";
import { Play, Pause, Check, Flame, Clock, Award, ChevronRight, RefreshCw, Sparkles, Plus, AlertCircle, Trash2, RotateCcw, Target, Dumbbell, X, Save, Volume2 } from "lucide-react";

// Web Audio synthesizer for crisp rest interval completion chime
const playRestBeep = () => {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("vgb_sound_enabled") === "false") {
      return;
    }
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [659.25, 880, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.2);
    });
    setTimeout(() => { ctx.close().catch(() => {}); }, 700);
  } catch (err) {
    console.warn("Web Audio rest beep warning:", err);
  }
};

const parseRestSeconds = (str: string): number => {
  if (!str) return 45;
  const match = str.match(/\d+/);
  if (!match) return 45;
  const num = parseInt(match[0], 10);
  if (str.toLowerCase().includes("m")) {
    return num * 60;
  }
  return num;
};

interface WorkoutTrackerProps {
  selectedBuddy: GymBuddy;
  userStats: UserStats;
  onWorkoutCompleted: (session: WorkoutSession) => void;
  onUpdateStats: (weight: number, height: number) => void;
  workoutHistory?: WorkoutSession[];
  onDeleteWorkout?: (id: string) => void;
}

export default function WorkoutTracker({
  selectedBuddy,
  userStats,
  onWorkoutCompleted,
  onUpdateStats,
  workoutHistory = [],
  onDeleteWorkout
}: WorkoutTrackerProps) {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [caloriesEstimated, setCaloriesEstimated] = useState(0);
  const [activeTipIndex, setActiveTipIndex] = useState(0);

  // Sub-Tabs: "exact-log" | "ai-generator" | "library" | "custom-builder"
  const [trackerMode, setTrackerMode] = useState<"exact-log" | "ai-generator" | "library" | "custom-builder">("exact-log");

  // Rest Timer States
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [restTotalSeconds, setRestTotalSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restingExerciseName, setRestingExerciseName] = useState("");

  // In-App Confirmation Modal state (no browser alerts/confirms)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  // Custom AI Generator variables
  const [customTarget, setCustomTarget] = useState("Full Body");
  const [customDuration, setCustomDuration] = useState("20");
  const [customEquipment, setCustomEquipment] = useState("Bodyweight");
  const [customLevel, setCustomLevel] = useState("Intermediate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Custom Routine Builder states
  const [customRoutines, setCustomRoutines] = useState<WorkoutSession[]>(() => {
    const cached = localStorage.getItem("vgb_custom_routines");
    return cached ? JSON.parse(cached) : [];
  });

  useEffect(() => {
    let isCancelled = false;
    async function loadCustomRoutines() {
      if (user) {
        setCustomRoutines([]);
        try {
          const routines = await getUserCustomRoutines(user.uid);
          if (!isCancelled) {
            setCustomRoutines(routines);
          }
        } catch (e) {
          console.error("Failed to load user custom routines from Firestore", e);
        }
      } else {
        const cached = localStorage.getItem("vgb_custom_routines");
        setCustomRoutines(cached ? JSON.parse(cached) : []);
      }
    }
    loadCustomRoutines();
    return () => {
      isCancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user) {
      localStorage.setItem("vgb_custom_routines", JSON.stringify(customRoutines));
    }
  }, [customRoutines, user]);

  const [routineName, setRoutineName] = useState("");
  const [routineDuration, setRoutineDuration] = useState("25");
  const [routineCategory, setRoutineCategory] = useState("strength");
  const [routineExercises, setRoutineExercises] = useState<Exercise[]>([
    { name: "Incline Push-Ups", sets: 3, repsOrTime: "12 reps", rest: "45s", tip: "Maintain rigid spine and controlled tempo" },
    { name: "Bodyweight Air Squats", sets: 3, repsOrTime: "15 reps", rest: "45s", tip: "Drive up through heels with chest held high" }
  ]);
  const [builderSuccessMsg, setBuilderSuccessMsg] = useState(false);

  // Exact Scientific Manual Log Form states
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState("strength");
  const [manualDuration, setManualDuration] = useState("30");
  const [manualWeight, setManualWeight] = useState(userStats.weightKg.toString());
  const [manualHeight, setManualHeight] = useState(userStats.heightCm.toString());
  const [manualIntensity, setManualIntensity] = useState("moderate");
  const [manualError, setManualError] = useState<string | null>(null);

  // Rest Timer Interval effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isResting && restSecondsLeft > 0) {
      interval = setInterval(() => {
        setRestSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsResting(false);
            playRestBeep();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isResting, restSecondsLeft]);

  // Dismiss modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && confirmModal?.isOpen) {
        setConfirmModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmModal]);

  // Sync manual form's weight and height if userStats changes
  useEffect(() => {
    if (userStats) {
      setManualWeight(userStats.weightKg.toString());
      setManualHeight(userStats.heightCm.toString());
    }
  }, [userStats.weightKg, userStats.heightCm]);

  // Helper to determine MET value based on workout name/category
  const getMETForWorkout = (name: string): number => {
    const n = name.toLowerCase();
    if (n.includes("beast") || n.includes("blast") || n.includes("hiit") || n.includes("cardio") || n.includes("running") || n.includes("jog")) {
      return 8.5; // Vigorous cardio/HIIT
    }
    if (n.includes("yoga") || n.includes("stretching") || n.includes("recovery") || n.includes("flow")) {
      return 3.0; // Mild/Mindful activity
    }
    if (n.includes("hypertrophy") || n.includes("push") || n.includes("pull") || n.includes("strength") || n.includes("dumbbell") || n.includes("lifting") || n.includes("weight")) {
      return 5.5; // Vigorous resistance training
    }
    return 6.0; // General MET
  };

  // Active workout timer loop (calculating live calories from exact formula)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeSession && !activeSession.completed && !isPaused) {
      const activeMET = getMETForWorkout(activeSession.workoutName);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => {
          const nextSecs = prev + 1;
          // Standard MET formula: kcal per second = (MET * 3.5 * weightKg) / 200 / 60
          const rate = (activeMET * 3.5 * userStats.weightKg) / 200 / 60;
          setCaloriesEstimated(Math.round(nextSecs * rate));
          return nextSecs;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession, isPaused, userStats.weightKg]);

  // Rotate coaching tips in active mode every 12 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeSession && activeSession.exercises.length > 0) {
      interval = setInterval(() => {
        setActiveTipIndex((prev) => (prev + 1) % activeSession.exercises.length);
      }, 12000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeSession]);

  const handleStartWorkout = (template: WorkoutSession) => {
    const metVal = getMETForWorkout(template.workoutName);
    const initialCalories = Math.round((metVal * 3.5 * userStats.weightKg) / 200 * template.durationMinutes);

    // Clone template so state adjustments don't corrupt the static library
    const clonedSession: WorkoutSession = {
      ...template,
      id: "active-" + Date.now(),
      completed: false,
      caloriesBurned: initialCalories,
      exercises: template.exercises.map((e) => ({
        ...e,
        completedSets: Array(e.sets).fill(false)
      }))
    };
    setActiveSession(clonedSession);
    setIsPaused(false);
    setElapsedSeconds(0);
    setCaloriesEstimated(0);
    setActiveTipIndex(0);
  };

  const handleGenerateAIWorkout = async () => {
    setIsGenerating(true);
    setGenError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        try {
          const idToken = await user.getIdToken();
          if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
        } catch (tokenErr) {
          console.warn("Could not retrieve ID token:", tokenErr);
        }
      }

      const response = await fetch("/api/buddy/generate-workout", {
        method: "POST",
        headers,
        body: JSON.stringify({
          target: customTarget,
          durationMinutes: parseInt(customDuration) || 20,
          equipment: customEquipment,
          fitnessLevel: customLevel,
          buddyId: selectedBuddy.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Generation failed.");
      }

      const generatedMET = getMETForWorkout(data.workoutName);
      const generatedCalories = Math.round((generatedMET * 3.5 * userStats.weightKg) / 200 * (parseInt(customDuration) || 20));

      // Convert generated JSON to a WorkoutSession
      const generatedSession: WorkoutSession = {
        id: "gen-" + Date.now(),
        workoutName: `✨ AI Generated: ${data.workoutName}`,
        date: "Library",
        durationMinutes: parseInt(customDuration) || 20,
        caloriesBurned: generatedCalories,
        completed: false,
        exercises: data.exercises.map((e: any) => ({
          name: e.name,
          repsOrTime: e.repsOrTime,
          sets: e.sets || 3,
          rest: e.rest || "45s",
          tip: e.tip || "",
          completedSets: Array(e.sets || 3).fill(false)
         }))
      };

      // Auto-start the generated session
      setActiveSession(generatedSession);
      setIsPaused(false);
      setElapsedSeconds(0);
      setCaloriesEstimated(0);
      setActiveTipIndex(0);
    } catch (err: any) {
      console.error("Workout generation error:", err);
      setGenError(err.message || "Failed to contact AI generator. Please check your credentials.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSetCompleted = (exerciseIndex: number, setIndex: number) => {
    if (!activeSession) return;
    const updatedExercises = [...activeSession.exercises];
    const targetEx = updatedExercises[exerciseIndex];
    if (targetEx.completedSets) {
      const newSets = [...targetEx.completedSets];
      const willBeCompleted = !newSets[setIndex];
      newSets[setIndex] = willBeCompleted;
      targetEx.completedSets = newSets;

      // Start rest interval countdown when completing a set
      if (willBeCompleted) {
        const secs = parseRestSeconds(targetEx.rest) || 45;
        setRestSecondsLeft(secs);
        setRestTotalSeconds(secs);
        setIsResting(true);
        setRestingExerciseName(targetEx.name);
      }
    }
    setActiveSession({
      ...activeSession,
      exercises: updatedExercises
    });
  };

  const handleCompleteWorkout = () => {
    if (!activeSession) return;
    
    const minutesSpent = Math.ceil(elapsedSeconds / 60) || 1;
    const finalCalories = caloriesEstimated || 50;

    let finalFeedback = "";
    if (selectedBuddy.id === "marcus") {
      finalFeedback = `Marcus: Absolute BEAST workout today! You logged ${minutesSpent} minutes and incinerated exactly ${finalCalories} kcal calculated scientifically from your bodyweight. Proud of your effort. Keep pushing! ⚡`;
    } else if (selectedBuddy.id === "aria") {
      finalFeedback = `Aria: Beautiful session today. Your breath and muscular control were perfect over these ${minutesSpent} minutes. Honor your body's effort of ${finalCalories} kcal and stay hydrated. 🌸`;
    } else {
      finalFeedback = `Jax: Optimal mechanical tension achieved over ${minutesSpent} min. Sarcoplasmic response estimated at peak. Caloric dissipation logged precisely at ${finalCalories} kcal. Proceed to clean carbohydrate-protein integration. 🧬`;
    }

    const finalizedSession: WorkoutSession = {
      ...activeSession,
      completed: true,
      durationMinutes: minutesSpent,
      caloriesBurned: finalCalories,
      buddyFeedback: finalFeedback,
      date: new Date().toLocaleDateString([], { month: "short", day: "numeric" })
    };

    onWorkoutCompleted(finalizedSession);
    setActiveSession(null);
    setIsFocusMode(false);
    setIsResting(false);
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Exact Manual Logging calculations based on MET values
  const getMETForType = (type: string): number => {
    switch (type) {
      case "hiit": return 8.5;
      case "cardio": return 8.0;
      case "strength": return 5.5;
      case "aerobics": return 6.5;
      case "yoga": return 3.0;
      case "low": return 2.5;
      default: return 6.0;
    }
  };

  const getIntensityMultiplier = (intensity: string): number => {
    switch (intensity) {
      case "light": return 0.75;
      case "vigorous": return 1.25;
      default: return 1.0;
    }
  };

  const currentWeightVal = parseFloat(manualWeight) || userStats.weightKg || 78;
  const currentHeightVal = parseFloat(manualHeight) || userStats.heightCm || 180;
  const currentDurationVal = parseFloat(manualDuration) || 0;
  const currentMET = getMETForType(manualType);
  const currentIntensityMult = getIntensityMultiplier(manualIntensity);

  // MET Formula: Calories = (MET * IntensityMultiplier * 3.5 * weightKg) / 200 * durationMinutes
  const calculatedCalories = Math.round(
    ((currentMET * currentIntensityMult * 3.5 * currentWeightVal) / 200) * currentDurationVal
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentDurationVal <= 0) {
      setManualError("Please enter a valid workout duration of at least 1 minute.");
      return;
    }
    setManualError(null);

    // 1. Update physical stats in parent component
    onUpdateStats(currentWeightVal, currentHeightVal);

    // 2. Generate customized analytical feedback
    let finalFeedback = "";
    if (selectedBuddy.id === "marcus") {
      finalFeedback = `Marcus: Precise stats, Champ! At your weight of ${currentWeightVal} kg, logging ${currentDurationVal} mins of ${manualName || manualType} incinerated EXACTLY ${calculatedCalories} kcal! Beast energy, locked in! ⚡`;
    } else if (selectedBuddy.id === "aria") {
      finalFeedback = `Aria: Beautiful mindfulness, dear. Your physical stats have been synchronized. At ${currentWeightVal} kg, this ${currentDurationVal}-minute session achieved a precise metabolic cost of ${calculatedCalories} kcal. 🌸`;
    } else {
      finalFeedback = `Jax: Empirical calculation absolute. Mass profile: ${currentWeightVal} kg. Metabolic equivalent value: ${currentMET * currentIntensityMult} METs. Duration coefficient: ${currentDurationVal} min. Energy dissipation exactly computed: ${calculatedCalories} kcal. 🧬`;
    }

    const manualSession: WorkoutSession = {
      id: "manual-" + Date.now(),
      workoutName: manualName.trim() || `${manualType.toUpperCase()} Session`,
      date: new Date().toLocaleDateString([], { month: "short", day: "numeric" }),
      durationMinutes: currentDurationVal,
      caloriesBurned: calculatedCalories,
      completed: true,
      exercises: [],
      buddyFeedback: finalFeedback
    };

    onWorkoutCompleted(manualSession);
    setManualName("");
  };

  // Routine Builder Helpers
  const handleAddRoutineExercise = () => {
    setRoutineExercises(prev => [
      ...prev,
      { name: "New Exercise", sets: 3, repsOrTime: "10 reps", rest: "45s", tip: "Maintain proper posture throughout" }
    ]);
  };

  const handleUpdateRoutineExercise = (idx: number, field: keyof Exercise, value: any) => {
    setRoutineExercises(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleRemoveRoutineExercise = (idx: number) => {
    setRoutineExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const handleStartCustomRoutine = (asTemplateOnly: boolean = false) => {
    const finalName = routineName.trim() || "My Custom Circuit";
    const durationMins = parseInt(routineDuration) || 25;
    const met = getMETForType(routineCategory);
    const estCals = Math.round((met * 3.5 * userStats.weightKg) / 200 * durationMins);

    const newSession: WorkoutSession = {
      id: "custom-" + Date.now(),
      workoutName: `🎯 ${finalName}`,
      date: "Custom",
      durationMinutes: durationMins,
      caloriesBurned: estCals,
      completed: false,
      exercises: routineExercises.map(ex => ({
        ...ex,
        completedSets: Array(ex.sets || 3).fill(false)
      }))
    };

    if (asTemplateOnly) {
      setCustomRoutines(prev => [newSession, ...prev]);
      if (user) {
        saveCustomRoutine(user.uid, newSession).catch((err) => {
          console.error("Failed to save custom routine to Firestore:", err);
        });
      }
      setBuilderSuccessMsg(true);
      setTimeout(() => setBuilderSuccessMsg(false), 2500);
    } else {
      setActiveSession(newSession);
      setIsPaused(false);
      setElapsedSeconds(0);
      setCaloriesEstimated(0);
      setActiveTipIndex(0);
      setIsResting(false);
    }
  };

  return (
    <div id="workout-tab-container" className="h-full bg-slate-950 flex flex-col">
      {activeSession ? (
        /* Immersive Workout Session Mode Screen */
        <div
          id="active-session-viewport"
          className={`flex-1 flex flex-col p-4 relative ${
            isFocusMode ? "items-center justify-center min-h-full bg-transparent" : "bg-slate-950"
          }`}
        >
          {isFocusMode && (
            <div
              id="focus-session-dimming-overlay"
              className="fixed inset-0 bg-slate-950/85 backdrop-blur-[4px] z-[45] pointer-events-auto cursor-pointer transition-all duration-300 animate-fade-in"
              onClick={() => setIsFocusMode(false)}
            />
          )}

          <div
            className={`w-full flex-1 flex flex-col ${
              isFocusMode
                ? "relative z-50 bg-slate-950 border border-slate-800 p-5 rounded-2xl shadow-2xl max-w-lg mx-auto my-auto overflow-y-auto scrollbar-thin max-h-[90vh]"
                : ""
            }`}
          >
            {/* Header Banner */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-500 flex items-center space-x-1 animate-pulse">
                  <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? "bg-amber-400" : "bg-emerald-400"} inline-block`}></span>
                  <span>{isPaused ? "Session Paused" : "Active Session"}</span>
                </span>
                <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">{activeSession.workoutName}</h3>
              </div>
              
              <div className="flex items-center space-x-1.5">
                {/* Pause / Resume Button */}
                <button
                  type="button"
                  onClick={() => setIsPaused(!isPaused)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isPaused
                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:text-slate-100 hover:border-slate-700"
                  }`}
                  title={isPaused ? "Resume workout" : "Pause workout"}
                >
                  {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                  <span>{isPaused ? "Resume" : "Pause"}</span>
                </button>

                <button
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    isFocusMode
                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/10"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                  }`}
                  title="Toggle Focus Session Overlay"
                >
                  <Target className={`w-3.5 h-3.5 ${isFocusMode ? "animate-pulse text-slate-950" : "text-amber-500"}`} />
                  <span>Focus</span>
                </button>

                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: "Quit Current Session?",
                      message: "Are you sure you want to quit this workout? Any unlogged active progress will be lost.",
                      confirmLabel: "Quit Workout",
                      onConfirm: () => {
                        setActiveSession(null);
                        setIsFocusMode(false);
                        setIsResting(false);
                        setIsPaused(false);
                        setConfirmModal(null);
                      }
                    });
                  }}
                  className="px-2.5 py-1 text-slate-400 hover:text-red-400 hover:bg-slate-900 border border-slate-800 hover:border-red-950 rounded-lg text-xs transition-all cursor-pointer"
                >
                  Quit
                </button>
              </div>
            </div>

            {/* Core Telemetry Widgets */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div
                onClick={() => setIsPaused(!isPaused)}
                className={`bg-slate-900 border rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer ${
                  isPaused ? "border-amber-500/50 bg-amber-950/10" : "border-slate-800/80 hover:border-slate-700"
                }`}
                title={isPaused ? "Click to resume workout" : "Click to pause workout"}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-lg ${isPaused ? "bg-amber-500 text-slate-950" : "bg-slate-950 text-amber-500"}`}>
                    {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Clock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Active Time</p>
                      {isPaused && (
                        <span className="text-[8px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.2 rounded font-bold">
                          PAUSED
                        </span>
                      )}
                    </div>
                    <p className="text-lg font-mono font-bold text-slate-100">{formatTimer(elapsedSeconds)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 flex items-center space-x-3">
                <div className="p-2.5 bg-slate-950 rounded-lg text-red-500">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">Est. Burn</p>
                  <p className="text-lg font-mono font-bold text-slate-100">{caloriesEstimated} kcal</p>
                </div>
              </div>
            </div>

            {/* Companion Guidance Ticker */}
            {activeSession.exercises.length > 0 && (
              <div className={`mb-3.5 p-3 rounded-xl bg-slate-900 border ${selectedBuddy.borderColor} flex items-start space-x-3 relative overflow-hidden group`}>
                <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-tr ${selectedBuddy.gradient} opacity-5 blur-xl`}></div>
                <div className="text-xl p-1 bg-slate-950 rounded-lg flex-shrink-0 shadow">
                  {selectedBuddy.avatarUrl}
                </div>
                <div className="flex-1">
                  <span className="text-[9px] uppercase font-bold text-slate-400">Live {selectedBuddy.name} Correction Tips</span>
                  <p className="text-xs text-slate-200 font-medium leading-relaxed mt-0.5">
                    "{activeSession.exercises[activeTipIndex]?.tip || "Focus on deep controlled movements!"}"
                  </p>
                </div>
              </div>
            )}

            {/* Interactive Rest Interval Countdown Timer */}
            {isResting && (
              <div className="mb-4 bg-gradient-to-r from-amber-500/15 via-slate-900 to-amber-500/10 border border-amber-500/40 rounded-2xl p-3.5 shadow-xl animate-fade-in relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs animate-pulse shadow">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[9px] uppercase font-bold tracking-widest text-amber-400">Rest Interval</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                      </div>
                      <p className="text-[11px] text-slate-200 font-semibold line-clamp-1">
                        Recover before next set of {restingExerciseName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-mono font-black text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]">
                      {formatTimer(restSecondsLeft)}
                    </span>
                  </div>
                </div>

                {/* Smooth Progress Bar */}
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800/80 my-2">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.7)]"
                    style={{ width: `${restTotalSeconds > 0 ? (restSecondsLeft / restTotalSeconds) * 100 : 0}%` }}
                  />
                </div>

                {/* Rest Controls */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => setRestSecondsLeft(s => Math.max(5, s - 15))}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 text-[10px] font-semibold transition-all cursor-pointer"
                    >
                      -15s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRestSecondsLeft(s => s + 15);
                        setRestTotalSeconds(t => t + 15);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 text-[10px] font-semibold transition-all cursor-pointer"
                    >
                      +15s
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsResting(false);
                      setRestSecondsLeft(0);
                    }}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer shadow"
                  >
                    Skip Rest
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Set Checklist Area */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 scrollbar-thin">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Exercise Breakdown</h4>
              {activeSession.exercises.map((ex, exIdx) => {
                const allSetsDone = ex.completedSets?.every(s => s) || false;
                return (
                  <div
                    key={exIdx}
                    className={`bg-slate-900/60 border rounded-xl p-3.5 transition-all ${
                      allSetsDone ? "border-emerald-950/60 bg-emerald-950/5" : "border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h5 className={`text-xs font-semibold ${allSetsDone ? "text-emerald-400 line-through" : "text-slate-100"}`}>
                          {ex.name}
                        </h5>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Target: {ex.repsOrTime} • {ex.sets} Sets • Rest: {ex.rest}
                        </p>
                      </div>
                      {allSetsDone && (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-900">
                          Exercise Completed
                        </span>
                      )}
                    </div>

                    {/* Interactive set checkboxes */}
                    <div className="flex items-center space-x-2 mt-3">
                      <span className="text-[10px] text-slate-500 mr-1 font-medium">Log Sets:</span>
                      {ex.completedSets?.map((isDone, setIdx) => (
                        <button
                          key={setIdx}
                          onClick={() => toggleSetCompleted(exIdx, setIdx)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold transition-all border ${
                            isDone
                              ? "bg-emerald-500 border-emerald-400 text-slate-950 scale-105"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : `S${setIdx + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Complete Active Session CTA */}
            <button
              onClick={handleCompleteWorkout}
              className={`w-full py-3.5 rounded-2xl font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center space-x-2 ${
                selectedBuddy.primaryColor
              } text-slate-950 hover:opacity-95 active:scale-95`}
            >
              <Award className="w-4 h-4 stroke-[2.5]" />
              <span>Finish Workout & Log Data</span>
            </button>
          </div>
        </div>
      ) : (
        /* Workout Setup Hub with Selector Tabs */
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* Stunning Welcome/Empty Workout State Header Illustration */}
          <div className="px-4 pt-4">
            <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-850 p-4 rounded-2xl flex items-center justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-10 blur-xl"></div>
              <div className="relative z-10 flex-1 pr-4">
                <h3 className="text-xs font-extrabold text-slate-100 uppercase tracking-wider">Ready to Train?</h3>
                <p className="text-[10px] text-slate-450 mt-1 max-w-[210px] leading-relaxed">
                  Select an option below to calculate metabolic cost, generate a custom bio-plan with {selectedBuddy.name}, or run preset exercises.
                </p>
              </div>
              
              <div className="w-16 h-16 flex items-center justify-center relative shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_12px_rgba(245,158,11,0.22)]">
                  <defs>
                    <linearGradient id="dbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#94a3b8" />
                      <stop offset="100%" stopColor="#475569" />
                    </linearGradient>
                  </defs>
                  
                  {/* Energy speed circles */}
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="50" cy="50" r="28" fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.15" />
                  
                  {/* Energy Lightning / Flame behind */}
                  <path d="M50,15 L58,35 L42,35 L50,15 Z" fill="#f59e0b" opacity="0.1" />
                  <path d="M50,85 L58,65 L42,65 L50,85 Z" fill="#f59e0b" opacity="0.1" />
                  
                  {/* The Dumbbell bar */}
                  <rect x="25" y="47" width="50" height="6" rx="3" fill="url(#barGrad)" />
                  <rect x="35" y="45" width="30" height="10" rx="1" fill="none" stroke="#64748b" strokeWidth="1" opacity="0.5" />
                  
                  {/* Left plates */}
                  <rect x="18" y="32" width="6" height="36" rx="2" fill="url(#dbGrad)" />
                  <rect x="12" y="38" width="5" height="24" rx="2.5" fill="#b45309" />
                  <rect x="24" y="41" width="3" height="18" rx="1.5" fill="#f59e0b" />
                  
                  {/* Right plates */}
                  <rect x="76" y="32" width="6" height="36" rx="2" fill="url(#dbGrad)" />
                  <rect x="83" y="38" width="5" height="24" rx="2.5" fill="#b45309" />
                  <rect x="73" y="41" width="3" height="18" rx="1.5" fill="#f59e0b" />
                  
                  {/* Accent Sparkles */}
                  <path d="M 22 25 L 24 28 L 27 29 L 24 30 L 22 33 L 20 30 L 17 29 L 20 28 Z" fill="#fef08a" />
                  <path d="M 78 70 L 80 73 L 83 74 L 80 75 L 78 78 L 76 75 L 73 74 L 76 73 Z" fill="#fef08a" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Section: Selector Tabs for tracker mode */}
          <div className="px-4 pt-4 pb-1">
            <div className="grid grid-cols-4 bg-slate-900 border border-slate-850 p-1 rounded-xl gap-1">
              <button
                onClick={() => setTrackerMode("exact-log")}
                className={`py-1.5 text-center rounded-lg text-[9px] font-bold tracking-wide uppercase transition-all flex items-center justify-center space-x-1 ${
                  trackerMode === "exact-log"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Award className="w-3 h-3" />
                <span className="truncate">Calculator</span>
              </button>
              <button
                onClick={() => setTrackerMode("ai-generator")}
                className={`py-1.5 text-center rounded-lg text-[9px] font-bold tracking-wide uppercase transition-all flex items-center justify-center space-x-1 ${
                  trackerMode === "ai-generator"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span className="truncate">AI Coach</span>
              </button>
              <button
                onClick={() => setTrackerMode("custom-builder")}
                className={`py-1.5 text-center rounded-lg text-[9px] font-bold tracking-wide uppercase transition-all flex items-center justify-center space-x-1 ${
                  trackerMode === "custom-builder"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Dumbbell className="w-3 h-3" />
                <span className="truncate">Builder</span>
              </button>
              <button
                onClick={() => setTrackerMode("library")}
                className={`py-1.5 text-center rounded-lg text-[9px] font-bold tracking-wide uppercase transition-all flex items-center justify-center space-x-1 ${
                  trackerMode === "library"
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Play className="w-3 h-3" />
                <span className="truncate">Templates</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
            
            {/* MODE 1: Scientific Precise Calculator Form */}
            {trackerMode === "exact-log" && (
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden">
                <div className="flex items-center space-x-2.5 mb-3">
                  <div className="p-2 bg-slate-950 rounded-xl text-amber-500 shadow">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Scientific Calorie Calculator</h3>
                    <p className="text-[10px] text-slate-400">Zero random estimates. Computes metabolic cost from weight & MET values.</p>
                  </div>
                </div>

                {manualError && (
                  <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-200 mb-2 flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{manualError}</span>
                  </div>
                )}

                <form onSubmit={handleManualSubmit} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Workout Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Morning Jog, Leg Day, Core Blast"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Exercise Type (MET)</label>
                      <select
                        value={manualType}
                        onChange={(e) => setManualType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                      >
                        <option value="hiit">HIIT / Circuit (8.5 MET)</option>
                        <option value="cardio">Cardio / Jogging (8.0 MET)</option>
                        <option value="aerobics">Aerobics / Dance (6.5 MET)</option>
                        <option value="strength">Strength / Weights (5.5 MET)</option>
                        <option value="yoga">Yoga / Stretch (3.0 MET)</option>
                        <option value="low">Walking / Easy (2.5 MET)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Duration (mins)</label>
                      <input
                        type="number"
                        min="1"
                        max="300"
                        value={manualDuration}
                        onChange={(e) => setManualDuration(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-slate-700"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Your Weight (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="20"
                        max="300"
                        value={manualWeight}
                        onChange={(e) => setManualWeight(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-slate-700"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Your Height (cm)</label>
                      <input
                        type="number"
                        min="50"
                        max="280"
                        value={manualHeight}
                        onChange={(e) => setManualHeight(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-slate-700"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[8px] uppercase font-extrabold text-slate-500 mb-1 tracking-wider">Exertion Intensity</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {["light", "moderate", "vigorous"].map((intensity) => (
                        <button
                          key={intensity}
                          type="button"
                          onClick={() => setManualIntensity(intensity)}
                          className={`py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${
                            manualIntensity === intensity
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/60"
                              : "bg-slate-950 border-slate-850 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {intensity === "light" ? "Light (0.75x)" : intensity === "moderate" ? "Moderate (1x)" : "Vigorous (1.25x)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scientific Calculation Preview Window */}
                  <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 mt-4 space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-900 pb-1.5">
                      <span>Metabolic Formula</span>
                      <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-[8px] text-slate-500">
                        MET × Intensity × 3.5 × Wt(kg) ÷ 200 × Min
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>
                        MET Rate: <span className="text-slate-200 font-bold font-mono">{currentMET * currentIntensityMult} METs</span>
                      </div>
                      <div>
                        Mass Input: <span className="text-slate-200 font-bold font-mono">{currentWeightVal} kg</span>
                      </div>
                      <div>
                        Calculated Burn: <span className="text-slate-200 font-bold font-mono">~{Math.round(((currentMET * currentIntensityMult * 3.5 * currentWeightVal) / 200) * 10) / 10} kcal/min</span>
                      </div>
                      <div>
                        Duration: <span className="text-slate-200 font-bold font-mono">{currentDurationVal} mins</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-900 flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-300 uppercase">Exact Energy Burned:</span>
                      <span className="text-base font-mono font-extrabold text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                        +{calculatedCalories} kcal
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs tracking-wider uppercase rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    Submit Details & Log Workout
                  </button>
                </form>
              </div>
            )}

            {/* MODE 2: Custom AI Routine Generator Form */}
            {trackerMode === "ai-generator" && (
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden group">
                <div className={`absolute top-0 right-0 w-28 h-28 bg-gradient-to-tr ${selectedBuddy.gradient} opacity-5 blur-2xl`}></div>
                <div className="flex items-center space-x-2 mb-3.5">
                  <div className="p-1.5 rounded-lg bg-slate-950 text-amber-500 shadow">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-100 flex items-center space-x-1.5">
                      <span>Custom AI Gym Coach Generator</span>
                      <span className="text-[8px] bg-amber-500/10 text-amber-500 font-bold px-1 py-0.5 rounded border border-amber-950">
                        GEMINI 2.5 FLASH
                      </span>
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Custom routines designed in real time by {selectedBuddy.name}</p>
                  </div>
                </div>

                {/* Form grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Target Area</label>
                    <select
                      value={customTarget}
                      onChange={(e) => setCustomTarget(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                    >
                      <option>Full Body</option>
                      <option>Chest & Arms</option>
                      <option>Legs & Glutes</option>
                      <option>Abs & Core</option>
                      <option>Back & Pull Day</option>
                      <option>Cardio & Endurance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Duration</label>
                    <select
                      value={customDuration}
                      onChange={(e) => setCustomDuration(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                    >
                      <option value="15">15 Minutes</option>
                      <option value="20">20 Minutes</option>
                      <option value="30">30 Minutes</option>
                      <option value="45">45 Minutes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Equipment</label>
                    <select
                      value={customEquipment}
                      onChange={(e) => setCustomEquipment(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                    >
                      <option>Bodyweight Only</option>
                      <option>Dumbbells & Bench</option>
                      <option>Resistance Bands</option>
                      <option>Full Gym Equipment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Fitness Level</label>
                    <select
                      value={customLevel}
                      onChange={(e) => setCustomLevel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                    >
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced Athlete</option>
                    </select>
                  </div>
                </div>

                {genError && (
                  <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-200 mb-3 flex items-start space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    <p>{genError}</p>
                  </div>
                )}

                {/* Trigger CTA */}
                <button
                  onClick={handleGenerateAIWorkout}
                  disabled={isGenerating}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all shadow flex items-center justify-center space-x-1.5 bg-gradient-to-r ${
                    selectedBuddy.gradient
                  } text-slate-950 font-bold hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Configuring custom bio-plan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                      <span>Create & Start AI Workout</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* MODE 3: Custom Routine Builder */}
            {trackerMode === "custom-builder" && (
              <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-slate-950 rounded-xl text-amber-500 shadow">
                    <Dumbbell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">Custom Routine Builder</h3>
                    <p className="text-[10px] text-slate-400">Design your own circuit, set exact exercises, reps, and rest timers.</p>
                  </div>
                </div>

                {builderSuccessMsg && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-[10px] text-emerald-300 flex items-center space-x-1.5 animate-pulse">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Custom workout routine saved to Templates!</span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Routine Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Upper Body Hypertrophy, Core Crusher"
                      value={routineName}
                      onChange={(e) => setRoutineName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Est. Duration (mins)</label>
                      <input
                        type="number"
                        min="5"
                        max="180"
                        value={routineDuration}
                        onChange={(e) => setRoutineDuration(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-bold text-slate-500 mb-1">Workout Type</label>
                      <select
                        value={routineCategory}
                        onChange={(e) => setRoutineCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                      >
                        <option value="strength">Strength & Weights (5.5 MET)</option>
                        <option value="hiit">HIIT & Circuit (8.5 MET)</option>
                        <option value="cardio">Cardio & Endurance (8.0 MET)</option>
                        <option value="aerobics">Aerobics / Bodyweight (6.5 MET)</option>
                        <option value="yoga">Yoga & Mobility (3.0 MET)</option>
                      </select>
                    </div>
                  </div>

                  {/* Exercises Checklist */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Exercise List ({routineExercises.length})</span>
                      <button
                        type="button"
                        onClick={handleAddRoutineExercise}
                        className="text-[10px] text-amber-500 hover:text-amber-400 font-bold flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Exercise</span>
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                      {routineExercises.map((ex, idx) => (
                        <div key={idx} className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={ex.name}
                              onChange={(e) => handleUpdateRoutineExercise(idx, "name", e.target.value)}
                              placeholder="Exercise Name"
                              className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none"
                            />
                            {routineExercises.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRoutineExercise(idx)}
                                className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                title="Remove exercise"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="text-[7px] uppercase font-bold text-slate-500 block">Sets</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={ex.sets}
                                onChange={(e) => handleUpdateRoutineExercise(idx, "sets", parseInt(e.target.value) || 3)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-slate-200 font-mono"
                              />
                            </div>
                            <div>
                              <span className="text-[7px] uppercase font-bold text-slate-500 block">Reps / Time</span>
                              <input
                                type="text"
                                value={ex.repsOrTime}
                                onChange={(e) => handleUpdateRoutineExercise(idx, "repsOrTime", e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-slate-200"
                              />
                            </div>
                            <div>
                              <span className="text-[7px] uppercase font-bold text-slate-500 block">Rest Timer</span>
                              <input
                                type="text"
                                value={ex.rest}
                                onChange={(e) => handleUpdateRoutineExercise(idx, "rest", e.target.value)}
                                placeholder="45s"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] text-slate-200 font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleStartCustomRoutine(true)}
                      className="py-2.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save as Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStartCustomRoutine(false)}
                      className="py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center space-x-1.5 transition-all shadow cursor-pointer active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Workout Now</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODE 4: Library Workout templates with exact real-time MET preview */}
            {trackerMode === "library" && (
              <div className="space-y-3">
                {/* Custom user templates section if any */}
                {customRoutines.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <h4 className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Your Custom Templates</h4>
                    {customRoutines.map((w) => (
                      <div
                        key={w.id}
                        className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <h5 className="text-xs font-semibold text-slate-100 group-hover:text-amber-500 transition-colors">
                                {w.workoutName}
                              </h5>
                              <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-900/60">
                                Custom
                              </span>
                            </div>
                            <div className="flex items-center space-x-2.5 text-[10px] text-slate-400 mt-1">
                              <span className="flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                <span>{w.durationMinutes} mins</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <Flame className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-semibold text-slate-300">~{w.caloriesBurned} kcal</span>
                              </span>
                              <span>• {w.exercises.length} Exercises</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: "Delete Custom Routine?",
                                  message: `Are you sure you want to delete "${w.workoutName}"? This routine template will be permanently removed.`,
                                  confirmLabel: "Delete Template",
                                  onConfirm: () => {
                                    setCustomRoutines(prev => prev.filter(r => r.id !== w.id));
                                    if (user) {
                                      deleteCustomRoutine(user.uid, w.id).catch((err) => {
                                        console.error("Failed to delete custom routine from Firestore:", err);
                                      });
                                    }
                                    setConfirmModal(null);
                                  }
                                });
                              }}
                              aria-label={`Delete custom routine ${w.workoutName}`}
                              className="p-2 rounded-lg bg-slate-950 border border-slate-850 text-slate-500 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleStartWorkout(w)}
                              aria-label={`Start workout ${w.workoutName}`}
                              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-500 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 transition-all shadow"
                            >
                              <Play className="w-4 h-4 fill-current stroke-[2]" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Workout Library Templates</h4>
                {WORKOUT_LIBRARY.map((w) => {
                  const met = getMETForWorkout(w.workoutName);
                  const exactKcal = Math.round((met * 3.5 * userStats.weightKg) / 200 * w.durationMinutes);
                  return (
                    <div
                      key={w.id}
                      className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 transition-all group hover:bg-slate-900"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h5 className="text-xs font-semibold text-slate-100 group-hover:text-amber-500 transition-colors">
                            {w.workoutName}
                          </h5>
                          <div className="flex items-center space-x-2.5 text-[10px] text-slate-400 mt-1">
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span>{w.durationMinutes} mins</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Flame className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-semibold text-slate-300">{exactKcal} kcal</span>
                              <span className="text-[8px] text-slate-500">({met} MET)</span>
                            </span>
                            <span>• {w.exercises.length} Exercises</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => handleStartWorkout(w)}
                          aria-label={`Start workout template ${w.workoutName}`}
                          className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-500 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 transition-all shadow"
                        >
                          <Play className="w-4 h-4 fill-current stroke-[2]" />
                        </button>
                      </div>

                      {/* Exercises Preview Ticker */}
                      <div className="mt-3 pt-2.5 border-t border-slate-850/50">
                        <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wide mb-1.5">Focus Exercises:</p>
                        <div className="flex flex-wrap gap-1">
                          {w.exercises.slice(0, 3).map((ex, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-850 text-[10px]"
                            >
                              {ex.name}
                            </span>
                          ))}
                          {w.exercises.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-850 text-[10px]">
                              +{w.exercises.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Section: Completed Workouts Log History inside Workout Tab */}
            <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-1">
                <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Completed Workout Logs</h4>
                <span className="text-[10px] text-slate-500 font-mono">Sessions: {workoutHistory.length}</span>
              </div>

              {workoutHistory.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
                  {workoutHistory.map((h, idx) => (
                    <div key={h.id || idx} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex justify-between items-center text-xs gap-3 hover:border-slate-800 transition-all">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          <Flame className="w-3.5 h-3.5 text-amber-500" />
                          <p className="font-semibold text-slate-200 truncate">{h.workoutName}</p>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {h.date} • {h.durationMinutes} mins • {h.exercises.length || 0} exercises
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="font-mono font-bold text-amber-500">+{h.caloriesBurned} kcal</span>
                        {onDeleteWorkout && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: "Delete Workout Session?",
                                message: `Are you sure you want to delete "${h.workoutName}" from history? This action cannot be undone.`,
                                confirmLabel: "Delete Entry",
                                onConfirm: () => {
                                  onDeleteWorkout(h.id);
                                  setConfirmModal(null);
                                }
                              });
                            }}
                            aria-label={`Delete ${h.workoutName} from history`}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-900 transition-all cursor-pointer"
                            title="Delete workout entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 px-3 text-center flex flex-col items-center justify-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
                    <Flame className="w-5 h-5 text-amber-500/50" />
                  </div>
                  <p className="text-xs font-semibold text-slate-300">No session records found</p>
                  <p className="text-[10px] text-slate-500 max-w-[220px]">
                    Calculate a workout, build a custom circuit, or run a template above to log your first session.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sleek In-App Confirmation Modal (Replaces browser window.confirm) */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in select-none">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2 text-amber-500">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h4 id="confirm-modal-title" className="font-bold text-sm text-slate-100">{confirmModal.title}</h4>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                aria-label="Close modal"
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{confirmModal.message}</p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-400 text-slate-950 transition-colors shadow"
              >
                {confirmModal.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
