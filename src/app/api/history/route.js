import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const dataDir = path.join(process.cwd(), "data", "history");

async function ensureDir() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
  } catch (e) {}
}

function filePathForSession(key) {
  return path.join(dataDir, `${encodeURIComponent(key)}.json`);
}

export async function GET(req) {
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");
  if (!sessionKey) return new NextResponse("Missing sessionKey", { status: 400 });
  await ensureDir();
  const filePath = filePathForSession(sessionKey);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    console.log(`[history] GET hit for sessionKey=${sessionKey}, entries=${parsed?.length || 0}`);
    return NextResponse.json({ history: parsed || [] });
  } catch (err) {
    console.warn(`[history] GET missing or unreadable for sessionKey=${sessionKey}`);
    return NextResponse.json({ history: [] });
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const { sessionKey, user, assistant } = body || {};
  if (!sessionKey || !user || !assistant) {
    return new NextResponse("Missing fields", { status: 400 });
  }

  await ensureDir();
  const filePath = filePathForSession(sessionKey);
  let history = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    history = JSON.parse(raw) || [];
  } catch (e) {}

  history.push({ user, assistant, ts: Date.now() });
  await fs.writeFile(filePath, JSON.stringify(history, null, 2), "utf8");
  console.log(`[history] POST saved for sessionKey=${sessionKey}, total=${history.length}`);
  return NextResponse.json({ ok: true });
}
