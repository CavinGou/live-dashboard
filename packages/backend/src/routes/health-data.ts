import { authenticateToken } from "../middleware/auth";
import { db } from "../db";
import type { HealthRecord } from "../types";
import { localTimestamp } from "../services/local-time";

const MAX_RECORDS_PER_REQUEST = 500;
const VALID_TYPES = new Set([
  "heart_rate", "resting_heart_rate", "heart_rate_variability",
  "steps", "distance", "exercise", "sleep",
  "oxygen_saturation", "body_temperature", "respiratory_rate",
  "blood_pressure", "blood_glucose",
  "weight", "height",
  "active_calories", "total_calories",
  "hydration", "nutrition",
]);

const insertHealthRecord = db.prepare(`
  INSERT INTO health_records (device_id, type, value, unit, recorded_at, end_time)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id, type, recorded_at, end_time) DO NOTHING
`);

const insertMany = db.transaction((records: { deviceId: string; type: string; value: number; unit: string; recordedAt: string; endTime: string }[]) => {
  let inserted = 0;
  for (const r of records) {
    const result = insertHealthRecord.run(r.deviceId, r.type, r.value, r.unit, r.recordedAt, r.endTime);
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

export async function handleHealthData(req: Request): Promise<Response> {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return Response.json({ error: "records array required" }, { status: 400 });
  }

  if (body.records.length > MAX_RECORDS_PER_REQUEST) {
    return Response.json({ error: `Too many records (max ${MAX_RECORDS_PER_REQUEST})` }, { status: 400 });
  }

  const toInsert: { deviceId: string; type: string; value: number; unit: string; recordedAt: string; endTime: string }[] = [];

  for (const record of body.records) {
    if (typeof record.type !== "string" || !VALID_TYPES.has(record.type)) continue;
    if (typeof record.value !== "number" || !Number.isFinite(record.value)) continue;
    if (typeof record.unit !== "string" || record.unit.length > 20) continue;
    if (typeof record.timestamp !== "string" || !record.timestamp) continue;

    // Validate timestamp format
    const ts = new Date(record.timestamp);
    if (isNaN(ts.getTime())) continue;

    let endTime = "";
    if (typeof record.end_time === "string" && record.end_time) {
      const et = new Date(record.end_time);
      if (!isNaN(et.getTime())) {
        endTime = localTimestamp(et);
      }
    }

    toInsert.push({
      deviceId: device.device_id,
      type: record.type,
      value: record.value,
      unit: record.unit.slice(0, 20),
      recordedAt: localTimestamp(ts),
      endTime,
    });
  }

  if (toInsert.length === 0) {
    return Response.json({ ok: true, inserted: 0 });
  }

  try {
    const inserted = insertMany(toInsert);
    return Response.json({ ok: true, inserted });
  } catch (e: any) {
    console.error("[health-data] DB error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// Query endpoint for frontend (public, like /api/current and /api/timeline)
export function handleHealthDataQuery(url: URL): Response {
  const date = url.searchParams.get("date");
  const deviceId = url.searchParams.get("device_id");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date parameter required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    // Data is stored in local time, query directly by date
    let records: HealthRecord[];
    if (deviceId) {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE date(recorded_at) = ? AND device_id = ?
        ORDER BY recorded_at ASC
      `).all(date, deviceId) as HealthRecord[];
    } else {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE date(recorded_at) = ?
        ORDER BY recorded_at ASC
      `).all(date) as HealthRecord[];
    }

    return Response.json({ date, records });
  } catch (e: any) {
    console.error("[health-data] Query error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
