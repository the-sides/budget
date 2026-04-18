const NEARBY_RADIUS_M = 250;
const SEARCH_RADIUS_M = 5000;
const FSQ_CATEGORIES = "13065,13145,13032"; // restaurant, fast food, café
const FSQ_URL = "https://places-api.foursquare.com/places/search";
const FSQ_API_VERSION = "2025-06-17";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const latQ = url.searchParams.get("lat");
  const lonQ = url.searchParams.get("lon");
  const latH = req.headers.get("x-vercel-ip-latitude");
  const lonH = req.headers.get("x-vercel-ip-longitude");

  let lat = NaN;
  let lon = NaN;
  let source = "none";
  if (latQ && lonQ) {
    lat = Number(latQ);
    lon = Number(lonQ);
    source = "query";
  } else if (latH && lonH) {
    lat = Number(latH);
    lon = Number(lonH);
    source = "vercel-ip";
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.log("nearest-restaurant: no location", { latQ, lonQ, latH, lonH });
    return Response.json({ error: "location unavailable" }, { status: 400 });
  }

  const apiKey = process.env.FOUR_SQUARE_API_KEY;
  if (!apiKey) {
    console.log("nearest-restaurant: missing FOUR_SQUARE_API_KEY");
    return Response.json({ error: "server misconfigured" }, { status: 500 });
  }

  console.log("nearest-restaurant: start", { source, lat, lon });

  const params = new URLSearchParams({
    ll: `${lat},${lon}`,
    radius: String(SEARCH_RADIUS_M),
    categories: FSQ_CATEGORIES,
    sort: "DISTANCE",
    limit: "10",
  });

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${FSQ_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Places-Api-Version": FSQ_API_VERSION,
        Accept: "application/json",
      },
    });
  } catch (err) {
    const ms = Date.now() - started;
    const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.log("nearest-restaurant: fsq threw", { ms, error });
    return Response.json({ error: "foursquare unreachable" }, { status: 502 });
  }

  const ms = Date.now() - started;
  if (!res.ok) {
    const bodyPreview = (await res.text().catch(() => "")).slice(0, 300);
    console.log("nearest-restaurant: fsq not ok", { status: res.status, ms, bodyPreview });
    return Response.json(
      { error: "foursquare error", status: res.status },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    results?: Array<{ name?: string; distance?: number }>;
  };
  const results = (data.results ?? []).filter(r => r.name && typeof r.distance === "number");

  const best = results[0] ?? null;
  const nearby = !!best && best.distance! <= NEARBY_RADIUS_M;

  console.log("nearest-restaurant: done", {
    source,
    lat,
    lon,
    ms,
    candidates: results.length,
    top: results.slice(0, 5).map(r => ({ name: r.name, dist_m: r.distance })),
    chosen: best ? { name: best.name, dist_m: best.distance, nearby } : null,
  });

  if (!best) return Response.json({ name: null });
  return Response.json({
    name: best.name,
    distance_m: best.distance,
    nearby,
  });
}
