"use client";

import { useEffect, useState } from "react";
import { useAITeacher } from "@/hooks/useAITeacher";
import { useRouter } from "next/navigation";

export const QuizModal = () => {
  const quiz = useAITeacher((s) => s.quiz);
  const showQuiz = useAITeacher((s) => s.showQuiz);
  const quizError = useAITeacher((s) => s.quizError);
  const quizResult = useAITeacher((s) => s.quizResult);
  const showQuizResult = useAITeacher((s) => s.showQuizResult);
  const answerQuizOption = useAITeacher((s) => s.answerQuizOption);
  const setActiveSession = useAITeacher((s) => s.setActiveSession);
  const router = useRouter();

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);
  const [locked, setLocked] = useState(false);

  // Auto-return to dashboard after showing score
  useEffect(() => {
    if (showQuizResult && quizResult) {
      const t = setTimeout(() => {
        setActiveSession(null);
        router.push("/dashboard");
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [showQuizResult, quizResult, router, setActiveSession]);

  if (!showQuiz && !showQuizResult) return null;

  const isLoading = quiz?.loading;
  const currentIndex = quiz?.current || 0;
  const currentQuestion = quiz?.questions?.[currentIndex];

  const handleOption = (idx) => {
    if (locked || !quiz || quiz.loading || !currentQuestion) return;
    setLocked(true);
    setSelectedIdx(idx);
    const correct = currentQuestion.answerIndex === idx;
    setIsCorrect(correct);
    setTimeout(() => {
      answerQuizOption(idx, correct);
      setSelectedIdx(null);
      setIsCorrect(null);
      setLocked(false);
    }, 700);
  };

  if (showQuizResult && quizResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
        <div className="w-full max-w-md bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 text-white text-center">
          <h2 className="text-2xl font-bold mb-3">Quiz Finished</h2>
          <p className="text-lg">Score: {quizResult.score} / {quizResult.total}</p>
          <p className="text-sm text-white/70 mt-2">Returning to dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
      <div className="w-full max-w-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-6 text-white glass">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Quick Quiz</h2>
          <span className="text-sm text-white/70">4 questions</span>
        </div>

        {quizError && (
          <div className="text-rose-200 text-sm mb-4">
            {quizError}
          </div>
        )}

        {isLoading && (
          <div className="py-10 text-center text-white/80">Generating questions…</div>
        )}

        {!isLoading && currentQuestion && (
          <div className="space-y-6">
            <div>
              <p className="text-sm text-white/70 mb-1">Question {currentIndex + 1} of 4</p>
              <p className="text-lg font-semibold leading-relaxed">{currentQuestion.question}</p>
            </div>
            <div className="grid gap-3">
              {(currentQuestion.options || []).map((opt, idx) => {
                const isChosen = selectedIdx === idx;
                const showState = isChosen && isCorrect !== null;
                const colorClass = showState ? (isCorrect ? "border-emerald-400 bg-emerald-500/20" : "border-rose-400 bg-rose-500/20") : "border-white/15 bg-white/5 hover:bg-white/10";
                return (
                  <button
                    key={idx}
                    onClick={() => handleOption(idx)}
                    disabled={locked}
                    className={`text-left w-full px-4 py-3 rounded-2xl transition ${colorClass}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
