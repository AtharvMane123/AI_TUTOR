import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// SerpAPI Bing Images proxy. Requires SERPAPI_KEY (falls back to provided key).
export async function GET(req) {
  const key = process.env.SERPAPI_KEY || "0ed8f77864ad92a65128d241dab0d93f14185548fe976f4b5b21b8a5f5480fde";
  const q = req.nextUrl.searchParams.get("query")?.trim();
  if (!key) {
    return new NextResponse("Missing SERPAPI_KEY", { status: 500 });
  }
  if (!q) {
    return new NextResponse("Missing query", { status: 400 });
  }

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "bing_images");
  url.searchParams.set("q", `${q} education diagram`);
  url.searchParams.set("api_key", key);

  console.log("[image search] query", q);

  let resp;
  try {
    resp = await fetch(url.toString(), { cache: "no-store" });
  } catch (err) {
    console.error("[image search] request error", err);
    return new NextResponse("Image search failed", { status: 502 });
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("[image search] bad response", resp.status, text);
    return new NextResponse(text || "Image search error", { status: resp.status });
  }

  const data = await resp.json();
  const first = data?.images_results?.[0];
  if (!first) {
    console.warn("[image search] no results", { query: q });
    return NextResponse.json({ image: null });
  }

  const image = {
    url: first.original || first.thumbnail,
    thumb: first.thumbnail || first.original,
    title: first.title || first.source || q,
    source: first.link || first.source,
  };

  console.log("[image search] first result", {
    query: q,
    url: image.url,
    thumb: image.thumb,
    title: image.title,
    source: image.source,
  });

  return NextResponse.json({ image });
}
