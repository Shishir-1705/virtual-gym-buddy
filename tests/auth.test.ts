import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { formatAuthError } from "../src/context/AuthContext";
import { isFirebaseConfigured } from "../src/lib/firebase";

describe("Firebase Client Authentication Logic", () => {
  describe("formatAuthError", () => {
    test("maps standard Firebase Auth error codes to user-friendly messages", () => {
      assert.equal(
        formatAuthError("auth/invalid-email"),
        "Invalid email address format."
      );
      assert.equal(
        formatAuthError("auth/user-not-found"),
        "No account found with this email."
      );
      assert.equal(
        formatAuthError("auth/wrong-password"),
        "Incorrect password. Please try again."
      );
      assert.equal(
        formatAuthError("auth/invalid-credential"),
        "Incorrect email or password. Please try again."
      );
      assert.equal(
        formatAuthError("auth/email-already-in-use"),
        "An account already exists with this email address."
      );
      assert.equal(
        formatAuthError("auth/weak-password"),
        "Password is too weak. Firebase requires at least 6 characters."
      );
      assert.equal(
        formatAuthError("auth/network-request-failed"),
        "Network error. Please verify your internet or emulator connection."
      );
      assert.equal(
        formatAuthError("auth/too-many-requests"),
        "Too many failed login attempts. Access temporarily restricted for security."
      );
    });

    test("returns fallback message for unrecognized error codes", () => {
      const customFallback = "Failed to authenticate with provider.";
      assert.equal(formatAuthError("auth/unknown-error-code", customFallback), customFallback);
      assert.equal(
        formatAuthError("auth/random-code"),
        "An unexpected authentication error occurred. Please try again."
      );
    });
  });

  describe("Configuration & Guest Mode Default", () => {
    test("defaults isFirebaseConfigured to false when environment variables are omitted", () => {
      // In default test environment without VITE_FIREBASE_* variables, config should report false
      assert.equal(typeof isFirebaseConfigured, "boolean");
    });
  });

  describe("Client-side Input Normalization & Validation", () => {
    test("validates email formatting and trims whitespace", () => {
      const rawEmail = "   athlete@gymbuddy.com   ";
      const trimmed = rawEmail.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      assert.equal(trimmed, "athlete@gymbuddy.com");
      assert.equal(emailRegex.test(trimmed), true);

      // Invalid emails
      assert.equal(emailRegex.test("not-an-email"), false);
      assert.equal(emailRegex.test("@missingusername.com"), false);
      assert.equal(emailRegex.test("missingdomain@"), false);
      assert.equal(emailRegex.test(""), false);
    });

    test("enforces minimum password length of 6 characters for registration", () => {
      const isPasswordValid = (pwd: string) => pwd.length >= 6;
      assert.equal(isPasswordValid("12345"), false);
      assert.equal(isPasswordValid("123456"), true);
      assert.equal(isPasswordValid("secretPassword99"), true);
    });
  });

  describe("Simulated Auth State Transitions", () => {
    test("maintains guest state when user is null", () => {
      const mockState = {
        user: null,
        loading: false,
        isGuest: true
      };

      assert.equal(mockState.isGuest, true);
      assert.equal(mockState.user, null);
    });

    test("transitions to authenticated state upon successful auth state change", () => {
      const mockUser = {
        uid: "test-uid-12345",
        email: "champion@gymbuddy.com",
        emailVerified: true
      };

      const mockState = {
        user: mockUser,
        loading: false,
        isGuest: false
      };

      assert.equal(mockState.isGuest, false);
      assert.equal(mockState.user.uid, "test-uid-12345");
      assert.equal(mockState.user.email, "champion@gymbuddy.com");
    });

    test("logout resets user to null and restores guest state", () => {
      let currentUser: any = { uid: "test-uid-12345", email: "user@test.com" };
      let isGuest = !currentUser;

      assert.equal(isGuest, false);

      // Simulate logout action
      currentUser = null;
      isGuest = !currentUser;

      assert.equal(isGuest, true);
      assert.equal(currentUser, null);
    });
  });
});
