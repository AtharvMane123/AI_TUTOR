const { create } = require("zustand");

export const teachers = ["Nanami"];

export const useAITeacher = create((set, get) => ({
  messages: [],
  currentMessage: null,
  profile: null, // { name, standard, age, secondLanguage }
  activeSession: null, // { grade, subject, unit, topic, key }
  pendingLessonPrompt: null,
  teacher: teachers[0],
  // setTeacher removed
  classroom: "default",
  setClassroom: (classroom) => {
    set(() => ({
      classroom,
    }));
  },
  loading: false,
  furigana: true,
  setFurigana: (furigana) => {
    set(() => ({
      furigana,
    }));
  },
  english: true,
  setEnglish: (english) => {
    set(() => ({
      english,
    }));
  },
  speech: "formal",
  setSpeech: (speech) => {
    set(() => ({
      speech,
    }));
  },
  audioQueue: [],
  isSpeaking: false,
  imageResult: null,
  imageError: null,
  imageShownOnce: false,
  useAltLanguage: false,
  quiz: null,
  showQuiz: false,
  quizError: null,
  quizScore: 0,
  quizResult: null,
  showQuizResult: false,
  lastQuizScore: null,
  learningStyle: 1, // 1=normal,2=real-world examples,3=with image,4=step-by-step scaffold
  consecutiveMisses: 0,
  correctStreak: 0,

  setLearningStyle: (style) => {
    set(() => ({ learningStyle: style }));
  },

  setProfile: (profile) => {
    set(() => ({ profile }));
    if (typeof window !== "undefined") {
      localStorage.setItem("userProfile", JSON.stringify(profile));
    }
  },

  loadProfile: () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("userProfile");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        set(() => ({ profile: parsed }));
      } catch (e) {}
    }
  },

  setActiveSession: (session) => {
    // Stop any ongoing TTS when switching sessions so we don't read old answers
    get().stopMessage?.();

    const key = session
      ? `${session.grade || ""}|${session.subject || ""}|${session.unit || ""}|${session.topic || ""}`
      : null;
    const fullSession = session ? { ...session, key } : null;
    const prompt = fullSession
      ? `Explain ${fullSession.topic || "the topic"} for ${fullSession.grade || "the grade"} ${fullSession.subject || ""} in simple steps.`
      : null;
    set(() => ({
      activeSession: fullSession,
      messages: [],
      currentMessage: null,
      pendingLessonPrompt: prompt,
      learningStyle: 1,
      consecutiveMisses: 0,
      correctStreak: 0,
      imageResult: null,
      imageError: null,
      imageShownOnce: false,
      useAltLanguage: false,
      quiz: null,
      showQuiz: false,
      quizError: null,
      quizScore: 0,
      quizResult: null,
      showQuizResult: false,
      lastQuizScore: null,
    }));
    if (fullSession?.key) {
      get().loadHistory(fullSession.key);
    }
  },

  loadHistory: async (sessionKey) => {
    try {
      const res = await fetch(`/api/history?sessionKey=${encodeURIComponent(sessionKey)}`);
      if (!res.ok) return;
      const data = await res.json();
      const restored = (data.history || [])
        .map((turn, idx) => ({
          id: turn.ts || idx,
          ts: turn.ts || idx,
          question: turn.user,
          answer: turn.assistant,
          speech: "english",
          displayReady: true,
        }))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      set(() => ({ messages: restored, currentMessage: null }));
    } catch (err) {
      console.error("loadHistory error", err);
    }
  },

  consumePendingLessonPrompt: () => {
    const prompt = get().pendingLessonPrompt;
    if (prompt) {
      set(() => ({ pendingLessonPrompt: null }));
    }
    return prompt;
  },

  saveHistory: async (sessionKey, user, assistant) => {
    if (!sessionKey || !user || !assistant) return;
    try {
      await fetch(`/api/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey, user, assistant }),
      });
    } catch (err) {
      console.error("saveHistory error", err);
    }
  },

  // Stream Groq output and chunk it into sentences for low-latency TTS + lip-sync
  askAI: async (question) => {
    if (!question?.trim()) return;

    // Kill any prior TTS so the new answer is the only thing spoken
    get().stopMessage?.();

    const {
      profile,
      activeSession,
      messages: prevMessages,
      learningStyle,
      consecutiveMisses,
      correctStreak,
      useAltLanguage,
    } = get();

    // Detect signals
    const isMiss = /\b(don't know|dont know|idk|not sure|no idea|confused|lost|repeat|say again|again please|help me|can't understand|cannot understand|samajh|samajh nahi|samajh nahin|samjha)\b/i.test(
      question || ""
    );
    const isComprehension = /\b(got it|understood|understand|i get it|samajh gaya|samajh gya|samjha|ho gaya|done|correct|sahi hai|theek hai|ok understood)\b/i.test(
      question || ""
    );
    const wantsLanguageSwitch = /\b(change language|switch language|native language|apni bhasha|apni language|apni zubaan|hindi|telugu|marathi|bangla|urdu|tamizh|tamil|kannada|gujarati|punjabi|odia)\b/i.test(
      question || ""
    );
    const isStartQuiz = /\b(start quiz|quiz please|give me a quiz)\b/i.test(question || "");

    const newMisses = isMiss ? consecutiveMisses + 1 : 0;
    const nextCorrectStreak = isComprehension
      ? correctStreak + 1
      : isMiss
      ? 0
      : correctStreak; // keep streak for neutral/answering turns
    let nextLearningStyle = learningStyle;
    let nextUseAltLanguage = useAltLanguage;

    const imageAlreadyShown = get().imageShownOnce;

    // Adaptive switch: after 2 misses OR if an image was already shown and the student is still confused, force alt language
    if (newMisses >= 2 || (imageAlreadyShown && isMiss)) {
      nextLearningStyle = 3;
      nextUseAltLanguage = true;
      set(() => ({
        learningStyle: nextLearningStyle,
        consecutiveMisses: 0,
        useAltLanguage: nextUseAltLanguage,
        correctStreak: nextCorrectStreak,
      }));
    } else {
      set(() => ({
        consecutiveMisses: newMisses,
        useAltLanguage: nextUseAltLanguage,
        correctStreak: nextCorrectStreak,
      }));
    }

    // If user explicitly asks to switch language, force alt language immediately
    if (wantsLanguageSwitch && !nextUseAltLanguage) {
      nextUseAltLanguage = true;
      set(() => ({ useAltLanguage: true }));
    }

    // Trigger quiz after two correct/comprehension confirmations
    if ((nextCorrectStreak >= 2 || isStartQuiz) && !get().showQuiz) {
      set(() => ({ correctStreak: 0 }));
      get().startQuiz?.();
    }

    // Use the user's provided second language; fall back to Hindi if missing
    const altLanguage = nextUseAltLanguage
      ? (profile?.secondLanguage?.trim() || "Hindi")
      : null;

    const messageId = Date.now();
    const baseMessage = {
      question,
      id: messageId,
      ts: messageId,
      answer: "",
      speech: "english",
      displayReady: false,
    };

    set((state) => ({
      messages: [...state.messages, baseMessage],
      currentMessage: baseMessage,
      loading: true,
      imageResult: null,
      imageError: null,
    }));

    let finalMessage = baseMessage;

    const historyTurns = [...(prevMessages || [])]
      .filter((m) => m.question && m.answer)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-8)
      .map((m) => ({ user: m.question, assistant: m.answer }));

    try {
      const fetchOneImage = async (query) => {
        if (!query?.trim()) return null;
        if (get().imageShownOnce) return null;
        const { activeSession } = get();
        const sessionCtx = [
          activeSession?.grade ? `grade ${activeSession.grade}` : "",
          activeSession?.subject || "",
          activeSession?.topic || "",
        ]
          .filter(Boolean)
          .join(" ");

        const finalQuery = `${query} ${sessionCtx} kid-friendly educational diagram simple illustration`.trim();
        console.log("[image fetch inline] query", finalQuery);
        const res = await fetch(`/api/images?query=${encodeURIComponent(finalQuery)}`);
        if (!res.ok) throw new Error(`Image search failed: ${res.status}`);
        const data = await res.json();
        const image = data.image || null;
        if (image) {
          set(() => ({ imageResult: image, imageError: null, imageShownOnce: true }));
        } else {
          set(() => ({ imageResult: null, imageError: "No image found" }));
        }
        return image;
      };

      const res = await fetch("/api/ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: question,
          age: profile?.age,
          class: profile?.standard,
          topic: activeSession?.topic,
          subject: activeSession?.subject,
          grade: activeSession?.grade,
          learningStyle: nextLearningStyle,
          altLanguage,
          history: historyTurns,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Groq endpoint error: ${res.status} ${text}`);
      }

      if (!res.body) throw new Error("No response body from Groq endpoint");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let imageKeyword = null;

      const stripImageKeyword = (text) => {
        if (!text) return { cleaned: "", keyword: null };
        const lines = text.split(/\n/);
        let kw = null;
        const kept = [];
        for (const line of lines) {
          const m = line.match(/Image\s*Keyword:\s*(.+)/i);
          if (m) {
            kw = m[1].trim();
            continue;
          }
          kept.push(line);
        }
        return { cleaned: kept.join("\n").trim(), keyword: kw };
      };

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          accumulated += decoder.decode(value, { stream: !done });
          finalMessage = { ...finalMessage, answer: accumulated };

          set((state) => ({
            currentMessage: finalMessage,
            messages: state.messages.map((m) => (m.id === messageId ? finalMessage : m)),
          }));
        }
        if (done) break;
      }

      // Build cleaned full answer for display/history (strip keyword line)
      const { cleaned, keyword } = stripImageKeyword(accumulated);
      if (keyword && !imageKeyword) imageKeyword = keyword;

      // Optionally fetch image once and mention it (no URL in the text)
      let finalText = cleaned;
      if (nextLearningStyle === 3 && !get().imageShownOnce) {
        const query = imageKeyword || activeSession?.topic || question;
        try {
          await fetchOneImage(query);
        } catch (e) {
          console.error("inline image fetch failed", e);
        }
        const label = imageKeyword || activeSession?.topic || "the concept";
        const notice = `Can you see the image on the right? It shows ${label}.`;
        finalText = [cleaned, notice].filter(Boolean).join("\n\n");
      }

      // Send the full cleaned text to TTS in one batch to keep order
      if (finalText) {
        get().enqueueSpeechChunk(finalText, messageId);
      }

      // Ensure text becomes visible even if TTS failed; update to cleaned answer
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...finalMessage, answer: finalText, displayReady: true } : m
        ),
        currentMessage:
          state.currentMessage && state.currentMessage.id === messageId
            ? { ...finalMessage, answer: finalText, displayReady: true }
            : state.currentMessage,
      }));

      // persist history after full reply
      if (activeSession?.key) {
        get().saveHistory(activeSession.key, question, finalText || finalMessage.answer || accumulated);
      }

      // Fetch image; prefer LLM keyword if present, else topic, else question
      // (Handled inline above on first pass)
    } catch (err) {
      console.error("askAI streaming error", err);
      const errorMessage = { ...finalMessage, answer: "Sorry, I had trouble answering that." };
      finalMessage = errorMessage;
      set((state) => ({
        currentMessage: errorMessage,
        messages: state.messages.map((m) => (m.id === messageId ? errorMessage : m)),
      }));
    } finally {
      set((state) => ({ ...state, loading: false }));
    }
  },

  // Enqueue a TTS chunk and start playback queue if idle
  enqueueSpeechChunk: async (text, messageId) => {
    const { teacher } = get();
    if (!text?.trim()) return;

    const params = new URLSearchParams({ text: text.trim(), teacher });
    let visemes = [];
    let audioUrl;

    try {
      const res = await fetch(`/api/tts?${params.toString()}`);
      if (res.headers.get("Content-Type")?.includes("application/json")) {
        const err = await res.json();
        console.error("TTS error", err);
        return;
      }
      const audioBlob = await res.blob();
      const visemesHeader = res.headers.get("Visemes");
      try {
        visemes = JSON.parse(visemesHeader || "[]");
      } catch (e) {}
      audioUrl = URL.createObjectURL(audioBlob);
    } catch (err) {
      console.error("enqueueSpeechChunk fetch error", err);
      return;
    }

    const audioPlayer = new Audio(audioUrl);

    const queueItem = { audioPlayer, audioUrl, visemes, messageId };
    set((state) => ({
      audioQueue: [...state.audioQueue, queueItem],
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, displayReady: true } : m
      ),
      currentMessage:
        state.currentMessage && state.currentMessage.id === messageId
          ? { ...state.currentMessage, displayReady: true }
          : state.currentMessage,
    }));

    if (!get().isSpeaking) {
      get()._playNextFromQueue();
    }
  },

  fetchImage: async (query, messageId = null, label = "the concept") => {
    if (!query?.trim()) return;
    if (get().imageShownOnce) return;
    const { activeSession } = get();
    const sessionCtx = [
      activeSession?.grade ? `grade ${activeSession.grade}` : "",
      activeSession?.subject || "",
      activeSession?.topic || "",
    ]
      .filter(Boolean)
      .join(" ");

    const finalQuery = `${query} ${sessionCtx} kid-friendly educational diagram simple illustration`.trim();
    console.log("[image fetch] query", finalQuery);
    try {
      const res = await fetch(`/api/images?query=${encodeURIComponent(finalQuery)}`);
      if (!res.ok) throw new Error(`Image search failed: ${res.status}`);
      const data = await res.json();
      set(() => ({
        imageResult: data.image || null,
        imageError: data.image ? null : "No image found",
        imageShownOnce: Boolean(data.image),
      }));

      if (data.image && messageId) {
        const imageLine = `Image URL: ${data.image.url}`;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId && typeof m.answer === "string"
              ? { ...m, answer: `${m.answer}\n\n${imageLine}` }
              : m
          ),
          currentMessage:
            state.currentMessage && state.currentMessage.id === messageId && typeof state.currentMessage.answer === "string"
              ? { ...state.currentMessage, answer: `${state.currentMessage.answer}\n\n${imageLine}` }
              : state.currentMessage,
        }));
      }
    } catch (err) {
      console.error("fetchImage error", err);
      set(() => ({ imageResult: null, imageError: err.message || "Image search failed" }));
    }
  },

  startQuiz: async () => {
    const { profile, activeSession, messages } = get();
    console.log("[quiz] startQuiz invoked", {
      hasProfile: Boolean(profile),
      hasSession: Boolean(activeSession),
    });
    if (!profile && !activeSession) return;

    // Build full_content from current session messages
    const full_content = (messages || [])
      .filter((m) => m.question && m.answer)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .map((m) => ({ user: m.question, assistant: m.answer, ts: m.ts || m.id || Date.now() }));

    // Set loading state for quiz modal
    set(() => ({
      showQuiz: true,
      quizError: null,
      quiz: { loading: true, questions: [], current: 0, answers: [] },
      quizScore: 0,
      quizResult: null,
      showQuizResult: false,
    }));

    // Default Flask quiz endpoint on port 5000 (LAN IP) if env is not set
    const quizApiUrl = process.env.NEXT_PUBLIC_QUIZ_API_URL || "http://192.168.137.233:5000/generate_final";
    if (!full_content.length) {
      console.warn("[quiz] No conversation history to send to quiz API");
    }

    console.log("[quiz] POST", quizApiUrl, { full_content });

    try {
      const res = await fetch(quizApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "cors",
        body: JSON.stringify({ full_content }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[quiz] non-200", res.status, res.statusText, text);
        throw new Error(text || `Quiz generation failed (${res.status})`);
      }

      const textBody = await res.text();
      let data;
      try {
        data = JSON.parse(textBody);
      } catch (e) {
        throw new Error(`Invalid JSON from quiz API: ${textBody}`);
      }
      const rawQuestions = Array.isArray(data) ? data : data?.questions || [];
      const questions = rawQuestions
        .slice(0, 4)
        .map((q) => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const answerIndex = Math.max(0, opts.findIndex((o) => o === q.correct_answer));
          return {
            question: q.question || "",
            options: opts,
            answerIndex: answerIndex >= 0 ? answerIndex : 0,
          };
        })
        .filter((q) => q.question && (q.options || []).length === 4);

      if (!questions.length) throw new Error("No quiz questions returned");

      set(() => ({
        quiz: { questions, current: 0, answers: [], loading: false },
        showQuiz: true,
        quizError: null,
        quizScore: 0,
        quizResult: null,
        showQuizResult: false,
      }));
    } catch (err) {
      console.error("startQuiz error", err);
      // Fallback: keep modal open and show simple local quiz so the user still sees a quiz
      const fallbackQuestions = ["Question 1", "Question 2", "Question 3", "Question 4"].map((q, i) => ({
        question: `${q}: ${activeSession?.topic || "your topic"}?`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        answerIndex: 0,
      }));
      set(() => ({
        quizError: err.message || "Quiz generation failed",
        quiz: { questions: fallbackQuestions, current: 0, answers: [], loading: false },
        showQuiz: true,
      }));
    }
  },

  answerQuizOption: (choiceIndex, isCorrect) => {
    const { quiz, showQuiz, quizScore } = get();
    if (!quiz || !showQuiz || quiz.loading) return;

    const answers = [...(quiz.answers || [])];
    answers[quiz.current] = choiceIndex;
    const nextIndex = quiz.current + 1;
    const done = nextIndex >= (quiz.questions?.length || 0);
    const nextScore = quizScore + (isCorrect ? 1 : 0);

    set(() => ({
      quiz: done
        ? quiz
        : {
            ...quiz,
            current: nextIndex,
            answers,
          },
      quizScore: nextScore,
    }));

    if (done) {
      set(() => ({
        showQuiz: false,
        quiz: null,
        correctStreak: 0,
        quizResult: { score: nextScore, total: quiz.questions?.length || 4 },
        showQuizResult: true,
        lastQuizScore: { score: nextScore, total: quiz.questions?.length || 4, ts: Date.now() },
      }));
      // End session after quiz completion
      try {
        get().setActiveSession?.(null);
      } catch (e) {
        console.error("end session after quiz error", e);
      }
    }
  },

  _playNextFromQueue: () => {
    const state = get();
    if (!state.audioQueue.length) {
      set(() => ({ isSpeaking: false }));
      return;
    }

    const [next, ...rest] = state.audioQueue;
    set((s) => ({ audioQueue: rest, isSpeaking: true }));

    const targetMessage = state.messages.find((m) => m.id === next.messageId) || state.currentMessage;
    if (targetMessage) {
      set(() => ({
        currentMessage: {
          ...targetMessage,
          audioPlayer: next.audioPlayer,
          visemes: next.visemes,
        },
      }));
    }

    next.audioPlayer.onended = () => {
      URL.revokeObjectURL(next.audioUrl);
      get()._playNextFromQueue();
    };

    next.audioPlayer.onerror = () => {
      URL.revokeObjectURL(next.audioUrl);
      get()._playNextFromQueue();
    };

    next.audioPlayer.play();
  },

  stopMessage: () => {
    const state = get();
    if (state.currentMessage?.audioPlayer) {
      state.currentMessage.audioPlayer.pause();
      URL.revokeObjectURL(state.currentMessage.audioUrl || "");
    }
    state.audioQueue.forEach((item) => URL.revokeObjectURL(item.audioUrl));
    const cleanedCurrent = state.currentMessage
      ? { ...state.currentMessage, audioPlayer: undefined, audioUrl: undefined, visemes: undefined }
      : null;
    set(() => ({
      audioQueue: [],
      isSpeaking: false,
      currentMessage: cleanedCurrent,
    }));
  },
}));
