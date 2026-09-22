import { readFile } from "node:fs/promises";
import { getTimelineByRange, upsertDailySummary } from "../db";
import { getUtcDayRange } from "./date-range";
import {
  extractAiSummaryText,
  getAiApiStyle,
  getEmptyResponseDiagnostics,
  isDeepSeekApi,
  supportsDeepSeekThinking,
  usesCompletionTokenLimit,
} from "./ai-response";
import {
  buildDailySummaryUserPrompt,
  type DailySummaryActivity,
} from "./daily-summary-prompt";

/**
 * AI Daily Summary Generator
 *
 * Env vars (all optional — if not set, generation is silently skipped):
 *   AI_API_URL        — OpenAI-compatible chat endpoint (e.g. https://api.openai.com/v1/chat/completions)
 *   AI_API_KEY        — Bearer token for the API
 *   AI_API_STYLE      — "chat" or "responses" (auto-detected from URL by default)
 *   AI_MODEL          — Model name (default: gpt-4o-mini)
 *   AI_MAX_TOKENS     — Maximum output tokens (default: 100000)
 *   AI_THINKING       — DeepSeek thinking mode: "enabled" or "disabled" (default: disabled)
 *   AI_REASONING_EFFORT — DeepSeek effort when thinking is enabled (default: low)
 *   AI_PROMPT_FILE    — Path to a file containing the system prompt (falls back to built-in default)
 */

const AI_API_URL = process.env.AI_API_URL || "";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_MAX_TOKENS = Math.max(
  100,
  parseInt(process.env.AI_MAX_TOKENS || "100000", 10) || 100000,
);

const DEFAULT_PROMPT = `你是一个简洁文艺的日记助手。根据用户今天目前为止在各设备上的使用记录，写一段800-1000字的中文随笔。
要求：
- 语气温暖、自然，像朋友在记录今天的片段
- 描述到目前为止的活动节奏，让人觉得"这一天还在继续"
- 长时间连续出现的应用可能只是窗口一直开着，不要默认用户全程都在专注使用
- 不要逐条罗列活动，而是提炼出整体节奏
- 控制在1000字以内`;

async function getSystemPrompt(): Promise<string> {
  const promptFile = process.env.AI_PROMPT_FILE;
  if (promptFile) {
    try {
      const content = await readFile(promptFile, "utf-8");
      const trimmed = content.trim();
      if (trimmed) return trimmed;
    } catch {
      console.warn(`[ai-summary] Failed to read AI_PROMPT_FILE: ${promptFile}, falling back`);
    }
  }
  return DEFAULT_PROMPT;
}

function todayStr() {
  const d = new Date();
  // At midnight (0:00), summarize yesterday's data instead of today's empty day
  if (d.getHours() === 0) {
    d.setDate(d.getDate() - 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function generateDailySummary(): Promise<void> {
  if (!AI_API_URL || !AI_API_KEY) {
    return; // AI not configured, skip silently
  }

  const date = todayStr();
  const dayRange = getUtcDayRange(date, new Date().getTimezoneOffset());
  if (!dayRange) {
    console.error(`[ai-summary] Invalid local date range for ${date}`);
    return;
  }

  const rows = getTimelineByRange.all(
    dayRange.start,
    dayRange.end,
  ) as DailySummaryActivity[];
  if (rows.length === 0) {
    console.log("[ai-summary] No activity data for today, skipping");
    return;
  }

  const userPrompt = buildDailySummaryUserPrompt(rows, date);
  const configuredApiStyle = process.env.AI_API_STYLE;
  const apiStyle = configuredApiStyle === "chat" || configuredApiStyle === "responses"
    ? configuredApiStyle
    : getAiApiStyle(AI_API_URL);
  const deepSeek = isDeepSeekApi(AI_API_URL, AI_MODEL);
  const deepSeekThinkingModel =
    deepSeek && supportsDeepSeekThinking(AI_MODEL);
  const thinkingEnabled =
    deepSeekThinkingModel &&
    (process.env.AI_THINKING || "").toLowerCase() === "enabled";
  const reasoningEffort = process.env.AI_REASONING_EFFORT || "low";
  const systemPrompt = await getSystemPrompt();
  const requestBody = apiStyle === "responses"
    ? {
        model: AI_MODEL,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: AI_MAX_TOKENS,
        ...(deepSeekThinkingModel
          ? {
              reasoning: {
                effort: thinkingEnabled ? reasoningEffort : "none",
              },
            }
          : {}),
      }
    : {
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(deepSeekThinkingModel
          ? {
              thinking: {
                type: thinkingEnabled ? "enabled" : "disabled",
              },
              ...(thinkingEnabled
                ? { reasoning_effort: reasoningEffort }
                : {}),
            }
          : {}),
        ...(usesCompletionTokenLimit(AI_MODEL)
          ? { max_completion_tokens: AI_MAX_TOKENS }
          : { max_tokens: AI_MAX_TOKENS, temperature: 0.7 }),
      };

  try {
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      console.error(`[ai-summary] API returned ${res.status}: ${await res.text()}`);
      return;
    }

    const data: unknown = await res.json();
    const summary = extractAiSummaryText(data);
    if (!summary) {
      console.error(
        "[ai-summary] Empty response from AI",
        JSON.stringify({
          api_style: apiStyle,
          ...getEmptyResponseDiagnostics(data),
        }),
      );
      return;
    }

    upsertDailySummary.run(date, summary);
    console.log(`[ai-summary] Generated summary for ${date}: ${summary.slice(0, 60)}...`);
  } catch (e) {
    console.error("[ai-summary] Failed to generate:", e);
  }
}
