import { localTimestamp } from "../services/local-time";

export function handleHealth(): Response {
  return Response.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: localTimestamp(),
  });
}
