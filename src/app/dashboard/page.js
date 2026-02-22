"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAITeacher } from "@/hooks/useAITeacher";

const subjects = [
  {
    grade: "6th Grade",
    gradeValue: "6th",
    name: "Math",
    id: "math-6",
    units: [
      {
        name: "Algebra",
        id: "algebra",
        topics: [
          { name: "Fractions", id: "fractions" },
          { name: "Decimals", id: "decimals" },
          { name: "Linear Equations", id: "linear-equations" },
        ],
      },
    ],
  },
  {
    grade: "6th Grade",
    gradeValue: "6th",
    name: "Science",
    id: "science-6",
    units: [
      {
        name: "Chemistry",
        id: "chemistry",
        topics: [
          { name: "States of Matter", id: "states-of-matter" },
          { name: "Acids and Bases", id: "acids-and-bases" },
          { name: "Elements and Compounds", id: "elements-and-compounds" },
        ],
      },
      {
        name: "Environmental Science",
        id: "environmental-science",
        topics: [
          { name: "Ecosystems", id: "ecosystems" },
          { name: "Water Cycle", id: "water-cycle" },
          { name: "Renewable Energy", id: "renewable-energy" },
        ],
      },
    ],
  },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState(null);
  const [activeDates, setActiveDates] = useState([]);
  const [expandedSubject, setExpandedSubject] = useState(null);
  const [expandedUnit, setExpandedUnit] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const router = useRouter();
  const setActiveSession = useAITeacher((state) => state.setActiveSession);
  const setProfileStore = useAITeacher((state) => state.setProfile);
    const loadLastQuizScore = useAITeacher((state) => state.loadLastQuizScore);
  const consumePendingLessonPrompt = useAITeacher((state) => state.consumePendingLessonPrompt);
  const askAI = useAITeacher((state) => state.askAI);
  const lastQuizScore = useAITeacher((state) => state.lastQuizScore);

  useEffect(() => {
    const stored = localStorage.getItem("userProfile");
    if (stored) {
      setProfile(JSON.parse(stored));
      setProfileStore(JSON.parse(stored));
    }
    loadLastQuizScore();

    // Seed last 10 days (including today) as active streak dates
    const makeLastNDates = (n) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        out.push(d.toISOString().split("T")[0]);
      }
      return out;
    };
    setActiveDates(makeLastNDates(10));
  }, []);

  const handleLearn = (topic, subjectName, unitName, gradeValue) => {
    setSelectedTopic(topic);
    setActiveSession({
      grade: gradeValue || "6th",
      subject: subjectName,
      unit: unitName,
      topic: topic.name,
    });
    // Fire the lesson immediately so the student sees an answer without extra clicks
    const promptFromSession = consumePendingLessonPrompt();
    const fallbackPrompt = `Explain ${topic.name} for ${gradeValue || "6th"} ${subjectName} in simple steps.`;
    const promptToAsk = promptFromSession || fallbackPrompt;
    askAI(promptToAsk);
    // Navigate back to tutor with session active (client-side to preserve store)
    router.push("/");
  };

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = today.toLocaleString("default", { month: "long" });

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push({ key: `empty-${i}`, label: "", active: false, empty: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const iso = dateObj.toISOString().split("T")[0];
    const isActive = activeDates.includes(iso);
    calendarDays.push({ key: d, label: d, active: isActive, empty: false });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">Welcome back</p>
            <h1 className="text-3xl font-bold">Dashboard</h1>
          </div>
          <Link
            href="/"
            className="text-sm px-4 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 transition"
          >
            ← Back to Tutor
          </Link>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2 rounded-2xl p-6 bg-white/5 border border-white/10 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Learning Paths</h2>
              {selectedTopic && (
                <span className="text-emerald-300 text-sm">Ready to learn: {selectedTopic.name}</span>
              )}
            </div>
            <div className="space-y-3">
              {subjects.map((subj) => (
                <div key={subj.id} className="rounded-xl border border-white/10 bg-white/5">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5"
                    onClick={() =>
                      setExpandedSubject(expandedSubject === subj.id ? null : subj.id)
                    }
                  >
                    <div>
                      <p className="text-sm text-white/60">{subj.grade}</p>
                      <p className="text-lg font-semibold">{subj.name}</p>
                    </div>
                    <span className="text-white/70">{expandedSubject === subj.id ? "−" : "+"}</span>
                  </button>
                  {expandedSubject === subj.id && (
                    <div className="px-4 pb-4 space-y-3">
                      {subj.units.map((unit) => (
                        <div key={unit.id} className="rounded-lg border border-white/10 bg-white/5">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5"
                            onClick={() =>
                              setExpandedUnit(expandedUnit === unit.id ? null : unit.id)
                            }
                          >
                            <span className="font-semibold">{unit.name}</span>
                            <span className="text-white/70">{expandedUnit === unit.id ? "−" : "+"}</span>
                          </button>
                          {expandedUnit === unit.id && (
                            <div className="divide-y divide-white/5">
                              {unit.topics.map((topic) => (
                                <div
                                  key={topic.id}
                                  className="flex items-center justify-between px-3 py-3 hover:bg-white/5"
                                >
                                  <span>{topic.name}</span>
                                  <button
                                    onClick={() => handleLearn(topic, subj.name, unit.name, subj.gradeValue)}
                                    className="text-sm px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-semibold shadow"
                                  >
                                    Learn
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-6 bg-white/5 border border-white/10 shadow-xl backdrop-blur space-y-4">
            <h2 className="text-xl font-semibold">Your Info</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
              <p><span className="text-white/60">Name:</span> {profile?.name || "—"}</p>
              <p><span className="text-white/60">Class:</span> {profile?.standard || "—"}</p>
              <p><span className="text-white/60">Age:</span> {profile?.age || "—"}</p>
              <p><span className="text-white/60">Second language:</span> {profile?.secondLanguage || "—"}</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
              <p className="text-sm text-white/70">Last Quiz</p>
              {lastQuizScore ? (
                <p className="text-lg font-semibold text-emerald-200">
                  {lastQuizScore.score} / {lastQuizScore.total}
                </p>
              ) : (
                <p className="text-white/60 text-sm">No quiz taken yet.</p>
              )}
            </div>

            <div className="rounded-2xl p-4 bg-emerald-500/10 border border-emerald-400/40 shadow space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-500/30 border border-emerald-400/50 grid place-items-center text-xl">
                  🔥
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeDates.length}</p>
                  <p className="text-sm text-white/70">day streak</p>
                </div>
              </div>
              <div className="border border-emerald-400/30 rounded-xl p-3 bg-white/5">
                <div className="flex items-center justify-between mb-2 text-sm text-white/70">
                  <span>{monthName} {year}</span>
                  <span className="text-emerald-300">Last 10 days active</span>
                </div>
                <div className="grid grid-cols-7 gap-2 text-xs text-white/60 mb-2">
                  {"SMTWTFS".split("").map((d) => (
                    <span key={d} className="text-center">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 text-sm">
                  {calendarDays.map((day) => (
                    <div
                      key={day.key}
                      className={`h-9 rounded-md border border-white/10 flex items-center justify-center ${
                        day.empty
                          ? "bg-transparent"
                          : day.active
                          ? "bg-emerald-400 text-emerald-950 font-semibold"
                          : "bg-white/5 text-white/80"
                      }`}
                    >
                      {day.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedTopic && (
              <div className="text-sm text-emerald-300">
                Selected: <span className="font-semibold">{selectedTopic.name}</span>
              </div>
            )}

            {!profile && (
              <Link
                href="/login"
                className="text-sm text-emerald-300 underline"
              >
                Complete your profile
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
