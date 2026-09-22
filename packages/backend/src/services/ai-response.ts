export type AiApiStyle = "chat" | "responses";

function extractContentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const value = item as Record<string, unknown>;
    if (typeof value.text === "string") {
      parts.push(value.text);
    } else if (typeof value.content === "string") {
      parts.push(value.content);
    }
  }
  return parts.join("\n").trim();
}

export function getAiApiStyle(url: string): AiApiStyle {
  try {
    return /\/responses\/?$/i.test(new URL(url).pathname)
      ? "responses"
      : "chat";
  } catch {
    return /\/responses\/?$/i.test(url) ? "responses" : "chat";
  }
}

export function usesCompletionTokenLimit(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

export function isDeepSeekApi(url: string, model: string): boolean {
  if (/deepseek/i.test(model)) return true;
  try {
    return /(^|\.)deepseek\.com$/i.test(new URL(url).hostname);
  } catch {
    return /deepseek/i.test(url);
  }
}

export function supportsDeepSeekThinking(model: string): boolean {
  return /^deepseek-(flash|v4-pro)/i.test(model);
}

export function extractAiSummaryText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, any>;

  const outputText = extractContentText(data.output_text);
  if (outputText) return outputText;

  const messageContent = extractContentText(data.choices?.[0]?.message?.content);
  if (messageContent) return messageContent;

  const choiceText = extractContentText(data.choices?.[0]?.text);
  if (choiceText) return choiceText;

  if (Array.isArray(data.output)) {
    const outputParts = data.output
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return "";
        return extractContentText((item as Record<string, unknown>).content);
      })
      .filter(Boolean);
    if (outputParts.length > 0) return outputParts.join("\n").trim();
  }

  return extractContentText(data.content) || null;
}

export function getEmptyResponseDiagnostics(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return { payload_type: typeof payload };
  }

  const data = payload as Record<string, any>;
  const choice = data.choices?.[0];
  const message = choice?.message;

  return {
    model: data.model,
    status: data.status,
    finish_reason: choice?.finish_reason,
    usage: data.usage,
    top_level_keys: Object.keys(data).slice(0, 20),
    choice_keys: choice && typeof choice === "object"
      ? Object.keys(choice).slice(0, 20)
      : [],
    message_keys: message && typeof message === "object"
      ? Object.keys(message).slice(0, 20)
      : [],
    content_type: typeof message?.content,
    output_type: Array.isArray(data.output) ? "array" : typeof data.output,
    reasoning_content_length:
      typeof message?.reasoning_content === "string"
        ? message.reasoning_content.length
        : 0,
  };
}
