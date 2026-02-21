import { useAITeacher } from "@/hooks/useAITeacher";
import { useEffect, useRef, useState } from "react";

export const MessagesList = () => {
  const messages = useAITeacher((state) => state.messages);
  const playMessage = useAITeacher((state) => state.playMessage);
  const { currentMessage } = useAITeacher();
  const english = useAITeacher((state) => state.english);
  const furigana = useAITeacher((state) => state.furigana);
  const classroom = useAITeacher((state) => state.classroom);
  const imageResult = useAITeacher((state) => state.imageResult);
  const imageError = useAITeacher((state) => state.imageError);

  const defaultImgPos = { x: 1325, y: -54 };
  const [imgPos, setImgPos] = useState(defaultImgPos);
  const imgPosRef = useRef(defaultImgPos);
  const dragState = useRef(null);

  const container = useRef();

  useEffect(() => {
    container.current.scrollTo({
      top: container.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  useEffect(() => {
    imgPosRef.current = imgPos;
  }, [imgPos]);

  // Reset image position to default whenever a new image is set
  useEffect(() => {
    if (imageResult) {
      setImgPos(defaultImgPos);
      imgPosRef.current = defaultImgPos;
    }
  }, [imageResult]);

  const renderEnglish = (englishText) => (
    <>
      {english && (
        <p className="text-4xl inline-block px-2 rounded-sm font-bold bg-clip-text text-transparent bg-gradient-to-br from-blue-300/90 to-white/90">
          {englishText}
        </p>
      )}
    </>
  );

  const renderJapanese = (japanese) => (
    <p className="text-white font-bold text-4xl mt-2 font-jp flex flex-wrap gap-1">
      {japanese.map((word, i) => (
        <span key={i} className="flex flex-col justify-end items-center">
          {furigana && word.reading && (
            <span className="text-2xl text-white/65">{word.reading}</span>
          )}
          {word.word}
        </span>
      ))}
    </p>
  );

  const startDrag = (e) => {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: imgPos.x,
      origY: imgPos.y,
    };
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
  };

  const onDrag = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const nextPos = { x: dragState.current.origX + dx, y: dragState.current.origY + dy };
    setImgPos(nextPos);
    console.log("[image overlay] dragging", nextPos);
  };

  const endDrag = () => {
    console.log("[image overlay] position", imgPosRef.current);
    dragState.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
  };

  useEffect(() => () => endDrag(), []);

  return (
    <div
      className={`relative ${
        classroom === "default"
          ? "w-[1288px] h-[676px]"
          : "w-[2528px] h-[856px]"
      } p-8 overflow-y-auto flex flex-col space-y-8 bg-transparent opacity-80`}
      ref={container}
    >
      {(imageResult || imageError) && (
        <div
          className="fixed z-20 cursor-move select-none"
          style={{ top: imgPos.y, left: imgPos.x, width: "820px", height: "820px" }}
          onMouseDown={startDrag}
        >
          <div className="w-full h-full rounded-2xl bg-white/10 backdrop-blur border border-white/30 shadow-2xl overflow-hidden flex flex-col">
            <div className="absolute top-2 left-2 text-sm px-3 py-1.5 rounded-md bg-black/80 text-white font-mono font-semibold shadow-lg">
              x:{Math.round(imgPos.x)} y:{Math.round(imgPos.y)}
            </div>
            <div className="flex-1 bg-slate-900/40 grid place-items-center">
              {imageResult && imageResult.url ? (
                <img
                  src={imageResult.url || imageResult.thumb}
                  alt={imageResult.title || "related"}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-white/70 text-sm px-3 text-center">{imageError || "No image"}</span>
              )}
            </div>
            {imageResult?.title && (
              <div className="p-2 text-xs text-white/80 line-clamp-2 bg-slate-900/60">
                {imageResult.title}
              </div>
            )}
          </div>
        </div>
      )}
      {messages.length === 0 && (
        <div className="h-full w-full grid place-content-center text-center">
          <h2 className="text-8xl font-bold text-white/90 italic">
            Welcome to Vidyadost
          </h2>
        </div>
      )}
      {(messages.length > 0 || currentMessage) && (() => {
        const pool = [...messages, currentMessage].filter(Boolean);
        const latest = pool.reduce((best, m) => {
          const bestTs = best?.ts ?? best?.id ?? 0;
          const ts = m?.ts ?? m?.id ?? 0;
          return ts >= bestTs ? m : best;
        }, null);
        if (!latest) return null;
        return (
          <div>
            <div className="flex">
              <div className="flex-grow">
                <div className="flex items-center gap-3">
                  {/* Show text only when TTS/audio is ready */}
                  {latest.displayReady && latest.answer && typeof latest.answer === 'string' && (
                    <div className="text-3xl whitespace-pre-line px-2 rounded-sm font-bold bg-clip-text text-transparent bg-gradient-to-br from-blue-300/90 to-white/90">
                      {latest.answer}
                    </div>
                  )}
                  {/* Show structured answer if present and ready */}
                  {latest.displayReady && latest.answer && typeof latest.answer === 'object' && latest.answer.english && renderEnglish(latest.answer.english)}
                </div>
                {/* Show structured Japanese if present */}
                {latest.displayReady && latest.answer && typeof latest.answer === 'object' && latest.answer.japanese && renderJapanese(latest.answer.japanese)}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
