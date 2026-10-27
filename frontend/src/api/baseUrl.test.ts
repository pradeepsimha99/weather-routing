import { describe, expect, it } from "vitest";
import { normalizeBaseUrl } from "./client";

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com"],
    ["https://api.example.com/", "https://api.example.com"],
    ["https://api.example.com///", "https://api.example.com"],
    ["  https://api.example.com/  ", "https://api.example.com"],
    ["http://localhost:8000", "http://localhost:8000"],
  ])("cleans %j to %j", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  it.each([undefined, "", "   ", "/"])("falls back to the local backend for %j", (input) => {
    expect(normalizeBaseUrl(input)).toBe("http://localhost:8000");
  });
});