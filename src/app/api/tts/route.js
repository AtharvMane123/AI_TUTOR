import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { PassThrough } from "stream";

export async function GET(req) {
  // WARNING: Do not expose your keys
  // WARNING: If you host publicly your project, add an authentication layer to limit the consumption of Azure resources

  const speechConfig = sdk.SpeechConfig.fromSubscription(
    process.env["SPEECH_KEY"],
    process.env["SPEECH_REGION"]
  );

  // https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
  // Dynamic language and speaker selection
  const language = req.nextUrl.searchParams.get("language") || "en-US";
  const speaker = req.nextUrl.searchParams.get("speaker");
  let voiceName = "en-US-AvaMultilingualNeural";
  
  speechConfig.speechSynthesisVoiceName = voiceName;

  const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig);
  const visemes = [];
  speechSynthesizer.visemeReceived = function (s, e) {
    // console.log(
    //   "(Viseme), Audio offset: " +
    //     e.audioOffset / 10000 +
    //     "ms. Viseme ID: " +
    //     e.visemeId
    // );
    visemes.push([e.audioOffset / 10000, e.visemeId]);
  };
  try {
    const audioStream = await new Promise((resolve, reject) => {
      speechSynthesizer.speakTextAsync(
        req.nextUrl.searchParams.get("text") ||
          "I'm excited to try text to speech",
        (result) => {
          const { audioData, errorDetails, reason } = result;
          speechSynthesizer.close();
          if (!audioData) {
            console.error("Azure TTS error details:", errorDetails, reason, result);
            reject(new Error(`Azure TTS failed: ${errorDetails || reason || 'Unknown error'}`));
            return;
          }
          // convert arrayBuffer to stream
          const bufferStream = new PassThrough();
          bufferStream.end(Buffer.from(audioData));
          resolve(bufferStream);
        },
        (error) => {
          console.error("Azure TTS SDK error:", error);
          speechSynthesizer.close();
          reject(error);
        }
      );
    });
    const response = new Response(audioStream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `inline; filename=tts.mp3`,
        Visemes: JSON.stringify(visemes),
      },
    });
    // audioStream.pipe(response);
    return response;
  } catch (err) {
    // Return error details in the response for debugging
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
