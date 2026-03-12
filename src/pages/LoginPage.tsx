import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { auth, isFirebaseConfigured } from "../services/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { inputClass, labelClass } from "../lib/formClasses";
import { apiUrl } from "../lib/api";
import { getAuthErrorMessage } from "../lib/getAuthErrorMessage";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverAuthReady, setServerAuthReady] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(apiUrl("/api/auth/status"))
      .then((r) => r.json())
      .then((d) => setServerAuthReady(d.firebaseAdmin))
      .catch(() => setServerAuthReady(false));
    
    // Prefetch Dashboard for faster navigation after login
    import("./Dashboard").catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, "login"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/newsa_login.webp)" }}
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
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-slate-500">Enter your credentials to access Newsa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Email Address</label>
            <input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end">
            <Link to="/reset-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
          </button>
        </form>

      </motion.div>
      </div>
    </div>
  );
}
