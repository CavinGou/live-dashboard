/** Format Date in local time without timezone suffix (e.g. "2026-07-06T02:02:05.494") */
export function localTimestamp(date?: Date): string {
  const d = date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
