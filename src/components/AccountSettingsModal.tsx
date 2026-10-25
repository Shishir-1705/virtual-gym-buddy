import React, { useState } from "react";
import {
  User,
  KeyRound,
  CloudUpload,
  Trash2,
  LogOut,
  X,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldAlert
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { clearUserCloudData } from "../services/firestoreService";

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMigration: () => void;
  hasLocalData: boolean;
}

export default function AccountSettingsModal({
  isOpen,
  onClose,
  onOpenMigration,
  hasLocalData
}: AccountSettingsModalProps) {
  const { user, logout, sendPasswordReset, reauthenticate, deleteAccount } = useAuth();

  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Account deletion states
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");

  if (!isOpen || !user) return null;

  const handlePasswordReset = async () => {
    if (!user.email) return;
    setResetLoading(true);
    setResetError(null);
    setPasswordResetSent(false);

    try {
      await sendPasswordReset(user.email);
      setPasswordResetSent(true);
      setTimeout(() => setPasswordResetSent(false), 6000);
    } catch (err: any) {
      setResetError(err.message || "Failed to send password reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (confirmInput.trim().toUpperCase() !== "DELETE") {
      setDeleteError('Please type "DELETE" to confirm.');
      return;
    }
    if (!reauthPassword) {
      setDeleteError("Please enter your account password to verify identity.");
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // 1. Re-authenticate user FIRST to verify identity before any data deletion
      await reauthenticate(reauthPassword);

      // 2. Purge all cloud collections and profile in Firestore while user is verified & authenticated
      await clearUserCloudData(user.uid);

      // 3. Delete Auth account
      await deleteAccount();

      // 4. Close modal on complete success
      onClose();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete account. Cloud data has been safely preserved.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[125] flex items-center justify-center p-4 animate-fade-in select-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-5 shadow-2xl relative text-slate-100"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-500">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 id="account-settings-title" className="text-sm sm:text-base font-bold text-slate-100">
                Account Settings
              </h3>
              <p className="text-[11px] text-slate-400">Manage your profile and security credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Identity Card */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Signed In Account</span>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-950 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Cloud Synced
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">{user.email}</p>
          <p className="text-[10px] font-mono text-slate-500 truncate">UID: {user.uid}</p>
        </div>

        {/* Action: Data Migration */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-3.5 flex items-center justify-between">
          <div className="space-y-0.5 max-w-[240px]">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <CloudUpload className="w-3.5 h-3.5 text-amber-500" />
              <span>Migrate Local Guest Data</span>
            </h4>
            <p className="text-[10px] text-slate-400">
              {hasLocalData
                ? "Guest data detected on this device. Copy it to your account."
                : "No unmigrated guest records found on this device."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMigration();
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow cursor-pointer shrink-0"
          >
            Migrate
          </button>
        </div>

        {/* Action: Password Reset */}
        <div className="bg-slate-950 border border-slate-850 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                <span>Password & Security</span>
              </h4>
              <p className="text-[10px] text-slate-400">Send a password reset link to your email</p>
            </div>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              {resetLoading ? "Sending..." : "Reset Password"}
            </button>
          </div>

          {passwordResetSent && (
            <div className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-[11px] text-emerald-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Reset link sent! Please check your inbox.</span>
            </div>
          )}

          {resetError && (
            <div className="p-2 rounded-xl bg-red-950/30 border border-red-900/50 text-[11px] text-red-300 flex items-center space-x-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span>{resetError}</span>
            </div>
          )}
        </div>

        {/* Action: Account Deletion (Danger Zone) */}
        {!showDeleteConfirm ? (
          <div className="pt-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => logout().then(onClose)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-400 hover:text-red-300 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete account</span>
            </button>
          </div>
        ) : (
          <div className="bg-red-950/20 border border-red-900/60 rounded-2xl p-4 space-y-3 animate-fade-in">
            <div className="flex items-center space-x-2 text-red-400 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Delete Cloud Account & All Data</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              This action permanently deletes your cloud workouts, reflections, meals, custom routines, and chat history from Firestore. Local guest records on this device remain untouched.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[10px] text-slate-400 font-semibold uppercase">
                Type <strong className="text-red-400">DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-slate-950 border border-red-950 focus:border-red-600 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[10px] text-amber-400 font-semibold uppercase">
                Account Password (Verification Required)
              </label>
              <input
                type="password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                placeholder="Enter password to verify identity"
                className="w-full bg-slate-950 border border-slate-800 focus:border-red-600 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
            </div>

            {deleteError && (
              <div className="text-[11px] text-red-400 flex items-center space-x-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                  setConfirmInput("");
                  setReauthPassword("");
                }}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                disabled={isDeleting || confirmInput.trim().toUpperCase() !== "DELETE" || !reauthPassword}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-slate-950 text-xs font-bold transition-colors shadow cursor-pointer disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Deleting Data...</span>
                  </>
                ) : (
                  <span>Permanently Delete</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
