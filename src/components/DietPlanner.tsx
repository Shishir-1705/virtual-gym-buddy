import React, { useState } from "react";
import { MealLog, GymBuddy, UserStats } from "../types";
import { useAuth } from "../context/AuthContext";
import { Coffee, GlassWater, Plus, Sparkles, RefreshCw, ShoppingBag, Carrot, BrainCircuit, Trash2, ArrowRight, Check, Utensils } from "lucide-react";

interface DietPlannerProps {
  selectedBuddy: GymBuddy;
  userStats: UserStats;
  mealLogs: MealLog[];
  onAddMeal: (meal: MealLog) => void;
  onDeleteMeal: (id: string) => void;
  onLogWater: (amountMl: number) => void;
}

export interface AIDietPlan {
  dailyCalories: number;
  macros: { protein: number; carbs: number; fat: number };
  meals: { time: string; name: string; description: string; macros: string }[];
  groceryList: string[];
}

export default function DietPlanner({
  selectedBuddy,
  userStats,
  mealLogs,
  onAddMeal,
  onDeleteMeal,
  onLogWater
}: DietPlannerProps) {
  const { user } = useAuth();
  const [mealName, setMealName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  // AI Diet Recommendation States
  const [dietaryPreference, setDietaryPreference] = useState("High Protein");
  const [weightGoal, setWeightGoal] = useState("Muscle Gain");
  const [aiPlan, setAiPlan] = useState<AIDietPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);

  // AI Remaining Calorie Meal Suggestions States
  const [remainingPlan, setRemainingPlan] = useState<{
    suggestedMeals: {
      time: string;
      name: string;
      calories: number;
      macros: { protein: number; carbs: number; fat: number };
      description: string;
      buddyTip: string;
    }[];
    totalCalories: number;
    buddyMotivation: string;
  } | null>(null);
  const [isGeneratingRemaining, setIsGeneratingRemaining] = useState(false);
  const [remainingApiErr, setRemainingApiErr] = useState<string | null>(null);
  const [addedMealIds, setAddedMealIds] = useState<Record<string, boolean>>({});

  // Totals calculations
  const totalCaloriesLogged = mealLogs.reduce((acc, curr) => acc + curr.calories, 0);
  const totalProteinLogged = mealLogs.reduce((acc, curr) => acc + curr.proteinG, 0);
  const totalCarbsLogged = mealLogs.reduce((acc, curr) => acc + curr.carbsG, 0);
  const totalFatLogged = mealLogs.reduce((acc, curr) => acc + curr.fatG, 0);

  const handleAddMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mealName.trim() || !calories) return;

    const newMeal: MealLog = {
      id: "m-" + Date.now(),
      name: mealName,
      calories: parseInt(calories) || 0,
      proteinG: parseInt(protein) || 0,
      carbsG: parseInt(carbs) || 0,
      fatG: parseInt(fat) || 0,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    onAddMeal(newMeal);
    setMealName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
  };

  const calculateBMI = () => {
    const heightM = userStats.heightCm / 100;
    if (heightM <= 0) return 22.0;
    return (userStats.weightKg / (heightM * heightM)).toFixed(1);
  };

  const handleGenerateDietPlan = async () => {
    setIsGenerating(true);
    setApiErr(null);
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

      const response = await fetch("/api/buddy/generate-diet-plan", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userGoal: weightGoal,
          dietaryPreference,
          weightKg: userStats.weightKg,
          heightCm: userStats.heightCm,
          bmi: calculateBMI(),
          buddyId: selectedBuddy.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Could not generate nutrition plan.");
      }

      setAiPlan(data);
    } catch (err: any) {
      console.error("Diet generation error:", err);
      setApiErr(err.message || "Failed to generate AI plan. Verify that your API keys are registered.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateRemainingMeals = async () => {
    setIsGeneratingRemaining(true);
    setRemainingApiErr(null);
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

      const remainingCalories = Math.max(0, userStats.targetCalories - totalCaloriesLogged);
      const response = await fetch("/api/buddy/generate-remaining-meals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          userGoal: userStats.goal || "Stay active & healthy",
          remainingCalories: remainingCalories,
          weightKg: userStats.weightKg,
          heightCm: userStats.heightCm,
          dietaryPreference,
          buddyId: selectedBuddy.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || "Could not generate remaining budget meal plan.");
      }

      setRemainingPlan(data);
    } catch (err: any) {
      console.error("Remaining meals generation error:", err);
      setRemainingApiErr(err.message || "Failed to generate remaining meals plan. Make sure API keys are active.");
    } finally {
      setIsGeneratingRemaining(false);
    }
  };

  const handleAddSuggestedMeal = (
    key: string,
    mealName: string,
    calories: number,
    macros: { protein: number; carbs: number; fat: number }
  ) => {
    const newMeal: MealLog = {
      id: "m-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      name: mealName,
      calories: calories,
      proteinG: macros.protein || 0,
      carbsG: macros.carbs || 0,
      fatG: macros.fat || 0,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    onAddMeal(newMeal);
    setAddedMealIds((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setAddedMealIds((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  return (
    <div id="diet-tab-container" className="h-full bg-slate-950 p-4 space-y-5 overflow-y-auto scrollbar-thin">
      
      {/* Hydration Tracker */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3">Live Hydration Monitor</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-slate-950 rounded-xl text-cyan-400 border border-slate-800 shadow">
              <GlassWater className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-300 font-semibold">Today's Intake</p>
              <p className="text-sm font-mono text-slate-400">
                <span className="text-slate-100 font-bold">{userStats.waterLoggedMl}</span> / {userStats.waterTargetMl} ml
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => onLogWater(250)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-cyan-500 text-cyan-400 rounded-lg text-xs transition-all font-semibold"
            >
              +250ml
            </button>
            <button
              onClick={() => onLogWater(500)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-cyan-400 text-cyan-300 rounded-lg text-xs transition-all font-semibold"
            >
              +500ml
            </button>
          </div>
        </div>

        {/* Custom progress indicator bar */}
        <div className="mt-4 w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-850">
          <div
            className="bg-cyan-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (userStats.waterLoggedMl / userStats.waterTargetMl) * 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Manual Meal Intake Logger */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-3">Today's Meal Logger</h4>
        <form onSubmit={handleAddMeal} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <input
                type="text"
                required
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="Meal name (e.g. Scrambled eggs & toast)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-slate-750 focus:ring-1 focus:ring-slate-750 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
              />
            </div>
            <div>
              <input
                type="number"
                required
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="Calories (kcal)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
              />
            </div>
            <div>
              <input
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="Protein (g)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
              />
            </div>
            <div>
              <input
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="Carbohydrates (g)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
              />
            </div>
            <div>
              <input
                type="number"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                placeholder="Fats (g)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-slate-750 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none placeholder-slate-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center space-x-1 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-200 cursor-pointer`}
          >
            <Plus className="w-4 h-4" />
            <span>Add to Diary</span>
          </button>
        </form>
      </div>

      {/* Macros Logs Dashboard */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4">
        {mealLogs.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3.5">
              <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Macros Logged ({totalCaloriesLogged} kcal)</h4>
              <span className="text-[10px] text-slate-500">Target: {userStats.targetCalories} kcal</span>
            </div>

            {/* Micro-bar chart of macro targets */}
            <div className="grid grid-cols-3 gap-2.5 text-center text-xs mb-4">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[9px] font-bold text-amber-500">PROTEIN</span>
                <p className="font-mono text-slate-200 font-bold mt-0.5">{totalProteinLogged}g</p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[9px] font-bold text-emerald-400">CARBS</span>
                <p className="font-mono text-slate-200 font-bold mt-0.5">{totalCarbsLogged}g</p>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                <span className="text-[9px] font-bold text-red-400">FATS</span>
                <p className="font-mono text-slate-200 font-bold mt-0.5">{totalFatLogged}g</p>
              </div>
            </div>

            {/* Log list */}
            <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
              {mealLogs.map((m) => (
                <div key={m.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex justify-between items-center text-xs">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <Coffee className="w-3.5 h-3.5 text-slate-500" />
                      <p className="font-semibold text-slate-200">{m.name}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      P: {m.proteinG}g • C: {m.carbsG}g • F: {m.fatG}g • {m.timestamp}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-slate-100">{m.calories} kcal</span>
                    <button
                      onClick={() => onDeleteMeal(m.id)}
                      aria-label={`Delete ${m.name}`}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-colors hover:bg-slate-900 cursor-pointer"
                      title="Delete meal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-4 px-2 text-center flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center justify-between w-full mb-1 border-b border-slate-850 pb-2">
              <h4 className="text-[10px] uppercase font-bold text-slate-450 tracking-wider">Daily Nutrition Diary</h4>
              <span className="text-[10px] text-slate-500 font-mono">0 / {userStats.targetCalories} kcal</span>
            </div>
            
            <div className="w-20 h-20 relative flex items-center justify-center mt-2">
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_12px_rgba(245,158,11,0.22)]">
                <defs>
                  <linearGradient id="bowlGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#b45309" />
                  </linearGradient>
                  <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                {/* Background Ring */}
                <circle cx="50" cy="55" r="32" fill="none" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="4 4" />
                
                {/* Stylized Bowl / Plate */}
                <path d="M18,50 C18,70 32,78 50,78 C68,78 82,70 82,50 L18,50 Z" fill="url(#bowlGrad)" opacity="0.9" />
                <path d="M14,48 L86,48" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                
                {/* Fork & Spoon crossed behind */}
                <path d="M26,30 L32,48" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M22,26 Q26,26 26,32 M30,26 Q26,26 26,32 M26,26 L26,32" fill="none" stroke="#475569" strokeWidth="1.2" />

                <path d="M74,30 L68,48" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M74,26 Q78,26 76,32 Z" fill="#475569" />

                {/* Healthy Leaf */}
                <path d="M42,42 C38,32 50,22 52,22 C52,22 62,32 52,42 Z" fill="url(#leafGrad)" />
                <path d="M48,32 L52,42" stroke="#047857" strokeWidth="1" strokeLinecap="round" />
                
                {/* Floating Fruit (Apple/Tomato) */}
                <circle cx="62" cy="40" r="7" fill="#ef4444" />
                <path d="M62,33 C61,31 63,29 64,28" fill="none" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" />

                {/* Floating Sparkles */}
                <path d="M 32 38 L 33 40 L 35 41 L 33 42 L 32 44 L 31 42 L 29 41 L 31 40 Z" fill="url(#sparkGrad)" />
                <path d="M 72 46 L 73 48 L 75 49 L 73 50 L 72 52 L 71 50 L 69 49 L 71 48 Z" fill="url(#sparkGrad)" />
                <circle cx="50" cy="14" r="1.5" fill="#f59e0b" />
              </svg>
            </div>
            
            <p className="text-xs text-slate-450 max-w-[280px] leading-relaxed mx-auto">
              No nutrition tracked yet today. Log your meals, snacks, or coffee above to calculate your remaining calorie budget and monitor macronutrients!
            </p>
          </div>
        )}
      </div>

      {/* AI Remaining Budget Meal Suggester */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-slate-950 text-amber-500 shadow border border-slate-850">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-100 flex items-center space-x-1.5">
                <span>AI Remaining Calorie Suggester</span>
                <span className="text-[8px] bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-950">
                  SMART FILL
                </span>
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">Custom meal ideas matching your active budget and goals.</p>
            </div>
          </div>
        </div>

        {/* Calorie Stats Breakdown Row */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-850 text-xs">
          <div className="text-center p-1 border-r border-slate-850/60">
            <span className="text-[8px] text-slate-500 font-bold uppercase block">Current Goal</span>
            <span className="text-[10px] text-amber-500 font-semibold block truncate mt-0.5" title={userStats.goal || "Build Muscle"}>
              {userStats.goal || "Build Muscle"}
            </span>
          </div>
          <div className="text-center p-1 border-r border-slate-850/60">
            <span className="text-[8px] text-slate-500 font-bold uppercase block">Logged Today</span>
            <span className="text-xs text-slate-300 font-bold block font-mono mt-0.5">
              {totalCaloriesLogged} / {userStats.targetCalories} kcal
            </span>
          </div>
          <div className="text-center p-1">
            <span className="text-[8px] text-slate-500 font-bold uppercase block">Remaining Budget</span>
            <span className={`text-xs font-bold font-mono block mt-0.5 ${
              (userStats.targetCalories - totalCaloriesLogged) > 0 ? "text-emerald-400" : "text-slate-400"
            }`}>
              {userStats.targetCalories - totalCaloriesLogged} kcal
            </span>
          </div>
        </div>

        {remainingApiErr && (
          <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-200">
            {remainingApiErr}
          </div>
        )}

        <button
          onClick={handleGenerateRemainingMeals}
          disabled={isGeneratingRemaining}
          className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center space-x-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-amber-500 hover:border-amber-500 hover:text-amber-400 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isGeneratingRemaining ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing calorie deficit & crafting meals...</span>
            </>
          ) : (
            <>
              <Utensils className="w-3.5 h-3.5" />
              <span>Suggest Meals for Remaining {userStats.targetCalories - totalCaloriesLogged} kcal</span>
            </>
          )}
        </button>

        {remainingPlan && (
          <div className="space-y-4 pt-3 border-t border-slate-850/60 animate-fade-in">
            {/* Buddy speech bubble */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 relative">
              <div className="flex items-center space-x-1.5 mb-1.5">
                <span className="text-sm">{selectedBuddy.avatarUrl}</span>
                <span className={`text-[10px] font-bold ${selectedBuddy.gradient ? `text-amber-500` : `text-slate-300`}`}>
                  {selectedBuddy.name}'s Meal Advice
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed italic">
                "{remainingPlan.buddyMotivation}"
              </p>
            </div>

            {/* Suggestions list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Suggested Meals</span>
                <span className="text-[10px] font-mono font-bold text-emerald-400">Total: {remainingPlan.totalCalories} kcal</span>
              </div>
              
              <div className="space-y-2.5">
                {remainingPlan.suggestedMeals.map((meal, idx) => {
                  const key = `meal-${idx}`;
                  const isAdded = addedMealIds[key];
                  return (
                    <div key={idx} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex flex-col justify-between text-xs space-y-2.5 hover:border-slate-800 transition-all">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] bg-slate-900 border border-slate-850 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase">
                            {meal.time}
                          </span>
                          <h5 className="font-bold text-slate-200 mt-1">{meal.name}</h5>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{meal.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-amber-500 block">{meal.calories} kcal</span>
                          <span className="text-[9px] text-slate-500 block mt-0.5">
                            P:{meal.macros.protein}g • C:{meal.macros.carbs}g • F:{meal.macros.fat}g
                          </span>
                        </div>
                      </div>

                      {meal.buddyTip && (
                        <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-900/50 text-[10px] text-slate-400 italic">
                          <span className="font-bold text-slate-300 not-italic mr-1">Buddy Tip:</span>
                          "{meal.buddyTip}"
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleAddSuggestedMeal(key, meal.name, meal.calories, meal.macros)}
                          disabled={isAdded}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center space-x-1 border ${
                            isAdded
                              ? "bg-emerald-950/55 border-emerald-900 text-emerald-400"
                              : "bg-slate-900 border-slate-800 hover:border-slate-700 hover:text-slate-200 text-slate-400 cursor-pointer"
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Added to Diary!</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Log this Meal</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Diet Plan & Grocery Recommendation Hub */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center space-x-2 mb-3.5">
          <div className="p-1.5 rounded-lg bg-slate-950 text-emerald-400 shadow">
            <Carrot className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-100 flex items-center space-x-1.5">
              <span>AI Dietician & Grocery Coach</span>
              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-950">
                NLP PLANNER
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Recommendations tailored for BMI and fitness targets.</p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-2.5 mb-3.5">
          <div>
            <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Physical Goal</label>
            <select
              value={weightGoal}
              onChange={(e) => setWeightGoal(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option>Muscle Gain</option>
              <option>Fat Shred</option>
              <option>Clean Lean Bulk</option>
              <option>Calorie Maintenance</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] uppercase font-bold text-slate-500 mb-1">Diet Preference</label>
            <select
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option>High Protein</option>
              <option>Keto (Low Carb)</option>
              <option>Balanced/No limits</option>
              <option>Vegan/Plant-Based</option>
              <option>Vegetarian</option>
            </select>
          </div>
        </div>

        {/* Error notification */}
        {apiErr && (
          <div className="p-2.5 bg-red-950/40 border border-red-900/50 rounded-xl text-[10px] text-red-200 mb-3">
            {apiErr}
          </div>
        )}

        {/* Generate Plan CTA */}
        <button
          onClick={handleGenerateDietPlan}
          disabled={isGenerating}
          className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center space-x-1.5 bg-gradient-to-r ${
            selectedBuddy.gradient
          } text-slate-950 hover:scale-[1.01] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing BMI and planning calorie loads...</span>
            </>
          ) : (
            <>
              <BrainCircuit className="w-3.5 h-3.5 fill-slate-950" />
              <span>Calculate & Generate Diet Plan</span>
            </>
          )}
        </button>

        {/* Render Generated AI Plan */}
        {aiPlan && (
          <div className="mt-5 space-y-4 pt-4 border-t border-slate-850/60 animate-fade-in">
            {/* Targets Header */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-center">
              <span className="text-[9px] uppercase font-bold text-slate-500">Caloric Target Limit</span>
              <p className="text-base font-mono font-bold text-emerald-400 mt-0.5">{aiPlan.dailyCalories} kcal</p>
              <div className="flex justify-center space-x-3 text-[10px] text-slate-400 mt-1.5">
                <span>P: {aiPlan.macros.protein}g</span>
                <span>C: {aiPlan.macros.carbs}g</span>
                <span>F: {aiPlan.macros.fat}g</span>
              </div>
            </div>

            {/* Meals Schedule */}
            <div className="space-y-2">
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">AI Suggested Schedule</span>
              {aiPlan.meals.map((meal, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-900 rounded-xl p-3 flex justify-between items-start text-xs">
                  <div>
                    <span className="text-[8px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold">{meal.time}</span>
                    <h5 className="font-bold text-slate-200 mt-1">{meal.name}</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">{meal.description}</p>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-slate-500 text-right whitespace-nowrap ml-2">{meal.macros}</span>
                </div>
              ))}
            </div>

            {/* Grocery List */}
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-3.5">
              <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-1.5 mb-2">
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                <span>AI Dietician Grocery List</span>
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-300">
                {aiPlan.groceryList.map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-1.5 bg-slate-900/50 px-2 py-1 rounded border border-slate-900">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
