const NEARBY_RADIUS_M = 250;
const FALLBACK_RADIUS_M = 5000;

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
    return Response.json({ error: "location unavailable" }, { status: 400 });
  }

  const candidates = await overpass(lat, lon, FALLBACK_RADIUS_M);
  if (candidates === null) {
    return Response.json({ error: "overpass failed" }, { status: 502 });
  }

  const ranked = candidates
    .map(el => ({ name: el.tags!.name!, dist: haversine(lat, lon, el.lat, el.lon) }))
    .sort((a, b) => a.dist - b.dist);

  const best = ranked[0] ?? null;
  const nearby = best && best.dist <= NEARBY_RADIUS_M;

  console.log("nearest-restaurant", {
    source,
    lat,
    lon,
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

async function overpass(lat: number, lon: number, radius: number) {
  const query = `[out:json][timeout:10];
    (
      node(around:${radius},${lat},${lon})[amenity=restaurant][name];
      node(around:${radius},${lat},${lon})[amenity=fast_food][name];
      node(around:${radius},${lat},${lon})[amenity=cafe][name];
    );
    out body;`;

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "budget-outings/0.1",
    },
    body: "data=" + encodeURIComponent(query),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    elements: Array<{ lat: number; lon: number; tags?: { name?: string } }>;
  };
  return data.elements.filter(el => el.tags?.name);
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
