import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Proxy to Azure Speech-to-Text. Expects audio/webm body and returns JSON { text }
export async function POST(req) {
  const key = process.env.SPEECH_KEY;
  const region = process.env.SPEECH_REGION;
  const language = req.nextUrl.searchParams.get("language") || "en-US";

  if (!key || !region) {
    return new NextResponse("Missing SPEECH_KEY or SPEECH_REGION", { status: 500 });
  }

  const audioBuffer = await req.arrayBuffer();
  if (!audioBuffer || audioBuffer.byteLength === 0) {
    return new NextResponse("No audio provided", { status: 400 });
  }

  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(
    language
  )}&format=detailed&profanity=masked`;

  let azureRes;
  try {
    azureRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/webm; codecs=opus",
        Accept: "application/json",
      },
      body: new Uint8Array(audioBuffer),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[stt] request error", err);
    return new NextResponse(
      JSON.stringify({ error: "Failed to reach Azure STT", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  let payloadText = "";
  let payloadJson = null;
  try {
    payloadText = await azureRes.text();
    payloadJson = JSON.parse(payloadText);
  } catch (err) {
    // If parsing fails, fall back to raw text
  }

  if (!azureRes.ok) {
    console.error("[stt] azure error", azureRes.status, payloadText);
    return new NextResponse(payloadText || "Azure STT error", { status: azureRes.status });
  }

  const transcript =
    payloadJson?.DisplayText ||
    payloadJson?.Text ||
    payloadJson?.NBest?.[0]?.Display ||
    payloadJson?.NBest?.[0]?.Lexical ||
    "";

  const reason =
    payloadJson?.RecognitionStatus ||
    payloadJson?.reason ||
    payloadJson?.ResultReason ||
    payloadJson?.Status ||
    "";

  return NextResponse.json({ text: transcript, raw: payloadJson || payloadText, reason });
}
