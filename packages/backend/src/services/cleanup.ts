import { cleanupOldActivities, cleanupOldSummaries, markOfflineDevices, db } from "../db";
import { generateDailySummary } from "./daily-summary-gen";
import { getConfiguredDeviceIds } from "../middleware/auth";
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

  try {
    // Remove device states that are no longer configured in .env
    const configuredIds = getConfiguredDeviceIds();
    if (configuredIds.size > 0) {
      const placeholders = Array.from(configuredIds).map(() => "?").join(",");
      const result = db.prepare(
        `DELETE FROM device_states WHERE device_id NOT IN (${placeholders})`
      ).run(...Array.from(configuredIds));
      if (result.changes > 0) {
        console.log(`[cleanup] Removed ${result.changes} device(s) not in .env config`);
      }
    }
  } catch (e) {
    console.error("[cleanup] Device states cleanup failed:", e);
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
