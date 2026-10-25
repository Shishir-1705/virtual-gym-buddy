import React, { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../lib/firebase";

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map common Firebase Auth error codes to user-friendly messages
export function formatAuthError(errorCode: string, fallbackMessage?: string): string {
  switch (errorCode) {
    case "auth/invalid-email":
      return "Invalid email address format.";
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again.";
    case "auth/invalid-credential":
      return "Incorrect email or password. Please try again.";
    case "auth/email-already-in-use":
      return "An account already exists with this email address.";
    case "auth/weak-password":
      return "Password is too weak. Firebase requires at least 6 characters.";
    case "auth/network-request-failed":
      return "Network error. Please verify your internet or emulator connection.";
    case "auth/too-many-requests":
      return "Too many failed login attempts. Access temporarily restricted for security.";
    case "auth/operation-not-allowed":
      return "Email and password authentication is not enabled on this Firebase project.";
    case "auth/requires-recent-login":
      return "This action requires recent authentication. Please enter your password to confirm.";
    case "auth/user-mismatch":
      return "The provided credential does not match the signed-in user.";
    default:
      return fallbackMessage || "An unexpected authentication error occurred. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  useEffect(() => {
    let isMounted = true;

    if (!isFirebaseConfigured || !auth) {
      if (isMounted) {
        setUser(null);
        setLoading(false);
      }
      return;
    }

    // Configure browser-local persistence so sessions persist across reloads
    setPersistence(auth, browserLocalPersistence).catch((persistErr) => {
      console.warn("[Firebase Auth] Failed to enable browserLocalPersistence:", persistErr);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (isMounted) {
          setUser(currentUser);
          setLoading(false);
          clearError();
        }
      },
      (authErr) => {
        if (isMounted) {
          console.error("[Firebase Auth] Auth state change error:", authErr);
          setError(formatAuthError(authErr.name, authErr.message));
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      const msg = "Authentication is not configured. Running in Guest Mode.";
      setError(msg);
      throw new Error(msg);
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const msg = "Please enter your email address.";
      setError(msg);
      throw new Error(msg);
    }
    if (!password) {
      const msg = "Please enter your password.";
      setError(msg);
      throw new Error(msg);
    }

    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      throw new Error(formatted);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      const msg = "Authentication is not configured. Running in Guest Mode.";
      setError(msg);
      throw new Error(msg);
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const msg = "Please enter an email address.";
      setError(msg);
      throw new Error(msg);
    }
    if (!password) {
      const msg = "Please enter a password.";
      setError(msg);
      throw new Error(msg);
    }
    if (password.length < 6) {
      const msg = "Password must be at least 6 characters long.";
      setError(msg);
      throw new Error(msg);
    }

    setError(null);
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      throw new Error(formatted);
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    if (!auth) {
      setUser(null);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      throw new Error(formatted);
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      const msg = "Authentication is not configured. Running in Guest Mode.";
      setError(msg);
      throw new Error(msg);
    }

    const trimmed = email.trim();
    if (!trimmed) {
      const msg = "Please enter an email address.";
      setError(msg);
      throw new Error(msg);
    }

    setError(null);
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      throw new Error(formatted);
    } finally {
      setLoading(false);
    }
  };

  const reauthenticate = async (password: string): Promise<void> => {
    if (!auth || !auth.currentUser || !auth.currentUser.email) {
      const msg = "No authenticated user to re-authenticate.";
      setError(msg);
      throw new Error(msg);
    }
    const currentUser = auth.currentUser;
    setError(null);
    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      const customErr: any = new Error(formatted);
      customErr.code = err.code;
      throw customErr;
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (password?: string): Promise<void> => {
    if (!auth || !auth.currentUser) {
      const msg = "No authenticated user to delete.";
      setError(msg);
      throw new Error(msg);
    }

    const currentUser = auth.currentUser;
    setError(null);
    setLoading(true);
    try {
      if (password && currentUser.email) {
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);
      }
      await deleteUser(currentUser);
      setUser(null);
    } catch (err: any) {
      const formatted = formatAuthError(err.code, err.message);
      setError(formatted);
      const customErr: any = new Error(formatted);
      customErr.code = err.code;
      throw customErr;
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    error,
    isGuest: !user,
    isConfigured: isFirebaseConfigured,
    login,
    register,
    logout,
    sendPasswordReset,
    reauthenticate,
    deleteAccount,
    clearError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
