import { cleanupOldActivities, cleanupOldSummaries, markOfflineDevices } from "../db";
import { generateDailySummary } from "./daily-summary-gen";
import cron from "node-cron";

// Cleanup old activities + old summaries every hour
setInterval(() => {
  try {
    const result = cleanupOldActivities.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old activity records`);
    }
  } catch (e) {
    console.error("[cleanup] Activities cleanup failed:", e);
  }

  try {
    const result = cleanupOldSummaries.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old daily summaries`);
    }
  } catch (e) {
    console.error("[cleanup] Summaries cleanup failed:", e);
  }
}, 60 * 60 * 1000);

// Mark offline devices every 60 seconds
setInterval(() => {
  try {
    markOfflineDevices.run();
  } catch {
    // silent
  }
}, 60_000);

// AI daily summary — at the top of every hour, replaces same-day summary
cron.schedule("0 * * * *", () => {
  generateDailySummary().catch((e) => console.error("[cleanup] AI summary failed:", e));
});

console.log("[cleanup] Scheduled: hourly cleanup, 60s offline check, hourly AI summary (cron: 0 * * * *)");
