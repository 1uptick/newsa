/**
 * Maps Firebase/auth and API error codes to user-friendly, professional messages.
 */

const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-credential":
    "The email or password you entered is incorrect. Please check your credentials and try again.",
  "auth/invalid-email":
    "Please enter a valid email address.",
  "auth/user-disabled":
    "This account has been disabled. Please contact support if you need assistance.",
  "auth/user-not-found":
    "The email or password you entered is incorrect. Please check your credentials and try again.",
  "auth/wrong-password":
    "The email or password you entered is incorrect. Please check your credentials and try again.",
  "auth/email-already-in-use":
    "This email address is already registered. Please sign in or use a different email.",
  "auth/weak-password":
    "Please choose a stronger password (at least 6 characters).",
  "auth/too-many-requests":
    "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed":
    "A network error occurred. Please check your connection and try again.",
  "auth/expired-action-code":
    "This link has expired. Please request a new password reset link.",
  "auth/invalid-action-code":
    "This link is invalid or has already been used. Please request a new password reset link.",
};

/** Extract Firebase-style code from message like "Firebase: Error (auth/invalid-credential)." */
function getCodeFromMessage(message: string): string | null {
  const match = message?.match(/\(auth\/([^)]+)\)/);
  return match ? `auth/${match[1]}` : null;
}

export type AuthErrorContext = "login" | "register" | "reset" | "forgot";

const DEFAULT_MESSAGES: Record<AuthErrorContext, string> = {
  login: "We couldn't sign you in. Please check your email and password and try again.",
  register: "Registration could not be completed. Please try again or contact support if the issue persists.",
  reset: "We couldn't update your password. Please try again or request a new reset link.",
  forgot: "We couldn't send the reset link. Please check the email address and try again.",
};

/**
 * Returns a professional, user-facing error message for auth flows.
 * Handles Firebase errors (code or message) and falls back to context-specific defaults.
 */
export function getAuthErrorMessage(
  error: unknown,
  context: AuthErrorContext = "login"
): string {
  const err = error as { code?: string; message?: string } | undefined;
  const code = err?.code ?? (err?.message ? getCodeFromMessage(err.message) : null);
  if (code && FIREBASE_MESSAGES[code]) return FIREBASE_MESSAGES[code];
  if (typeof err?.message === "string" && err.message.trim().length > 0) {
    // Don't expose raw Firebase message; use default for unknown codes
    if (err.message.includes("Firebase") || err.message.includes("auth/")) {
      return DEFAULT_MESSAGES[context];
    }
    return err.message;
  }
  return DEFAULT_MESSAGES[context];
}
