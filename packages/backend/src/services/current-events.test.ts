import { describe, expect, test } from "bun:test";

import { handleCurrentEvents, publishCurrentUpdate } from "./current-events";

describe("current events", () => {
  test("streams report updates over SSE", async () => {
    const abortController = new AbortController();
    const response = handleCurrentEvents(
      new Request("http://localhost/api/events", {
        signal: abortController.signal,
      }),
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let output = "";

    output += decoder.decode((await reader.read()).value);
    output += decoder.decode((await reader.read()).value);

    publishCurrentUpdate("test");
    output += decoder.decode((await reader.read()).value);

    abortController.abort();
    await reader.cancel();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(output).toContain("event: ready");
    expect(output).toContain("event: current");
    expect(output).toContain('"reason":"test"');
  });
});
