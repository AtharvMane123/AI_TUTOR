import { NextResponse } from "next/server";

export async function GET(req) {
  const question = req.nextUrl.searchParams.get("question") || "Have you ever been to Japan?";
  const speech = req.nextUrl.searchParams.get("speech") || "formal";
  console.log("[Ollama API] Incoming question:", question);

  // Call Ollama Qwen 2.5 7B instruct model running locally
  let ollamaRes;
  try {
    ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b-instruct",
        prompt: `Answer the following question as helpfully as possible:\n${question}`
      })
    });
  } catch (err) {
    console.error("[Ollama API] Error fetching from Ollama:", err);
    return NextResponse.json({ error: "Failed to fetch from Ollama", details: String(err) });
  }

  let result = "";
  for await (const chunk of ollamaRes.body) {
    result += chunk.toString();
  }
  console.log("[Ollama API] Raw Ollama response:", result);
  // Ollama streams JSON lines, each with a 'response' field. Collect all 'response' values.
  let answer = "";
  for (const line of result.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.response) answer += obj.response;
    } catch (err) {
      console.error("[Ollama API] Error parsing line:", line, err);
    }
  }
  console.log("[Ollama API] Final answer:", answer.trim());
  return NextResponse.json(answer.trim());
}
