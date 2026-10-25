import React, { useState, useEffect } from "react";
import {
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
  X,
  ShieldCheck,
  Layers,
  Database,
  ArrowRight
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  scanLocalData,
  checkCloudConflicts,
  executeMigration,
  LocalDataScanResult,
  CloudConflictReport,
  MigrationStrategy,
  MigrationResult
} from "../services/migrationService";

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMigrationComplete: () => Promise<void>;
  onExportBackup?: () => void;
}

export default function MigrationModal({
  isOpen,
  onClose,
  onMigrationComplete,
  onExportBackup
}: MigrationModalProps) {
  const { user } = useAuth();

  const [scanResult, setScanResult] = useState<LocalDataScanResult | null>(null);
  const [conflictReport, setConflictReport] = useState<CloudConflictReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<MigrationStrategy>("merge");
  const [isMigrating, setIsMigrating] = useState(false);
  const [progressStep, setProgressStep] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // Scan local data and check conflicts whenever modal is opened
  useEffect(() => {
    if (!isOpen || !user) {
      setScanResult(null);
      setConflictReport(null);
      setMigrationResult(null);
      setIsMigrating(false);
      setProgressPercent(0);
      return;
    }

    let isCancelled = false;

    async function scan() {
      setIsScanning(true);
      setScanError(null);
      try {
        const scan = scanLocalData();
        if (isCancelled) return;
        setScanResult(scan);

        const conflicts = await checkCloudConflicts(user.uid, scan);
        if (isCancelled) return;
        setConflictReport(conflicts);
      } catch (err: any) {
        if (!isCancelled) {
          console.error("Migration scan error:", err);
          setScanError(err.message || "Failed to scan local records.");
        }
      } finally {
        if (!isCancelled) {
          setIsScanning(false);
        }
      }
    }

    scan();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, user?.uid]);

  if (!isOpen || !user) return null;

  const handleStartMigration = async () => {
    if (!scanResult || !conflictReport || isMigrating) return;

    setIsMigrating(true);
    setMigrationResult(null);
    setProgressPercent(0);
    setProgressStep("Initializing migration...");

    try {
      const res = await executeMigration(
        user.uid,
        scanResult,
        conflictReport,
        strategy,
        (step, current, total) => {
          setProgressStep(step);
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          setProgressPercent(pct);
        }
      );

      setMigrationResult(res);
      if (res.success) {
        await onMigrationComplete();
      }
    } catch (err: any) {
      setMigrationResult({
        success: false,
        migratedCounts: {
          workouts: 0,
          journals: 0,
          meals: 0,
          customRoutines: 0,
          messages: 0,
          statsUpdated: false
        },
        skippedCounts: { conflicts: 0, invalid: 0 },
        verification: { verified: false, totalVerifiedCloudRecords: 0 },
        error: err.message || "Migration process failed."
      });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-fade-in select-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="migration-title"
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto scrollbar-thin text-slate-100"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <h3 id="migration-title" className="text-sm sm:text-base font-bold text-slate-100">
                Migrate Local Guest Data
              </h3>
              <p className="text-[11px] text-slate-400">
                Sync your device history into <strong className="text-slate-200">{user.email}</strong>
              </p>
            </div>
          </div>
          {!isMigrating && (
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Informational Banner */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-[11px]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Safe, Non-Destructive Copy</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Your existing local device records will be copied into your secure Firestore cloud storage.{" "}
            <strong className="text-slate-200">Local data will never be deleted, cleared, or overwritten.</strong>
          </p>
          {onExportBackup && (
            <div className="pt-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Want a safety file first?</span>
              <button
                type="button"
                onClick={onExportBackup}
                className="text-sky-400 hover:text-sky-300 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Export JSON Backup</span>
              </button>
            </div>
          )}
        </div>

        {/* Scanning State */}
        {isScanning && (
          <div className="py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
            <span>Scanning local records & checking cloud conflicts...</span>
          </div>
        )}

        {/* Scan Error */}
        {scanError && (
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-3 flex items-center space-x-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{scanError}</span>
          </div>
        )}

        {/* Scan Results & Conflict Resolution Form */}
        {!isScanning && scanResult && !migrationResult && (
          <div className="space-y-4">
            {!scanResult.hasData ? (
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-center space-y-1">
                <Database className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No local guest records detected</p>
                <p className="text-[11px] text-slate-500">
                  Your device has no unmigrated workouts or reflections in localStorage.
                </p>
              </div>
            ) : (
              <>
                {/* Detected Records Breakdown */}
                <div className="bg-slate-950 border border-slate-850 rounded-2xl p-3.5 space-y-2.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Detected Local Records
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block">Workouts</span>
                      <strong className="text-sm font-mono text-amber-500">
                        {scanResult.workouts.valid.length}
                      </strong>
                    </div>
                    <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block">Reflections</span>
                      <strong className="text-sm font-mono text-emerald-400">
                        {scanResult.journals.valid.length}
                      </strong>
                    </div>
                    <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block">Meals</span>
                      <strong className="text-sm font-mono text-orange-400">
                        {scanResult.meals.valid.length}
                      </strong>
                    </div>
                    <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                      <span className="text-[10px] text-slate-400 block">Custom Routines</span>
                      <strong className="text-sm font-mono text-sky-400">
                        {scanResult.customRoutines.valid.length}
                      </strong>
                    </div>
                    <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-slate-400 block">Coach Messages</span>
                      <strong className="text-sm font-mono text-violet-400">
                        {Object.values(scanResult.coachMessages.valid).reduce((acc: number, m: any) => acc + (Array.isArray(m) ? m.length : 0), 0)}
                      </strong>
                    </div>
                  </div>

                  {scanResult.totalInvalidRecords > 0 && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-amber-400 pt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {scanResult.totalInvalidRecords} malformed record(s) detected and will be safely excluded.
                      </span>
                    </div>
                  )}
                </div>

                {/* Cloud Status & Strategy Choice */}
                {conflictReport && conflictReport.hasExistingCloudData && (
                  <div className="bg-slate-950 border border-slate-850 rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">
                        Existing Cloud Records Detected
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {conflictReport.totalConflicts} matching ID(s)
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Your cloud account already contains saved data. Choose how to resolve conflicting record IDs:
                    </p>

                    <div className="space-y-2 pt-1">
                      <label
                        className={`flex items-start space-x-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          strategy === "merge"
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-slate-800 hover:border-slate-700 bg-slate-900/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="migrationStrategy"
                          value="merge"
                          checked={strategy === "merge"}
                          onChange={() => setStrategy("merge")}
                          className="mt-0.5 text-amber-500 focus:ring-0"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-slate-200 block">
                            Merge (Preserve existing cloud records)
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Uploads new local entries and updates profile stats while preserving all existing cloud records.
                          </span>
                        </div>
                      </label>

                      <label
                        className={`flex items-start space-x-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          strategy === "keep_cloud"
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-slate-800 hover:border-slate-700 bg-slate-900/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="migrationStrategy"
                          value="keep_cloud"
                          checked={strategy === "keep_cloud"}
                          onChange={() => setStrategy("keep_cloud")}
                          className="mt-0.5 text-amber-500 focus:ring-0"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-slate-200 block">
                            Keep Cloud Data (Strict Skip)
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Skips any local records with matching IDs and keeps all cloud profile stats untouched.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* In-Flight Migration Progress */}
        {isMigrating && (
          <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium">{progressStep}</span>
              <span className="font-mono text-amber-500 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Uploading batches and running read-back verification. Please keep this window open.
            </p>
          </div>
        )}

        {/* Migration Result Screen */}
        {migrationResult && (
          <div className="space-y-4">
            {migrationResult.success ? (
              <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Migration Successfully Completed!</span>
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <p>
                    • Workouts migrated:{" "}
                    <strong className="text-emerald-300">{migrationResult.migratedCounts.workouts}</strong>
                  </p>
                  <p>
                    • Reflections migrated:{" "}
                    <strong className="text-emerald-300">{migrationResult.migratedCounts.journals}</strong>
                  </p>
                  <p>
                    • Meals migrated:{" "}
                    <strong className="text-emerald-300">{migrationResult.migratedCounts.meals}</strong>
                  </p>
                  <p>
                    • Custom routines migrated:{" "}
                    <strong className="text-emerald-300">{migrationResult.migratedCounts.customRoutines}</strong>
                  </p>
                  <p>
                    • Coach messages migrated:{" "}
                    <strong className="text-emerald-300">{migrationResult.migratedCounts.messages}</strong>
                  </p>
                  {migrationResult.skippedCounts.conflicts > 0 && (
                    <p className="text-slate-400 text-[11px]">
                      • Skipped conflicting duplicates:{" "}
                      <strong>{migrationResult.skippedCounts.conflicts}</strong>
                    </p>
                  )}
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-emerald-950 text-[11px] text-emerald-300/90">
                  Read-back verified: {migrationResult.verification.totalVerifiedCloudRecords} cloud records intact. Local device records remain completely unchanged.
                </div>
              </div>
            ) : (
              <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center space-x-2 text-red-400 font-bold text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>Migration Encountered an Error</span>
                </div>
                <p className="text-xs text-red-300">{migrationResult.error}</p>
                <p className="text-[11px] text-slate-400">
                  No local data was lost. Because all cloud documents use deterministic IDs, you can safely retry without duplicating records.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal Action Footer */}
        <div className="pt-2 flex items-center justify-end space-x-2.5 border-t border-slate-800/80">
          {!migrationResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isMigrating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartMigration}
                disabled={isMigrating || !scanResult?.hasData}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {isMigrating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Migrating...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Copy to Cloud</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </>
          ) : migrationResult.success ? (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors shadow cursor-pointer"
            >
              Done & Return to App
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartMigration}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow flex items-center space-x-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Migration</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
