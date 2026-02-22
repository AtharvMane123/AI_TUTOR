import { useAITeacher } from "@/hooks/useAITeacher";
import { useEffect, useRef, useState } from "react";

export const TypingBox = () => {
  const askAI = useAITeacher((state) => state.askAI);
  const loading = useAITeacher((state) => state.loading);
  const stopMessage = useAITeacher((state) => state.stopMessage);
  const consumePendingLessonPrompt = useAITeacher((state) => state.consumePendingLessonPrompt);
  const pendingLessonPrompt = useAITeacher((state) => state.pendingLessonPrompt);
  const startQuiz = useAITeacher((state) => state.startQuiz);
  const [question, setQuestion] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState("");

  const speechRecRef = useRef(null);
  const [hasBrowserSTT, setHasBrowserSTT] = useState(false);

  const ask = () => {
    askAI(question);
    setQuestion("");
  };

  const stopRecording = () => {
    if (speechRecRef.current) {
      speechRecRef.current.stop();
      speechRecRef.current = null;
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (isRecording) return;
    setRecordError("");

    // If TTS is playing, stop it immediately to listen
    stopMessage();

    if (!hasBrowserSTT) {
      setRecordError("Browser speech recognition not supported here.");
      return;
    }

    try {
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new Rec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec._finalText = "";

      rec.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        rec._finalText += final;
        const liveText = (rec._finalText + interim).trim();
        setQuestion(liveText);
      };

      rec.onerror = (e) => {
        console.error("Browser STT error", e);
        setRecordError("Browser speech error");
        rec.stop();
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
        const finalText = (rec._finalText || question || "").trim();
        if (finalText) {
          setQuestion(finalText);
          askAI(finalText);
        }
      };

      speechRecRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Browser STT init error", err);
      setRecordError("Mic or speech recognition failed to start.");
      setIsRecording(false);
    }
  };

  useEffect(() => {
    // Auto-start lesson if a pending prompt exists (from Learn button)
    const pending = consumePendingLessonPrompt();
    if (pending) {
      askAI(pending);
      setQuestion("");
    }
  }, []);

  useEffect(() => {
    if (pendingLessonPrompt) {
      const pending = consumePendingLessonPrompt();
      if (pending) {
        askAI(pending);
        setQuestion("");
      }
    }
  }, [pendingLessonPrompt]);

  useEffect(() => {
    // Feature-detect browser STT
    const Rec = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setHasBrowserSTT(Boolean(Rec));

    return () => {
      stopRecording();
      if (speechRecRef.current) {
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
    };
  }, []);
  return (
    <div className="z-10 max-w-[600px] flex space-y-6 flex-col bg-gradient-to-tr  from-slate-300/30 via-gray-400/30 to-slate-600-400/30 p-4  backdrop-blur-md rounded-xl border-slate-100/30 border">
      <div>
        <h2 className="text-white font-bold text-xl">
          Ask anything!
        </h2>
        <p className="text-white/65">
          Type any question and Vidyadost will answer it for you.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
          </span>
        </div>
      ) : (
        <div className="gap-3 flex flex-wrap">
          <input
            className="focus:outline focus:outline-white/80 flex-grow bg-slate-800/60 p-2 px-4 rounded-full text-white placeholder:text-white/50 shadow-inner shadow-slate-900/60"
            placeholder="Speak or type your question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                ask();
              }
            }}
          />
          <button
            className={`p-2 px-4 rounded-full text-white border border-white/30 ${
              isRecording ? "bg-red-600" : "bg-slate-100/20"
            }`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => {
              if (isRecording) stopRecording();
            }}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            title="Hold to speak"
          >
            {isRecording ? "Listening..." : "Hold to Talk"}
          </button>
          <button
            className="bg-slate-100/20 p-2 px-6 rounded-full text-white"
            onClick={ask}
          >
            Ask
          </button>
          <button
            className="bg-emerald-500/80 hover:bg-emerald-400 p-2 px-6 rounded-full text-white"
            onClick={() => startQuiz()}
            title="Start quiz from current chat"
          >
            Start Quiz
          </button>
        </div>
      )}
      {recordError && (
        <p className="text-sm text-red-300">{recordError}</p>
      )}
    </div>
  );
};
