import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  limit,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserStats, WorkoutSession, JournalEntry, MealLog, Message } from "../types";

function assertDb() {
  if (!db) {
    throw new Error("Firestore is not initialized. Running in local/guest mode.");
  }
  return db;
}

// ----------------------------------------------------------------------------
// 1. User Profile & Physical Stats (/users/{uid})
// ----------------------------------------------------------------------------

export async function getUserProfile(uid: string): Promise<UserStats | null> {
  const database = assertDb();
  const userRef = doc(database, "users", uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  return {
    streak: typeof data.streak === "number" ? data.streak : 0,
    totalWorkouts: typeof data.totalWorkouts === "number" ? data.totalWorkouts : 0,
    totalCalories: typeof data.totalCalories === "number" ? data.totalCalories : 0,
    weightKg: typeof data.weightKg === "number" ? data.weightKg : 70,
    heightCm: typeof data.heightCm === "number" ? data.heightCm : 175,
    waterTargetMl: typeof data.waterTargetMl === "number" ? data.waterTargetMl : 2500,
    waterLoggedMl: typeof data.waterLoggedMl === "number" ? data.waterLoggedMl : 0,
    goal: typeof data.goal === "string" ? data.goal : "Stay Healthy",
    targetCalories: typeof data.targetCalories === "number" ? data.targetCalories : 2200,
    recentMood: typeof data.recentMood === "string" ? data.recentMood : "Energized",
    selectedBuddyId: typeof data.selectedBuddyId === "string" ? data.selectedBuddyId : "marcus"
  };
}

export async function saveUserProfile(uid: string, stats: UserStats, soundEnabled?: boolean): Promise<void> {
  const database = assertDb();
  const userRef = doc(database, "users", uid);
  await setDoc(
    userRef,
    {
      ...stats,
      soundEnabled: soundEnabled ?? true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

// ----------------------------------------------------------------------------
// 2. Workout History (/users/{uid}/workouts)
// ----------------------------------------------------------------------------

export async function getUserWorkouts(uid: string, limitCount = 50): Promise<WorkoutSession[]> {
  const database = assertDb();
  const workoutsRef = collection(database, "users", uid, "workouts");
  const q = query(workoutsRef, limit(limitCount));
  const snap = await getDocs(q);

  const workouts: WorkoutSession[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    workouts.push({
      id: docSnap.id,
      workoutName: d.workoutName || "Workout Session",
      date: d.date || "Recent",
      durationMinutes: d.durationMinutes || 0,
      caloriesBurned: d.caloriesBurned || 0,
      exercises: Array.isArray(d.exercises) ? d.exercises : [],
      completed: Boolean(d.completed),
      buddyFeedback: d.buddyFeedback || ""
    });
  });

  return workouts;
}

export async function addWorkout(uid: string, session: WorkoutSession): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "workouts", session.id);
  await setDoc(docRef, {
    ...session,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteWorkout(uid: string, workoutId: string): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "workouts", workoutId);
  await deleteDoc(docRef);
}

// ----------------------------------------------------------------------------
// 3. Custom Routines (/users/{uid}/customRoutines)
// ----------------------------------------------------------------------------

export async function getUserCustomRoutines(uid: string): Promise<WorkoutSession[]> {
  const database = assertDb();
  const routinesRef = collection(database, "users", uid, "customRoutines");
  const snap = await getDocs(routinesRef);

  const routines: WorkoutSession[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    routines.push({
      id: docSnap.id,
      workoutName: d.workoutName || "Custom Routine",
      date: d.date || "Routine",
      durationMinutes: d.durationMinutes || 0,
      caloriesBurned: d.caloriesBurned || 0,
      exercises: Array.isArray(d.exercises) ? d.exercises : [],
      completed: false,
      buddyFeedback: d.buddyFeedback || ""
    });
  });

  return routines;
}

export async function saveCustomRoutine(uid: string, routine: WorkoutSession): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "customRoutines", routine.id);
  await setDoc(docRef, {
    ...routine,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteCustomRoutine(uid: string, routineId: string): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "customRoutines", routineId);
  await deleteDoc(docRef);
}

// ----------------------------------------------------------------------------
// 4. Mind-Body Reflection Journals (/users/{uid}/journals)
// ----------------------------------------------------------------------------

export async function getUserJournals(uid: string, limitCount = 50): Promise<JournalEntry[]> {
  const database = assertDb();
  const journalsRef = collection(database, "users", uid, "journals");
  const q = query(journalsRef, limit(limitCount));
  const snap = await getDocs(q);

  const journals: JournalEntry[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    journals.push({
      id: docSnap.id,
      date: d.date || "Recent",
      entryText: d.entryText || "",
      sentiment: d.sentiment || "Neutral",
      sentimentScore: d.sentimentScore ?? 5,
      fatigueLevel: d.fatigueLevel ?? 5,
      stressLevel: d.stressLevel ?? 5,
      motivationLevel: d.motivationLevel ?? 5,
      feedback: d.feedback || ""
    });
  });

  return journals;
}

export async function addJournal(uid: string, entry: JournalEntry): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "journals", entry.id);
  await setDoc(docRef, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteJournal(uid: string, journalId: string): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "journals", journalId);
  await deleteDoc(docRef);
}

// ----------------------------------------------------------------------------
// 5. Meal Logs (/users/{uid}/meals)
// ----------------------------------------------------------------------------

export async function getUserMeals(uid: string, limitCount = 50): Promise<MealLog[]> {
  const database = assertDb();
  const mealsRef = collection(database, "users", uid, "meals");
  const q = query(mealsRef, limit(limitCount));
  const snap = await getDocs(q);

  const meals: MealLog[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    meals.push({
      id: docSnap.id,
      name: d.name || "Meal",
      calories: d.calories || 0,
      proteinG: d.proteinG || 0,
      carbsG: d.carbsG || 0,
      fatG: d.fatG || 0,
      timestamp: d.timestamp || ""
    });
  });

  return meals;
}

export async function addMeal(uid: string, meal: MealLog): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "meals", meal.id);
  await setDoc(docRef, {
    ...meal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteMeal(uid: string, mealId: string): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "meals", mealId);
  await deleteDoc(docRef);
}

// ----------------------------------------------------------------------------
// 6. Coach Chat History (/users/{uid}/coaches/{coachId}/messages)
// ----------------------------------------------------------------------------

export async function getCoachMessages(uid: string, coachId: string, limitCount = 50): Promise<Message[]> {
  const database = assertDb();
  const msgsRef = collection(database, "users", uid, "coaches", coachId, "messages");
  const q = query(msgsRef, limit(limitCount));
  const snap = await getDocs(q);

  const messages: Message[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    messages.push({
      id: docSnap.id,
      sender: d.sender === "buddy" ? "buddy" : "user",
      role: d.role === "model" ? "model" : "user",
      content: d.content || "",
      timestamp: d.timestamp || ""
    });
  });

  return messages;
}

export async function saveCoachMessage(uid: string, coachId: string, message: Message): Promise<void> {
  const database = assertDb();
  const docRef = doc(database, "users", uid, "coaches", coachId, "messages", message.id);
  await setDoc(docRef, {
    ...message,
    createdAt: serverTimestamp()
  }, { merge: true });
}

// ----------------------------------------------------------------------------
// 7. Reset / Clear Cloud User Data (/users/{uid})
// ----------------------------------------------------------------------------

export async function clearUserCloudData(uid: string): Promise<void> {
  const database = assertDb();
  const refsToDelete: any[] = [];

  // 1. Workouts
  const workouts = await getDocs(collection(database, "users", uid, "workouts"));
  workouts.forEach((docSnap) => refsToDelete.push(docSnap.ref));

  // 2. Routines
  const routines = await getDocs(collection(database, "users", uid, "customRoutines"));
  routines.forEach((docSnap) => refsToDelete.push(docSnap.ref));

  // 3. Journals
  const journals = await getDocs(collection(database, "users", uid, "journals"));
  journals.forEach((docSnap) => refsToDelete.push(docSnap.ref));

  // 4. Meals
  const meals = await getDocs(collection(database, "users", uid, "meals"));
  meals.forEach((docSnap) => refsToDelete.push(docSnap.ref));

  // 5. Coach messages across all coaches
  for (const coach of ["marcus", "aria", "jax"]) {
    const msgs = await getDocs(collection(database, "users", uid, "coaches", coach, "messages"));
    msgs.forEach((docSnap) => refsToDelete.push(docSnap.ref));
  }

  // 6. User profile root document
  refsToDelete.push(doc(database, "users", uid));

  // Chunk batch deletions into groups of <= 400 to respect Firestore batch limits
  const BATCH_SIZE = 400;
  for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
    const chunk = refsToDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(database);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
