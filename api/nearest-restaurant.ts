const NEARBY_RADIUS_M = 250;
const FALLBACK_RADIUS_M = 5000;
const OVERPASS_TIMEOUT_MS = 8000;

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

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

  console.log("nearest-restaurant: start", { source, lat, lon });

  const result = await overpass(lat, lon, FALLBACK_RADIUS_M);
  if (!result.ok) {
    console.log("nearest-restaurant: all mirrors failed", { attempts: result.attempts });
    return Response.json(
      { error: "overpass failed", attempts: result.attempts },
      { status: 502 },
    );
  }

  const ranked = result.elements
    .map(el => ({ name: el.tags!.name!, dist: haversine(lat, lon, el.lat, el.lon) }))
    .sort((a, b) => a.dist - b.dist);

  const best = ranked[0] ?? null;
  const nearby = !!best && best.dist <= NEARBY_RADIUS_M;

  console.log("nearest-restaurant: done", {
    source,
    lat,
    lon,
    mirror: result.mirror,
    candidates: ranked.length,
    top: ranked.slice(0, 5).map(r => ({ name: r.name, dist_m: Math.round(r.dist) })),
    chosen: best ? { name: best.name, dist_m: Math.round(best.dist), nearby } : null,
  });

  if (!best) return Response.json({ name: null });
  return Response.json({
    name: best.name,
    distance_m: Math.round(best.dist),
    nearby,
  });
}

type OverpassElement = { lat: number; lon: number; tags?: { name?: string } };
type OverpassAttempt = {
  mirror: string;
  ok: boolean;
  status?: number;
  ms: number;
  error?: string;
  bodyPreview?: string;
};
type OverpassResult =
  | { ok: true; elements: OverpassElement[]; mirror: string; attempts: OverpassAttempt[] }
  | { ok: false; attempts: OverpassAttempt[] };

async function overpass(lat: number, lon: number, radius: number): Promise<OverpassResult> {
  const query = `[out:json][timeout:10];
    (
      node(around:${radius},${lat},${lon})[amenity=restaurant][name];
      node(around:${radius},${lat},${lon})[amenity=fast_food][name];
      node(around:${radius},${lat},${lon})[amenity=cafe][name];
    );
    out body;`;
  const body = "data=" + encodeURIComponent(query);

  const attempts: OverpassAttempt[] = [];

  for (const mirror of OVERPASS_MIRRORS) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "budget-outings/0.1",
        },
        body,
        signal: controller.signal,
      });
      const ms = Date.now() - started;

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const attempt: OverpassAttempt = {
          mirror,
          ok: false,
          status: res.status,
          ms,
          bodyPreview: text.slice(0, 200),
        };
        attempts.push(attempt);
        console.log("nearest-restaurant: mirror not ok", attempt);
        continue;
      }

      const data = (await res.json()) as { elements: OverpassElement[] };
      const elements = data.elements.filter(el => el.tags?.name);
      const attempt: OverpassAttempt = { mirror, ok: true, status: res.status, ms };
      attempts.push(attempt);
      console.log("nearest-restaurant: mirror ok", { ...attempt, elements: elements.length });
      return { ok: true, elements, mirror, attempts };
    } catch (err) {
      const ms = Date.now() - started;
      const attempt: OverpassAttempt = {
        mirror,
        ok: false,
        ms,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
      attempts.push(attempt);
      console.log("nearest-restaurant: mirror threw", attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, attempts };
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
