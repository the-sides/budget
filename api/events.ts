import { sql, type EventRow } from "../lib/db";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "DELETE") {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    const rows = (await sql`DELETE FROM events WHERE id = ${id} RETURNING id`) as { id: number }[];
    if (rows.length === 0) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ id: rows[0].id });
  }

  if (req.method === "GET") {
    const rows = (await sql`
      SELECT id, name, cost_cents, created_at
      FROM events
      ORDER BY id DESC
      LIMIT 50
    `) as EventRow[];
    return Response.json(rows);
  }

  if (req.method === "POST") {
    const body = (await req.json()) as { name?: unknown; cost?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const cost = typeof body.cost === "number" ? body.cost : NaN;
    if (!name || !Number.isFinite(cost) || cost < 0) {
      return Response.json({ error: "invalid name or cost" }, { status: 400 });
    }
    const costCents = Math.round(cost * 100);
    const [row] = (await sql`
      INSERT INTO events (name, cost_cents)
      VALUES (${name}, ${costCents})
      RETURNING id, name, cost_cents, created_at
    `) as EventRow[];
    return Response.json(row);
  }

  return new Response("Method not allowed", { status: 405 });
}
