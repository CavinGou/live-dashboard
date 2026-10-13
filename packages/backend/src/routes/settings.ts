import { getDashboardSettings, saveDashboardSettings } from "../services/dashboard-settings";
import { authorizeSettingsWrite, isSettingsWriteEnabled } from "../middleware/settings-auth";
import { publishSettingsUpdate } from "../services/current-events";

export function handleSettingsGet(): Response {
  return Response.json({
    ...getDashboardSettings(),
    writable: isSettingsWriteEnabled(),
  });
}

export async function handleSettingsPut(req: Request): Promise<Response> {
  if (!isSettingsWriteEnabled()) {
    return Response.json(
      { error: "Settings writes are disabled. Configure SETTINGS_TOKEN on the server." },
      { status: 503 },
    );
  }

  if (!authorizeSettingsWrite(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const settings = saveDashboardSettings(body);
  publishSettingsUpdate();

  return Response.json({ ...settings, writable: true });
}
