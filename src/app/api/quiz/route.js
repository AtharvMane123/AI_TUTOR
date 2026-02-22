export const dynamic = "force-dynamic";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const full_content = Array.isArray(body?.full_content) ? body.full_content : [];
  if (!full_content.length) {
    return new Response(
      JSON.stringify({ error: "full_content is required and must be a non-empty array" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[quiz] GROQ_API_KEY missing");
    return new Response(JSON.stringify({ error: "Server missing GROQ_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const historyText = full_content
    .slice(-12)
    .map((t, i) => `Q${i + 1}: ${t.user}\nA${i + 1}: ${t.assistant}`)
    .join("\n\n");

  const systemPrompt = `You are a teacher creating a short 4-question multiple-choice quiz.
Return JSON only, no prose. Schema:
{
  "questions": [
    {"question": string, "options": [string, string, string, string], "answerIndex": number}
  ]
}
Rules:
- Exactly 4 questions.
- Each question must have exactly 4 concise options, one correct.
- Set answerIndex to the 0-based index of the correct option.
- Align strictly to the provided chat history.
- Target learner: 6th class unless a different grade is provided.
- Use age-appropriate wording when age is provided.
- No explanations, no markdown, JSON only.`;

  const userPrompt = `Chat history (most recent turns):
${historyText}

Create 4 MCQ questions for the learner (default 6th class; use provided grade/age if present). Assess understanding of the above. Return JSON only with the exact schema.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "Quiz LLM failed", status: res.status, body: text }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (err) {
          /* ignore */
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return new Response(JSON.stringify({ error: "Malformed quiz response", raw }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Ensure exactly 4 questions and 4 options each
    const cleaned = parsed.questions
      .slice(0, 4)
      .map((q) => {
        const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
        let answerIndex = Number.isInteger(q.answerIndex) ? q.answerIndex : -1;
        if (answerIndex < 0 || answerIndex >= opts.length) {
          const foundIdx = opts.findIndex((o) => o === q.correct_answer);
          answerIndex = foundIdx >= 0 ? foundIdx : 0;
        }
        // Clamp in range to avoid bad coloring/scoring
        if (answerIndex < 0 || answerIndex >= opts.length) answerIndex = 0;
        return {
          question: q.question || "",
          options: opts,
          answerIndex,
        };
      })
      .filter((q) => q.question && q.options.length === 4);

    if (cleaned.length !== 4) {
      return new Response(JSON.stringify({ error: "Quiz did not return 4 valid questions", cleaned }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ questions: cleaned }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[quiz] LLM fetch failed", err?.message);
    return new Response(
      JSON.stringify({ error: "Quiz LLM fetch failed", detail: err.message }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
