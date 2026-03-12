import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { motion } from "motion/react";
import { inputClass, labelClass } from "../lib/formClasses";
import { apiUrl } from "../lib/api";
import { getAuthErrorMessage } from "../lib/getAuthErrorMessage";

export default function PasswordResetPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Request reset link (forgot password form)
  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || getAuthErrorMessage(null, "forgot"));
        return;
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, "forgot"));
    } finally {
      setLoading(false);
    }
  };

  // Set new password (when user landed with token from email)
  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("The two passwords you entered do not match. Please enter them again.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch(apiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || getAuthErrorMessage(null, "reset"));
        return;
      }
      setSuccess(true);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, "reset"));
    } finally {
      setLoading(false);
    }
  };

  const isSetPasswordMode = Boolean(tokenFromUrl);
  const backgroundImage = isSetPasswordMode ? "url(/new%20password.webp)" : "url(/reset%20password.webp)";

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage }}
        aria-hidden
      />
      <Link
        to="/"
        className="absolute top-4 left-4 sm:left-6 z-20 flex items-center"
        aria-label="Newsa home"
      >
        <img
          src="/newsa%20app%20logo.webp"
          alt="Newsa"
          className="h-10 w-auto object-contain"
        />
      </Link>
      <div className="relative z-10 w-full flex justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[480px] card p-8"
      >
        {isSetPasswordMode ? (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Set new password</h1>
              <p className="text-slate-500">
                Enter your new password below. You can then sign in with it.
              </p>
            </div>

            {success ? (
              <div className="text-center py-4">
                <p className="text-green-600 font-medium mb-2">Password updated</p>
                <p className="text-sm text-slate-500 mb-6">
                  You can now sign in with your new password.
                </p>
                <Link to="/login" className="btn-primary inline-block">
                  Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className={labelClass}>New password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className={inputClass}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update password"}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
                <Mail className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Reset password</h1>
              <p className="text-slate-500">
                Enter your email and we’ll send you a link to reset your password.
              </p>
            </div>

            {success ? (
              <div className="text-center py-4">
                <p className="text-green-600 font-medium mb-2">Check your email</p>
                <p className="text-sm text-slate-500 mb-6">
                  We’ve sent a password reset link to <strong>{email}</strong>. Click the link to set a new password.
                </p>
                <Link to="/login" className="btn-primary inline-block">
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRequestLink} className="space-y-4">
                <div>
                  <label className={labelClass}>Email address</label>
                  <input
                    type="email"
                    required
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send reset link"}
                </button>
              </form>
            )}
          </>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Remember your password?{" "}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </motion.div>
      </div>
    </div>
  );
}
