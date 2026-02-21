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
  learningStyle: 1, // 1=normal,2=real-world examples,3=with image,4=step-by-step scaffold
  consecutiveMisses: 0,

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
      imageResult: null,
      imageError: null,
      imageShownOnce: false,
      useAltLanguage: false,
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

    const { profile, activeSession, messages: prevMessages, learningStyle, consecutiveMisses } = get();
    const isMiss = /\b(don't know|dont know|idk|not sure|no idea)\b/i.test(question);
    const newMisses = isMiss ? consecutiveMisses + 1 : 0;
    let nextLearningStyle = learningStyle;
    const altLanguage = newMisses >= 2 && profile?.secondLanguage ? profile.secondLanguage : null;

    // After two misses, jump directly to image-assisted mode (style 3) to aid understanding
    if (newMisses >= 2) {
      nextLearningStyle = 3;
      set(() => ({ learningStyle: nextLearningStyle, consecutiveMisses: 0 }));
    } else {
      set(() => ({ consecutiveMisses: newMisses }));
    }
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

      // Optionally fetch image once and mention it
      let finalText = cleaned;
      let imageUrl = null;
      if (nextLearningStyle === 3 && !get().imageShownOnce) {
        const query = imageKeyword || activeSession?.topic || question;
        try {
          const img = await fetchOneImage(query);
          imageUrl = img?.url || null;
        } catch (e) {
          console.error("inline image fetch failed", e);
        }
        const label = imageKeyword || activeSession?.topic || "the concept";
        const imageLine = imageUrl ? `Image URL: ${imageUrl}` : "";
        const notice = imageUrl
          ? `Can you see the image on the right? It shows ${label}.`
          : `Let me explain ${label} clearly.`;
        finalText = [cleaned, notice, imageLine].filter(Boolean).join("\n\n");
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
