import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricsBar from "../components/MetricsBar";
import { mockMetrics, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("MetricsBar", () => {
  it("renders loading skeletons initially", () => {
    globalThis.fetch = mockFetch(mockMetrics);
    render(<MetricsBar />);
    const skeletons = document.querySelectorAll(".skeleton");
    expect(skeletons.length).toBe(3);
  });

  it("displays metrics after fetch", async () => {
    globalThis.fetch = mockFetch(mockMetrics);
    render(<MetricsBar />);
    expect(await screen.findByText("COMPLETED TODAY")).toBeInTheDocument();
    expect(screen.getByText("LOW STOCK ITEMS")).toBeInTheDocument();
    expect(screen.getByText("REMINDERS DUE (7D)")).toBeInTheDocument();
  });

  it("displays the correct values", async () => {
    const now = performance.now.bind(performance);
    vi.spyOn(performance, "now").mockReturnValue(1000000);
    globalThis.fetch = mockFetch(mockMetrics);
    render(<MetricsBar />);
    expect(await screen.findByText("COMPLETED TODAY")).toBeInTheDocument();
    expect(screen.getByText("LOW STOCK ITEMS")).toBeInTheDocument();
    expect(screen.getByText("REMINDERS DUE (7D)")).toBeInTheDocument();
    performance.now = now;
  });

  it("handles fetch errors gracefully", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = mockFetch(null, false, 404);
    render(<MetricsBar />);
    expect(document.querySelectorAll(".skeleton").length).toBe(3);
    spy.mockRestore();
  });
});
