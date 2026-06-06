import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../App";
import { mockJobs, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the header with AquaOps title", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<App />);
    expect(screen.getByText("AquaOps")).toBeInTheDocument();
  });

  it("renders the WhatsApp link", () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<App />);
    const waLink = screen.getByText("WhatsApp");
    expect(waLink).toBeInTheDocument();
    expect(waLink.closest("a")).toHaveAttribute("href", "https://wa.me/919999999991");
  });

  it("shows completion percentage based on job data", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<App />);
    const pct = await screen.findByText("50%");
    expect(pct).toBeInTheDocument();
  });

  it("renders all main section headings", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<App />);
    expect(await screen.findByText("Job Queue")).toBeInTheDocument();
  });

  it("renders the live status badge", () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<App />);
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });
});
