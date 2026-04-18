import { serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";

const db = new Database("budget.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cost_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

type EventRow = { id: number; name: string; cost_cents: number; created_at: string };

const server = serve({
  routes: {
    "/*": index,

    "/api/events": {
      async GET() {
        const rows = db
          .query("SELECT id, name, cost_cents, created_at FROM events ORDER BY id DESC LIMIT 50")
          .all() as EventRow[];
        return Response.json(rows);
      },
      async POST(req) {
        const body = (await req.json()) as { name?: unknown; cost?: unknown };
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const cost = typeof body.cost === "number" ? body.cost : NaN;
        if (!name || !Number.isFinite(cost) || cost < 0) {
          return Response.json({ error: "invalid name or cost" }, { status: 400 });
        }
        const costCents = Math.round(cost * 100);
        const row = db
          .query(
            "INSERT INTO events (name, cost_cents) VALUES (?, ?) RETURNING id, name, cost_cents, created_at",
          )
          .get(name, costCents) as EventRow;
        return Response.json(row);
      },
    },

    "/api/nearest-restaurant": async req => {
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
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

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

console.log(`🚀 Server running at ${server.url}`);
