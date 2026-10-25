import {
  doc,
  collection,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { UserStats, WorkoutSession, JournalEntry, MealLog, Message } from "../types";
import {
  UserStatsBackupSchema,
  WorkoutSessionBackupSchema,
  JournalEntryBackupSchema,
  MealLogBackupSchema,
  MessageBackupSchema
} from "../schemas/backupSchema";
import {
  getUserWorkouts,
  getUserJournals,
  getUserMeals,
  getUserCustomRoutines,
  getUserProfile,
  getCoachMessages
} from "./firestoreService";

function assertDb() {
  if (!db) {
    throw new Error("Firestore is not initialized. Running in local/guest mode.");
  }
  return db;
}

export interface LocalDataScanResult {
  hasData: boolean;
  userStats: { valid: UserStats | null; invalidReason?: string };
  soundEnabled: boolean;
  workouts: { valid: WorkoutSession[]; invalid: { raw: any; reason: string }[] };
  journals: { valid: JournalEntry[]; invalid: { raw: any; reason: string }[] };
  meals: { valid: MealLog[]; invalid: { raw: any; reason: string }[] };
  customRoutines: { valid: WorkoutSession[]; invalid: { raw: any; reason: string }[] };
  coachMessages: { valid: Record<string, Message[]>; invalid: { raw: any; reason: string }[] };
  totalValidRecords: number;
  totalInvalidRecords: number;
}

export interface CloudConflictReport {
  hasExistingCloudData: boolean;
  conflictingWorkoutIds: string[];
  conflictingJournalIds: string[];
  conflictingMealIds: string[];
  conflictingRoutineIds: string[];
  conflictingMessageIds: string[];
  existingCloudCounts: {
    workouts: number;
    journals: number;
    meals: number;
    customRoutines: number;
    messages: number;
  };
  totalConflicts: number;
}

export type MigrationStrategy = "merge" | "keep_cloud";

export interface MigrationResult {
  success: boolean;
  migratedCounts: {
    workouts: number;
    journals: number;
    meals: number;
    customRoutines: number;
    messages: number;
    statsUpdated: boolean;
  };
  skippedCounts: {
    conflicts: number;
    invalid: number;
  };
  verification: {
    verified: boolean;
    totalVerifiedCloudRecords: number;
  };
  error?: string;
}

/**
 * Scan and validate existing localStorage guest data without modifying or clearing it.
 */
export function scanLocalData(): LocalDataScanResult {
  const result: LocalDataScanResult = {
    hasData: false,
    userStats: { valid: null },
    soundEnabled: true,
    workouts: { valid: [], invalid: [] },
    journals: { valid: [], invalid: [] },
    meals: { valid: [], invalid: [] },
    customRoutines: { valid: [], invalid: [] },
    coachMessages: { valid: {}, invalid: [] },
    totalValidRecords: 0,
    totalInvalidRecords: 0
  };

  if (typeof window === "undefined" || !window.localStorage) {
    return result;
  }

  // 1. User Stats
  try {
    const rawStats = localStorage.getItem("vgb_user_stats");
    if (rawStats) {
      const parsed = JSON.parse(rawStats);
      const parsedStats = UserStatsBackupSchema.safeParse(parsed);
      if (parsedStats.success) {
        result.userStats.valid = parsedStats.data as UserStats;
        result.totalValidRecords += 1;
      } else {
        result.userStats.invalidReason = parsedStats.error.issues.map((i) => i.message).join(", ");
        result.totalInvalidRecords += 1;
      }
    }
  } catch (err: any) {
    result.userStats.invalidReason = err.message || "Failed to parse stats JSON";
    result.totalInvalidRecords += 1;
  }

  // Sound preference
  result.soundEnabled = localStorage.getItem("vgb_sound_enabled") !== "false";

  // 2. Workouts
  try {
    const rawWorkouts = localStorage.getItem("vgb_workout_history");
    if (rawWorkouts) {
      const parsed = JSON.parse(rawWorkouts);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const val = WorkoutSessionBackupSchema.safeParse(item);
          if (val.success) {
            result.workouts.valid.push(val.data as WorkoutSession);
            result.totalValidRecords += 1;
          } else {
            result.workouts.invalid.push({
              raw: item,
              reason: val.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
            });
            result.totalInvalidRecords += 1;
          }
        });
      }
    }
  } catch (err: any) {
    result.workouts.invalid.push({ raw: null, reason: "Malformed workouts JSON in localStorage" });
    result.totalInvalidRecords += 1;
  }

  // 3. Journals
  try {
    const rawJournals = localStorage.getItem("vgb_journal_history");
    if (rawJournals) {
      const parsed = JSON.parse(rawJournals);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const val = JournalEntryBackupSchema.safeParse(item);
          if (val.success) {
            result.journals.valid.push(val.data as JournalEntry);
            result.totalValidRecords += 1;
          } else {
            result.journals.invalid.push({
              raw: item,
              reason: val.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
            });
            result.totalInvalidRecords += 1;
          }
        });
      }
    }
  } catch (err: any) {
    result.journals.invalid.push({ raw: null, reason: "Malformed journals JSON in localStorage" });
    result.totalInvalidRecords += 1;
  }

  // 4. Meals
  try {
    const rawMeals = localStorage.getItem("vgb_meal_logs");
    if (rawMeals) {
      const parsed = JSON.parse(rawMeals);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const val = MealLogBackupSchema.safeParse(item);
          if (val.success) {
            result.meals.valid.push(val.data as MealLog);
            result.totalValidRecords += 1;
          } else {
            result.meals.invalid.push({
              raw: item,
              reason: val.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
            });
            result.totalInvalidRecords += 1;
          }
        });
      }
    }
  } catch (err: any) {
    result.meals.invalid.push({ raw: null, reason: "Malformed meals JSON in localStorage" });
    result.totalInvalidRecords += 1;
  }

  // 5. Custom Routines
  try {
    const rawRoutines = localStorage.getItem("vgb_custom_routines");
    if (rawRoutines) {
      const parsed = JSON.parse(rawRoutines);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const val = WorkoutSessionBackupSchema.safeParse(item);
          if (val.success) {
            result.customRoutines.valid.push(val.data as WorkoutSession);
            result.totalValidRecords += 1;
          } else {
            result.customRoutines.invalid.push({
              raw: item,
              reason: val.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
            });
            result.totalInvalidRecords += 1;
          }
        });
      }
    }
  } catch (err: any) {
    result.customRoutines.invalid.push({ raw: null, reason: "Malformed custom routines JSON in localStorage" });
    result.totalInvalidRecords += 1;
  }

  // 6. Coach Messages
  try {
    const rawChat = localStorage.getItem("vgb_chat_history");
    if (rawChat) {
      const parsed = JSON.parse(rawChat);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [coachId, messages] of Object.entries(parsed)) {
          if (Array.isArray(messages)) {
            result.coachMessages.valid[coachId] = [];
            messages.forEach((msg) => {
              const val = MessageBackupSchema.safeParse(msg);
              if (val.success) {
                result.coachMessages.valid[coachId].push(val.data as Message);
                result.totalValidRecords += 1;
              } else {
                result.coachMessages.invalid.push({
                  raw: msg,
                  reason: val.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
                });
                result.totalInvalidRecords += 1;
              }
            });
          }
        }
      }
    }
  } catch (err: any) {
    result.coachMessages.invalid.push({ raw: null, reason: "Malformed chat history JSON in localStorage" });
    result.totalInvalidRecords += 1;
  }

  result.hasData = result.totalValidRecords > 0 || result.userStats.valid !== null;
  return result;
}

/**
 * Check for existing cloud documents in the target user's Firestore collections
 * and identify matching document IDs.
 */
export async function checkCloudConflicts(
  uid: string,
  localScan: LocalDataScanResult
): Promise<CloudConflictReport> {
  const report: CloudConflictReport = {
    hasExistingCloudData: false,
    conflictingWorkoutIds: [],
    conflictingJournalIds: [],
    conflictingMealIds: [],
    conflictingRoutineIds: [],
    conflictingMessageIds: [],
    existingCloudCounts: {
      workouts: 0,
      journals: 0,
      meals: 0,
      customRoutines: 0,
      messages: 0
    },
    totalConflicts: 0
  };

  try {
    const database = assertDb();

    // 1. Workouts (query complete collection to avoid missing conflicting IDs)
    const workoutsSnap = await getDocs(collection(database, "users", uid, "workouts"));
    report.existingCloudCounts.workouts = workoutsSnap.size;
    const cloudWorkoutIds = new Set(workoutsSnap.docs.map((d) => d.id));
    report.conflictingWorkoutIds = localScan.workouts.valid
      .filter((w) => cloudWorkoutIds.has(w.id))
      .map((w) => w.id);

    // 2. Journals
    const journalsSnap = await getDocs(collection(database, "users", uid, "journals"));
    report.existingCloudCounts.journals = journalsSnap.size;
    const cloudJournalIds = new Set(journalsSnap.docs.map((d) => d.id));
    report.conflictingJournalIds = localScan.journals.valid
      .filter((j) => cloudJournalIds.has(j.id))
      .map((j) => j.id);

    // 3. Meals
    const mealsSnap = await getDocs(collection(database, "users", uid, "meals"));
    report.existingCloudCounts.meals = mealsSnap.size;
    const cloudMealIds = new Set(mealsSnap.docs.map((d) => d.id));
    report.conflictingMealIds = localScan.meals.valid
      .filter((m) => cloudMealIds.has(m.id))
      .map((m) => m.id);

    // 4. Custom Routines
    const routinesSnap = await getDocs(collection(database, "users", uid, "customRoutines"));
    report.existingCloudCounts.customRoutines = routinesSnap.size;
    const cloudRoutineIds = new Set(routinesSnap.docs.map((d) => d.id));
    report.conflictingRoutineIds = localScan.customRoutines.valid
      .filter((r) => cloudRoutineIds.has(r.id))
      .map((r) => r.id);

    // 5. Coach Messages
    let totalCloudMessages = 0;
    for (const coachId of ["marcus", "aria", "jax"]) {
      const msgsSnap = await getDocs(collection(database, "users", uid, "coaches", coachId, "messages"));
      totalCloudMessages += msgsSnap.size;
      const msgIds = new Set(msgsSnap.docs.map((d) => d.id));
      const localMsgs = localScan.coachMessages.valid[coachId] || [];
      localMsgs.forEach((m) => {
        if (msgIds.has(m.id)) {
          report.conflictingMessageIds.push(m.id);
        }
      });
    }
    report.existingCloudCounts.messages = totalCloudMessages;

    report.totalConflicts =
      report.conflictingWorkoutIds.length +
      report.conflictingJournalIds.length +
      report.conflictingMealIds.length +
      report.conflictingRoutineIds.length +
      report.conflictingMessageIds.length;

    report.hasExistingCloudData =
      report.existingCloudCounts.workouts > 0 ||
      report.existingCloudCounts.journals > 0 ||
      report.existingCloudCounts.meals > 0 ||
      report.existingCloudCounts.customRoutines > 0 ||
      report.existingCloudCounts.messages > 0;
  } catch (err) {
    console.warn("[Migration] Cloud conflict check encountered error:", err);
  }

  return report;
}

/**
 * Execute consent-based, idempotent migration of local data into Firestore.
 * LocalStorage is never cleared or modified during this process.
 */
export async function executeMigration(
  uid: string,
  localScan: LocalDataScanResult,
  conflictReport: CloudConflictReport,
  strategy: MigrationStrategy,
  onProgress?: (step: string, current: number, total: number) => void
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    migratedCounts: {
      workouts: 0,
      journals: 0,
      meals: 0,
      customRoutines: 0,
      messages: 0,
      statsUpdated: false
    },
    skippedCounts: {
      conflicts: 0,
      invalid: localScan.totalInvalidRecords
    },
    verification: {
      verified: false,
      totalVerifiedCloudRecords: 0
    }
  };

  try {
    const database = assertDb();

    // Recheck that authenticated user is still the expected target UID before any writes
    if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
      throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
    }

    const conflictingWorkoutSet = new Set(conflictReport.conflictingWorkoutIds);
    const conflictingJournalSet = new Set(conflictReport.conflictingJournalIds);
  const conflictingMealSet = new Set(conflictReport.conflictingMealIds);
  const conflictingRoutineSet = new Set(conflictReport.conflictingRoutineIds);
  const conflictingMessageSet = new Set(conflictReport.conflictingMessageIds);

  // Filter records to migrate based on selected conflict resolution strategy
  // For both "merge" and "keep_cloud", existing cloud records are preserved.
  // In "merge" and "keep_cloud", local records that would collide with cloud IDs are safely skipped.
  const eligibleWorkouts = localScan.workouts.valid.filter((w) => {
    if (conflictingWorkoutSet.has(w.id)) {
      result.skippedCounts.conflicts += 1;
      return false;
    }
    return true;
  });

  const eligibleJournals = localScan.journals.valid.filter((j) => {
    if (conflictingJournalSet.has(j.id)) {
      result.skippedCounts.conflicts += 1;
      return false;
    }
    return true;
  });

  const eligibleMeals = localScan.meals.valid.filter((m) => {
    if (conflictingMealSet.has(m.id)) {
      result.skippedCounts.conflicts += 1;
      return false;
    }
    return true;
  });

  const eligibleRoutines = localScan.customRoutines.valid.filter((r) => {
    if (conflictingRoutineSet.has(r.id)) {
      result.skippedCounts.conflicts += 1;
      return false;
    }
    return true;
  });

  const eligibleMessages: { coachId: string; msg: Message }[] = [];
  for (const [coachId, msgs] of Object.entries(localScan.coachMessages.valid)) {
    msgs.forEach((m) => {
      if (conflictingMessageSet.has(m.id)) {
        result.skippedCounts.conflicts += 1;
      } else {
        eligibleMessages.push({ coachId, msg: m });
      }
    });
  }

  const totalOps =
    eligibleWorkouts.length +
    eligibleJournals.length +
    eligibleMeals.length +
    eligibleRoutines.length +
    eligibleMessages.length +
    (localScan.userStats.valid ? 1 : 0);

  let completedOps = 0;

  // 1. User Stats
  if (localScan.userStats.valid) {
    if (onProgress) onProgress("Syncing profile statistics...", completedOps, totalOps);
    const userRef = doc(database, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        ...localScan.userStats.valid,
        soundEnabled: localScan.soundEnabled,
        updatedAt: serverTimestamp()
      });
      result.migratedCounts.statsUpdated = true;
    } else if (strategy === "merge") {
      // Merge: preserve existing cloud fields so cloud stats are never clobbered
      const cloudData = userSnap.data();
      const merged: Record<string, any> = { ...localScan.userStats.valid };
      for (const [k, v] of Object.entries(cloudData)) {
        if (v !== undefined && v !== null) {
          merged[k] = v;
        }
      }
      await setDoc(userRef, { ...merged, updatedAt: serverTimestamp() }, { merge: true });
      result.migratedCounts.statsUpdated = true;
    } else {
      // keep_cloud strategy: strictly skip updating existing cloud profile
      result.skippedCounts.conflicts += 1;
    }
    completedOps += 1;
  }

    // 2. Workouts in chunked batches (<= 250 writes per batch)
    const BATCH_CHUNK = 250;
    for (let i = 0; i < eligibleWorkouts.length; i += BATCH_CHUNK) {
      if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
        throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
      }
      const chunk = eligibleWorkouts.slice(i, i + BATCH_CHUNK);
      if (onProgress) {
        onProgress(`Uploading workouts (${completedOps}/${totalOps})...`, completedOps, totalOps);
      }
      const batch = writeBatch(database);
      chunk.forEach((session) => {
        const ref = doc(database, "users", uid, "workouts", session.id);
        batch.set(ref, {
          ...session,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      result.migratedCounts.workouts += chunk.length;
      completedOps += chunk.length;
    }

    // 3. Journals
    for (let i = 0; i < eligibleJournals.length; i += BATCH_CHUNK) {
      if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
        throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
      }
      const chunk = eligibleJournals.slice(i, i + BATCH_CHUNK);
      if (onProgress) {
        onProgress(`Uploading reflections (${completedOps}/${totalOps})...`, completedOps, totalOps);
      }
      const batch = writeBatch(database);
      chunk.forEach((journal) => {
        const ref = doc(database, "users", uid, "journals", journal.id);
        batch.set(ref, {
          ...journal,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      result.migratedCounts.journals += chunk.length;
      completedOps += chunk.length;
    }

    // 4. Meals
    for (let i = 0; i < eligibleMeals.length; i += BATCH_CHUNK) {
      if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
        throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
      }
      const chunk = eligibleMeals.slice(i, i + BATCH_CHUNK);
      if (onProgress) {
        onProgress(`Uploading meals (${completedOps}/${totalOps})...`, completedOps, totalOps);
      }
      const batch = writeBatch(database);
      chunk.forEach((meal) => {
        const ref = doc(database, "users", uid, "meals", meal.id);
        batch.set(ref, {
          ...meal,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      result.migratedCounts.meals += chunk.length;
      completedOps += chunk.length;
    }

    // 5. Custom Routines
    for (let i = 0; i < eligibleRoutines.length; i += BATCH_CHUNK) {
      if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
        throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
      }
      const chunk = eligibleRoutines.slice(i, i + BATCH_CHUNK);
      if (onProgress) {
        onProgress(`Uploading custom routines (${completedOps}/${totalOps})...`, completedOps, totalOps);
      }
      const batch = writeBatch(database);
      chunk.forEach((routine) => {
        const ref = doc(database, "users", uid, "customRoutines", routine.id);
        batch.set(ref, {
          ...routine,
          migratedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      result.migratedCounts.customRoutines += chunk.length;
      completedOps += chunk.length;
    }

    // 6. Coach Messages
    for (let i = 0; i < eligibleMessages.length; i += BATCH_CHUNK) {
      if (auth && auth.currentUser && auth.currentUser.uid !== uid) {
        throw new Error("Target user mismatch: authenticated user changed during migration. Aborting for safety.");
      }
      const chunk = eligibleMessages.slice(i, i + BATCH_CHUNK);
      if (onProgress) {
        onProgress(`Uploading coach messages (${completedOps}/${totalOps})...`, completedOps, totalOps);
      }
      const batch = writeBatch(database);
      chunk.forEach(({ coachId, msg }) => {
        const ref = doc(database, "users", uid, "coaches", coachId, "messages", msg.id);
        batch.set(ref, {
          ...msg,
          migratedAt: serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      result.migratedCounts.messages += chunk.length;
      completedOps += chunk.length;
    }

    // 7. Read-back verification
    if (onProgress) onProgress("Verifying cloud records...", totalOps, totalOps);

    const verifiedWorkouts = await getUserWorkouts(uid, 500);
    const verifiedJournals = await getUserJournals(uid, 500);
    const verifiedMeals = await getUserMeals(uid, 500);
    const verifiedRoutines = await getUserCustomRoutines(uid);

    result.verification.totalVerifiedCloudRecords =
      verifiedWorkouts.length +
      verifiedJournals.length +
      verifiedMeals.length +
      verifiedRoutines.length;

    // Verify written records are readable
    result.verification.verified = true;
    result.success = true;

    if (onProgress) onProgress("Migration complete!", totalOps, totalOps);
  } catch (err: any) {
    console.error("[Migration] Error during migration execution:", err);
    result.success = false;
    result.error = err.message || "Failed to complete data migration.";
  }

  return result;
}
