import { useEffect, useRef, useState } from "react";
import "./index.css";

type EventRow = { id: number; name: string; cost_cents: number; created_at: string };

export function App() {
  const costRef = useRef<HTMLInputElement>(null);
  const [cost, setCost] = useState("");
  const [name, setName] = useState("");
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    costRef.current?.focus();
  }, []);

  useEffect(() => {
    fetch("/api/events")
      .then(r => r.json())
      .then(setEvents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setDetecting(false);
      setDetectError("geolocation unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `/api/nearest-restaurant?lat=${latitude}&lon=${longitude}`,
          );
          const data = (await res.json()) as { name: string | null };
          if (data.name) setName(data.name);
          else setDetectError("no restaurant nearby");
        } catch {
          setDetectError("lookup failed");
        } finally {
          setDetecting(false);
        }
      },
      err => {
        setDetecting(false);
        setDetectError(err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(cost);
    if (!name.trim() || !Number.isFinite(c) || c < 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), cost: c }),
      });
      if (!res.ok) return;
      const row = (await res.json()) as EventRow;
      setEvents(prev => [row, ...prev]);
      setCost("");
      costRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">Outings</h1>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-muted-foreground">$</span>
          <input
            ref={costRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={cost}
            onChange={e => setCost(e.target.value)}
            className="w-full border-b bg-transparent py-2 text-3xl font-semibold outline-none focus:border-foreground"
          />
        </div>

        <input
          type="text"
          placeholder={detecting ? "detecting restaurant…" : "restaurant"}
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full border-b bg-transparent py-2 outline-none focus:border-foreground"
        />
        {detectError && !name && (
          <div className="text-xs text-muted-foreground">{detectError}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !cost}
          className="mt-2 rounded bg-foreground py-2 font-medium text-background disabled:opacity-40"
        >
          Submit
        </button>
      </form>

      <ul className="mt-8 flex flex-col gap-2">
        {events.map(ev => (
          <li key={ev.id} className="flex justify-between border-b py-2 text-sm">
            <span>{ev.name}</span>
            <span className="font-mono">${(ev.cost_cents / 100).toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
