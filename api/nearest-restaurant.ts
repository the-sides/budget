export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "lat/lon required" }, { status: 400 });
  }

  const query = `[out:json][timeout:10];
    (
      node(around:250,${lat},${lon})[amenity=restaurant][name];
      node(around:250,${lat},${lon})[amenity=fast_food][name];
      node(around:250,${lat},${lon})[amenity=cafe][name];
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

  if (!res.ok) {
    return Response.json({ error: "overpass failed" }, { status: 502 });
  }

  const data = (await res.json()) as {
    elements: Array<{ lat: number; lon: number; tags?: { name?: string } }>;
  };

  let best: { name: string; dist: number } | null = null;
  for (const el of data.elements) {
    const n = el.tags?.name;
    if (!n) continue;
    const d = haversine(lat, lon, el.lat, el.lon);
    if (!best || d < best.dist) best = { name: n, dist: d };
  }

  if (!best) return Response.json({ name: null });
  return Response.json({ name: best.name, distance_m: Math.round(best.dist) });
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
