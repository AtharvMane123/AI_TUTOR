"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAITeacher } from "@/hooks/useAITeacher";

export default function LoginPage() {
  const router = useRouter();
  const setProfileStore = useAITeacher((state) => state.setProfile);
  const [name, setName] = useState("");
  const [standard, setStandard] = useState("");
  const [age, setAge] = useState("");
  const [secondLanguage, setSecondLanguage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("userProfile");
    if (stored) {
      const parsed = JSON.parse(stored);
      setName(parsed.name || "");
      setStandard(parsed.standard || "");
      setAge(parsed.age || "");
      setSecondLanguage(parsed.secondLanguage || "");
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !standard.trim() || !age.trim()) {
      setError("Please fill all required fields.");
      return;
    }
    const profile = { name: name.trim(), standard: standard.trim(), age: age.trim(), secondLanguage: secondLanguage.trim() };
    localStorage.setItem("userProfile", JSON.stringify(profile));
    setProfileStore(profile);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-lg bg-white/10 border border-white/15 rounded-3xl p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <p className="text-sm text-white/60">Welcome to the AI Tutor</p>
          <h1 className="text-3xl font-bold text-white">Sign up / Login</h1>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm text-white/70">Name *</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/70">Class / Standard *</label>
              <input
                className="mt-1 w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                placeholder="e.g., 6th"
              />
            </div>
            <div>
              <label className="text-sm text-white/70">Age *</label>
              <input
                type="number"
                min="3"
                className="mt-1 w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g., 11"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-white/70">Second language (optional)</label>
            <input
              className="mt-1 w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={secondLanguage}
              onChange={(e) => setSecondLanguage(e.target.value)}
              placeholder="e.g., Hindi"
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/30 transition"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
