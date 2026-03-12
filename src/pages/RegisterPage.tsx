import React, { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { inputClass, labelClass } from "../lib/formClasses";
import { getDefaultDisplayName } from "../lib/getDefaultDisplayName";
import { apiUrl } from "../lib/api";
import { getAuthErrorMessage } from "../lib/getAuthErrorMessage";

export default function RegisterPage() {
  const { refreshAuth } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email")?.trim() ?? "");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState(
    () => (searchParams.get("code")?.trim() ?? "").toUpperCase()
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const verifyRes = await fetch(apiUrl("/api/auth/verify-invitation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationCode }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.error);
        setLoading(false);
        return;
      }

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const token = await userCred.user.getIdToken();

      const useRes = await fetch(apiUrl("/api/auth/use-invitation"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invitationCode }),
      });
      if (!useRes.ok) {
        const useData = await useRes.json().catch(() => ({}));
        throw new Error(useData.error || "Failed to apply invitation");
      }

      const defaultName = getDefaultDisplayName(email);
      if (defaultName && userCred.user) {
        await updateProfile(userCred.user, { displayName: defaultName });
      }

      await refreshAuth();
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, "register"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/registation%20background.webp)" }}
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
        className="w-full max-w-[550px] card p-8"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Join Newsa</h1>
          <p className="text-slate-500">Registration is by invitation only</p>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="bg-green-100 text-green-600 p-4 rounded-lg mb-4">
              Registration successful! Redirecting...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Invitation Code</label>
              <input type="text" required placeholder="XXXX-XXXX" className={`${inputClass} uppercase`} value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Register"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </motion.div>
      </div>
    </div>
  );
}
