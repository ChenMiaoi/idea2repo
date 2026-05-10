import { describe, expect, it } from "vitest";
import { buildApiUrl } from "./api";

describe("api helpers", () => {
  it("keeps relative paths when no API base is configured", () => {
    expect(buildApiUrl("/generate", "")).toBe("/generate");
  });

  it("joins configured API bases without duplicate slashes", () => {
    expect(buildApiUrl("/generate", "http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/generate"
    );
  });
});
