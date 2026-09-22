import { describe, expect, test } from "bun:test";

import {
  extractAiSummaryText,
  getAiApiStyle,
  getEmptyResponseDiagnostics,
  isDeepSeekApi,
  supportsDeepSeekThinking,
  usesCompletionTokenLimit,
} from "./ai-response";

describe("AI response compatibility", () => {
  test("detects Responses API endpoints", () => {
    expect(getAiApiStyle("https://api.openai.com/v1/responses")).toBe("responses");
    expect(getAiApiStyle("https://api.openai.com/v1/responses/")).toBe("responses");
    expect(getAiApiStyle("https://api.openai.com/v1/responses?debug=1")).toBe("responses");
    expect(getAiApiStyle("https://api.openai.com/v1/chat/completions")).toBe("chat");
  });

  test("detects models that use max_completion_tokens", () => {
    expect(usesCompletionTokenLimit("o3-mini")).toBe(true);
    expect(usesCompletionTokenLimit("gpt-5")).toBe(true);
    expect(usesCompletionTokenLimit("gpt-4o-mini")).toBe(false);
  });

  test("detects DeepSeek endpoints and models", () => {
    expect(isDeepSeekApi("https://api.deepseek.com/chat/completions", "gpt-4o-mini")).toBe(true);
    expect(isDeepSeekApi("https://example.com/chat/completions", "deepseek-flash")).toBe(true);
    expect(isDeepSeekApi("https://api.openai.com/v1/chat/completions", "gpt-4o-mini")).toBe(false);
  });

  test("only applies thinking parameters to DeepSeek thinking models", () => {
    expect(supportsDeepSeekThinking("deepseek-flash")).toBe(true);
    expect(supportsDeepSeekThinking("deepseek-v4-pro")).toBe(true);
    expect(supportsDeepSeekThinking("deepseek-reasoner")).toBe(false);
    expect(supportsDeepSeekThinking("gpt-4o-mini")).toBe(false);
  });

  test("extracts Chat Completions content", () => {
    expect(extractAiSummaryText({
      choices: [{ message: { content: "  今天状态不错。  " } }],
    })).toBe("今天状态不错。");
  });

  test("extracts Responses API output_text", () => {
    expect(extractAiSummaryText({ output_text: "今天主要在处理项目。" }))
      .toBe("今天主要在处理项目。");
  });

  test("extracts Responses API output content", () => {
    expect(extractAiSummaryText({
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "上午写代码，" },
            { type: "output_text", text: "下午整理资料。" },
          ],
        },
      ],
    })).toBe("上午写代码，\n下午整理资料。");
  });

  test("returns diagnostics for an empty reasoning response", () => {
    expect(getEmptyResponseDiagnostics({
      model: "reasoning-model",
      choices: [{
        finish_reason: "length",
        message: {
          content: "",
          reasoning_content: "reasoning",
        },
      }],
      usage: { completion_tokens: 1000 },
    })).toMatchObject({
      model: "reasoning-model",
      finish_reason: "length",
      content_type: "string",
      reasoning_content_length: 9,
    });
  });
});
