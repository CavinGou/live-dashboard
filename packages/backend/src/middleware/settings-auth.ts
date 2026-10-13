function configuredToken(): string | null {
  const token = (process.env.SETTINGS_TOKEN || process.env.ADMIN_TOKEN || "").trim();
  return token || null;
}

export function isSettingsWriteEnabled(): boolean {
  return configuredToken() !== null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function authorizeSettingsWrite(req: Request): boolean {
  const expected = configuredToken();
  if (!expected) return false;

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const provided = (bearer ?? req.headers.get("x-settings-token") ?? "").trim();
  if (!provided) return false;

  return constantTimeEqual(provided, expected);
}
