import React, { useState, useEffect, useRef } from "react";
import { X, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, Dumbbell, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "signin" | "register";
}

export default function AuthModal({ isOpen, onClose, initialMode = "signin" }: AuthModalProps) {
  const { login, register, error, clearError, isConfigured } = useAuth();
  const [mode, setMode] = useState<"signin" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localValidationErr, setLocalValidationErr] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Sync mode with prop when opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setEmail("");
      setPassword("");
      setShowPassword(false);
      setLocalValidationErr(null);
      clearError();
      setTimeout(() => emailInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialMode]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationErr(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalValidationErr("Please enter your email address.");
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalValidationErr("Please enter a valid email address.");
      return;
    }

    if (!password) {
      setLocalValidationErr("Please enter your password.");
      return;
    }

    if (mode === "register" && password.length < 6) {
      setLocalValidationErr("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password);
      }
      onClose();
    } catch {
      // Error handled by AuthContext; displayed via context error
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeError = localValidationErr || error;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-hidden">
        
        {/* Subtle decorative top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-full" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close authentication modal and continue as guest"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-full transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl mb-3 shadow-inner">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h2 id="auth-modal-title" className="text-lg font-bold text-slate-100 tracking-tight">
            {mode === "signin" ? "Welcome Back, Champ" : "Create Your Account"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === "signin"
              ? "Sign in to access your cloud profile & history"
              : "Register to save your workouts and progress across devices"}
          </p>
        </div>

        {/* Configuration Notice (if Firebase is not configured) */}
        {!isConfigured && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-200">Firebase Not Configured</p>
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                Client authentication credentials are not set in the environment. You can continue using all features in Guest Mode.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {activeError && (
          <div
            className="mb-4 p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{activeError}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div>
            <label htmlFor="auth-email" className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                ref={emailInputRef}
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="athlete@gymbuddy.com"
                autoComplete="email"
                disabled={isSubmitting}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="auth-password" className="block text-[11px] font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 6 characters" : "Enter your password"}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                disabled={isSubmitting}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 active:scale-[0.99] text-white font-semibold rounded-xl text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{mode === "signin" ? "Signing In..." : "Creating Account..."}</span>
              </>
            ) : (
              <>
                <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode Footer */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-xs text-slate-400">
            {mode === "signin" ? "Don't have an account yet?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "register" : "signin");
                setLocalValidationErr(null);
                clearError();
              }}
              disabled={isSubmitting}
              className="text-amber-400 hover:text-amber-300 font-semibold transition-colors disabled:opacity-50 underline underline-offset-2 ml-1"
            >
              {mode === "signin" ? "Register now" : "Sign in here"}
            </button>
          </p>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="mt-3 text-[11px] text-slate-500 hover:text-slate-400 transition-colors block mx-auto"
          >
            Continue as Guest without signing in
          </button>
        </div>

      </div>
    </div>
  );
}
