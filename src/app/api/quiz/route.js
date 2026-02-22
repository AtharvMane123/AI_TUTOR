export const dynamic = "force-dynamic";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export async function POST(req) {
  const body = await req.json();
  const age = body.age?.toString() || "";
  const grade = body.grade?.toString() || "";
  const subject = body.subject?.toString() || "";
  const topic = body.topic?.toString() || "";

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response("Server missing GROQ_API_KEY", { status: 500 });
  }

  const systemPrompt = `You are a teacher creating a short 4-question multiple-choice quiz.
Return JSON only, no prose. Schema:
{
  "questions": [
    {"question": string, "options": [string, string, string, string], "answerIndex": number}
  ]
}
Rules:
- Exactly 4 questions.
- Each question must have 4 concise options, one correct.
- Set answerIndex to the 0-based index of the correct option.
- Use age- and grade-appropriate language for ${age || "the student"}, ${grade || "their grade"}.
- Align with subject=${subject || ""}, topic=${topic || ""}.
- Avoid formatting or explanations; JSON only.`;

  const userPrompt = `Create 4 MCQ questions for subject=${subject}, topic=${topic}, grade=${grade}, age=${age}.`;

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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(text || "Quiz generation failed", { status: res.status });
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Try to extract JSON substring
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return new Response("Malformed quiz response", { status: 502 });
    }

    return new Response(JSON.stringify({ questions: parsed.questions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("quiz route error", err);
    return new Response("Quiz generation failed", { status: 500 });
  }
}
