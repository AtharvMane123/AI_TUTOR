"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAITeacher } from "@/hooks/useAITeacher";

const fallbackSkills = [
  { skill: "Linear Equations", mastery: 0.78 },
  { skill: "Fractions", mastery: 0.64 },
  { skill: "Water Cycle", mastery: 0.82 },
  { skill: "Acids & Bases", mastery: 0.55 },
];

const fallbackHistory = [0.35, 0.42, 0.51, 0.58, 0.62, 0.70, 0.73, 0.78];

export default function TeacherDashboard() {
  const [studentName, setStudentName] = useState("–");
  const mastery = useAITeacher((s) => s.mastery);
  const masteryHistory = useAITeacher((s) => s.masteryHistory);
  const loadMastery = useAITeacher((s) => s.loadMastery);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("userProfile");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.name) setStudentName(parsed.name);
      } catch (e) {
        /* ignore */
      }
    }
    loadMastery();
  }, []);

  const skills = useMemo(() => {
    const entries = Object.entries(mastery || {});
    if (!entries.length) return fallbackSkills;
    return entries.map(([topic, val]) => ({ skill: topic, mastery: val }));
  }, [mastery]);

  const trend = useMemo(() => {
    const histories = Object.values(masteryHistory || {});
    if (!histories.length) return fallbackHistory;
    // pick the longest history as overall trend
    return histories.reduce((longest, arr) => (arr.length > longest.length ? arr : longest), histories[0]);
  }, [masteryHistory]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">Teacher view</p>
            <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
            <p className="text-white/70">Logged-in student: {studentName}</p>
          </div>
          <Link
            href="/"
            className="text-sm px-4 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition"
          >
            ← Back to Tutor
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 shadow-xl backdrop-blur space-y-4 md:col-span-1">
            <h2 className="text-xl font-semibold">Students</h2>
            <p className="text-sm text-white/70">ATHARV</p>
          </div>

          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 shadow-xl backdrop-blur space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">BKT Progress (ATHARV)</h2>
              <span className="text-sm text-white/60">Overall mastery trend</span>
            </div>

            <div className="space-y-3">
              {skills.map((item) => {
                const pct = Math.round(item.mastery * 100);
                return (
                  <div key={item.skill} className="space-y-1">
                    <div className="flex justify-between text-sm text-white/80">
                      <span>{item.skill}</span>
                      <span className="text-emerald-300 font-semibold">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400"
                        style={{ width: `${pct}%` }}
                        aria-label={`Mastery ${pct}% for ${item.skill}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-sm text-white/70 mb-2">Overall BKT trajectory</p>
              <div className="w-full h-48 rounded-xl border border-white/10 bg-white/5 p-4">
                <svg viewBox="0 0 320 120" className="w-full h-full">
                  <defs>
                    <linearGradient id="bktFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="320" height="120" rx="8" fill="url(#bktFill)" />
                  <line x1="0" y1="110" x2="320" y2="110" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <line x1="0" y1="10" x2="320" y2="10" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  {(() => {
                    const points = (trend || []).map((v, idx, arr) => {
                      const x = (idx / Math.max(arr.length - 1, 1)) * 300 + 10;
                      const y = 110 - v * 100;
                      return `${x},${y}`;
                    });
                    const polyPoints = points.join(" ");
                    return (
                      <>
                        <polyline
                          points={polyPoints}
                          fill="none"
                          stroke="#34d399"
                          strokeWidth="3"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                        {points.map((pt, i) => {
                          const [x, y] = pt.split(",").map(Number);
                          const value = Math.round((trend?.[i] || 0) * 100);
                          return (
                            <g key={i}>
                              <circle cx={x} cy={y} r={4} fill="#34d399" />
                              <text x={x} y={y - 8} fill="#e5e7eb" fontSize="10" textAnchor="middle">
                                {value}%
                              </text>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              </div>
              <p className="text-xs text-white/60 mt-1">X-axis: attempts over time · Y-axis: estimated mastery (0-100%).</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
