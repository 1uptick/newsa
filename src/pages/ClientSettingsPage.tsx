import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, Key, Mail, Camera, User } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { auth, storage } from "../services/firebase";
import { inputClass, labelClass } from "../lib/formClasses";
import { getDefaultAvatarUrl, getDefaultAvatarUrlJpg } from "../lib/getDefaultAvatarUrl";
import { getDefaultDisplayName } from "../lib/getDefaultDisplayName";
import { updatePassword, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function ClientSettingsPage() {
  const { user, refreshUser, role, groupName } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [defaultAvatarFallback, setDefaultAvatarFallback] = useState<0 | 1 | 2>(0);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName || getDefaultDisplayName(user?.email ?? "") || "");
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    setDefaultAvatarFallback(0);
  }, [role, groupName]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (profilePhotoFile && !storage) {
      setProfileError("Profile photo upload is not available. Check Firebase Storage configuration.");
      return;
    }
    setProfileError("");
    setProfileSuccess(false);
    setProfileLoading(true);
    try {
      const updates: { displayName?: string; photoURL?: string } = {};
      if (displayName.trim() !== (auth.currentUser.displayName || "")) {
        updates.displayName = displayName.trim() || null;
      }
      if (profilePhotoFile && storage) {
        const path = `profile/${auth.currentUser.uid}/avatar`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, profilePhotoFile);
        const photoURL = await getDownloadURL(storageRef);
        updates.photoURL = photoURL;
      }
      if (Object.keys(updates).length > 0) {
        await updateProfile(auth.currentUser, updates);
        if (auth.currentUser.reload) {
          await auth.currentUser.reload();
        }
        refreshUser();
        setProfileSuccess(true);
        setProfilePhotoFile(null);
        setProfilePhotoPreview(null);
      }
    } catch (err: any) {
      setProfileError(err?.message || "Failed to update profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Please select an image file (e.g. JPG, PNG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Image must be under 2 MB.");
      return;
    }
    setProfileError("");
    setProfilePhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setProfilePhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!auth.currentUser?.email) {
      setError("You must be signed in to change password.");
      return;
    }
    setLoading(true);
    try {
      if (typeof reauthenticateWithCredential === "undefined" || typeof EmailAuthProvider === "undefined") {
        setError("Password change is not available in this environment.");
        return;
      }
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      if (typeof updatePassword === "function") {
        await updatePassword(auth.currentUser, newPassword);
      } else {
        setError("Password update not configured.");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.section
        id="profile"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 mb-6 rounded-xl"
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Profile
        </h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-8 items-start">
            {/* Left: profile pic + change button, centered */}
            <div className="flex flex-col items-center justify-center gap-3">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-slate-600 font-semibold text-2xl border-2 border-slate-200">
                      {profilePhotoPreview ? (
                        <img src={profilePhotoPreview} alt="" className="w-full h-full object-cover" />
                      ) : user?.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : defaultAvatarFallback < 2 && (getDefaultAvatarUrl(role, groupName) || getDefaultAvatarUrlJpg(role, groupName)) ? (
                        <img
                          src={
                            defaultAvatarFallback === 0
                              ? (getDefaultAvatarUrl(role, groupName) ?? getDefaultAvatarUrlJpg(role, groupName))!
                              : (getDefaultAvatarUrlJpg(role, groupName) ?? getDefaultAvatarUrl(role, groupName))!
                          }
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setDefaultAvatarFallback((f) => (f < 2 ? (f + 1) as 0 | 1 | 2 : 2))}
                        />
                      ) : (
                        <span>
                          {(user?.displayName || getDefaultDisplayName(user?.email) || "?")
                            .slice(0, 2)
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .toUpperCase() || "?"}
                        </span>
                      )}
                    </div>
                    {storage && (
                      <label className="absolute bottom-0 right-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white cursor-pointer hover:bg-primary/90 transition-colors shadow">
                        <Camera className="w-4 h-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={handlePhotoChange}
                        />
                      </label>
                    )}
                  </div>
            {storage && (
              <span className="text-xs text-slate-500">Change photo</span>
            )}
          </div>
          {/* Right: name and email */}
          <div className="min-w-0 space-y-4">
            <div>
              <label className={labelClass}>Name</label>
              <input
                type="text"
                className={inputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <p className="text-sm font-medium text-slate-900 mt-1">{user?.email ?? "—"}</p>
            </div>
            {profilePhotoFile && (
              <p className="text-sm text-slate-600">
                New photo selected. Click &quot;Update profile&quot; to save.
              </p>
            )}
          </div>
        </div>
        {profileError && <p className="text-red-500 text-sm">{profileError}</p>}
        {profileSuccess && <p className="text-green-600 text-sm">Profile updated successfully.</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={profileLoading} className="btn-primary flex items-center gap-2">
            {profileLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <User className="w-5 h-5" />}
            Update profile
          </button>
        </div>
        </form>
      </motion.section>

      <motion.section
        id="change-password"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card p-6 mb-6 rounded-xl"
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Change password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Current password</label>
            <input
              type="password"
              required
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>New password</label>
            <input type="password" required minLength={6} className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Confirm new password</label>
            <input type="password" required minLength={6} className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {success && <p className="text-green-600 text-sm">Password updated successfully.</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update password"}
            </button>
          </div>
        </form>
      </motion.section>

      <p className="mt-6 text-sm text-slate-500">
        <Link to="/" className="text-primary hover:underline">Back to Dashboard</Link>
      </p>
    </>
  );
}
