import { spawn } from "child_process";

export async function GET(req) {
  const text = req.nextUrl.searchParams.get("text") || "I'm excited to try text to speech";
  const teacher = req.nextUrl.searchParams.get("teacher") || "en_US";
  // You may want to map teacher to a Piper voice name if needed

  return new Promise((resolve, reject) => {
    const piper = spawn("piper", ["--model", `/path/to/${teacher}.onnx", "--output_file", "-", "--text", text]);
    let audioChunks = [];
    piper.stdout.on("data", (chunk) => {
      audioChunks.push(chunk);
    });
    piper.stderr.on("data", (data) => {
      console.error(`Piper error: ${data}`);
    });
    piper.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}`));
      } else {
        const audioBuffer = Buffer.concat(audioChunks);
        resolve(new Response(audioBuffer, {
          headers: {
            "Content-Type": "audio/wav",
            "Content-Disposition": `inline; filename=tts.wav`,
          },
        }));
      }
    });
  });
}
