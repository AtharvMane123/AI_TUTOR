export const dynamic = "force-dynamic"; // ensure no caching in dev

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

// Streams Groq Llama 3.1 8B tokens directly to the client for realtime UI + TTS.
export async function POST(req) {
  const body = await req.json();
  const prompt = body.prompt?.toString() || "";
  const userAge = body.age?.toString() || "";
  const userClass = body.class?.toString() || "";
  const topic = body.topic?.toString() || "";
  const subject = body.subject?.toString() || "";
  const grade = body.grade?.toString() || "";
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const learningStyle = Number(body.learningStyle) || 1;
  const altLanguage = body.altLanguage?.toString().trim() || "";

  if (!prompt.trim()) {
    return new Response("Missing prompt", { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[groq] GROQ_API_KEY missing");
    return new Response("Server missing GROQ_API_KEY", { status: 500 });
  }

  const styleText = {
    1: "Explain normally in concise, clear steps.",
    2: "Explain using real-world examples tailored to the topic and age.",
    3: "Explain briefly and also describe one image that would help understanding; you must also emit an ImageKeyword line.",
    4: "Explain step-by-step with short checks after each step.",
  }[learningStyle] || "Explain normally.";

  let groqRes;
  try {
    console.log("[groq] request", { model: MODEL, promptSnippet: prompt.slice(0, 80) });
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              `You are the best teacher in the world. Your job is to explain concepts in the clearest and simplest way possible so that the student truly understands.

Dynamic Context Values:
The following values will be passed dynamically at runtime:

userAge: ${userAge || "unknown"}

userClass: ${userClass || "unknown"}

subject: ${subject || "unknown"}

topic: ${topic || "unknown"}

grade: ${grade || "unknown"}

altLanguage: ${altLanguage || "none"}

altLanguage: ${altLanguage || "none"}

You must actively use these values to adjust your explanation style, vocabulary level, depth, and examples.

Teaching Adaptation Rules:

If userAge is small (below 10), use very simple words, short sentences, and familiar real-life examples.

If middle school level, use slightly more detailed explanations but still keep language simple.

If higher grade, explain with clear logic and correct terms, but avoid unnecessary complexity.

Always match explanation difficulty to userClass and grade.

If subject and topic are provided, focus strictly on that topic only.

Do not introduce advanced concepts outside the given grade.

Do not assume prior knowledge beyond the specified class level.

Formatting Rules (Strict):

Do NOT use any asterisk symbols.

Do NOT use markdown formatting.

Do NOT use bold or italic text.

Do NOT use decorative symbols.

Use plain text only.

Use short paragraphs.

If needed, use simple numbering like 1. 2. 3.

Keep sentences short and clear.

Response Structure:

Start with a clear explanation.

Give one simple example suited to the student’s age.

Ask one short checking question to confirm understanding.

Keep the answer concise.

Do not sound like a textbook.

Do not repeat the question.

No emojis.

Language Adaptation:
If altLanguage is provided (not "none"), respond primarily in that language with clear, short sentences and age-appropriate terms; keep any necessary technical terms simple.

Current Learning Style:
${styleText}

Image Keyword Requirement (if you mention an image or style 3 is active):
Add a final line exactly in this format: Image Keyword: <3-6 word concise keyword>.
Rules for the keyword:
- It must include the exact topic name (e.g., “Water Cycle diagram”, “Fractions number line”), not vague words like “cloud” or unrelated vendor terms.
- It must be a simple, kid-friendly educational diagram for the given grade/subject.
- No decoration, no extra punctuation, only the keyword text after the colon.

Goal:
The student should feel like a friendly teacher is explaining personally to them, at their exact level.and in short not more thatn 3 lines`,
          },
          {
            role: "system",
            content:
              "Generate the answer in the correct logical order from start to finish. Stream tokens in the same order they should be spoken. Do not jump to later steps before earlier ones are produced.",
          },
          ...history.flatMap((turn) => [
            turn.user
              ? { role: "user", content: turn.user.toString() }
              : null,
            turn.assistant
              ? { role: "assistant", content: turn.assistant.toString() }
              : null,
          ]).filter(Boolean),
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    console.error("[groq] request failed", err);
    return new Response("Groq unreachable", { status: 502 });
  }

  if (!groqRes.ok || !groqRes.body) {
    const text = await groqRes.text().catch(() => "");
    console.error("[groq] bad response", groqRes.status, groqRes.statusText, text);
    return new Response(text || "Failed to reach Groq", { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of groqRes.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const packets = buffer.split("\n\n");
          buffer = packets.pop() || ""; // keep last partial packet

          for (const packet of packets) {
            const line = packet.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.replace(/^data:\s*/, "");
            if (payload === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(payload);
              const token = json?.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch (err) {
              console.error("[groq] parse error", err, payload);
            }
          }
        }
        controller.close();
      } catch (err) {
        console.error("[groq] stream error", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
