import { getDeviceStateById } from "../db";
import { getCustomBackground } from "../services/custom-mappings";
import { getBingDailyWallpaper } from "../services/bing-wallpaper";
import { isConfiguredDeviceId } from "../middleware/auth";
import type { DeviceState } from "../types";

export async function handleBackground(url: URL): Promise<Response> {
  const deviceId = (url.searchParams.get("device_id") || "").trim().slice(0, 160);
  if (!deviceId || !isConfiguredDeviceId(deviceId)) {
    return Response.json({ error: "Unknown device" }, { status: 404 });
  }

  const state = getDeviceStateById.get(deviceId) as DeviceState | undefined;
  if (!state) {
    return Response.json({ error: "Device has no state" }, { status: 404 });
  }

  const activity = {
    appId: state.app_id,
    appName: state.app_name,
    displayTitle: state.display_title,
  };
  const custom = getCustomBackground(activity);
  if (custom) {
    return Response.json({
      source: "activity",
      url: custom.url,
      device_id: state.device_id,
      app_id: state.app_id,
      app_name: state.app_name,
      display_title: state.display_title,
      title: "",
      copyright: "",
    });
  }

  const bing = await getBingDailyWallpaper();
  if (bing) {
    return Response.json({
      source: "bing",
      url: bing.url,
      device_id: state.device_id,
      app_id: state.app_id,
      app_name: state.app_name,
      display_title: state.display_title,
      title: bing.title,
      copyright: bing.copyright,
    });
  }

  return Response.json({
    source: "fallback",
    url: null,
    device_id: state.device_id,
    app_id: state.app_id,
    app_name: state.app_name,
    display_title: state.display_title,
    title: "",
    copyright: "",
  });
}
