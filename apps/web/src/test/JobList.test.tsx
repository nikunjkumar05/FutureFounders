import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobList from "../components/JobList";
import { mockJobs, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("JobList", () => {
  it("shows loading skeletons initially", () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    const skeletons = document.querySelectorAll(".skeleton");
    expect(skeletons.length).toBe(3);
  });

  it("renders jobs after fetch", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Sharma Residence")).toBeInTheDocument();
    expect(screen.getByText("Green Valley Apartments")).toBeInTheDocument();
  });

  it("displays status badges", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("shows worker names", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText(/Rajesh Kumar/)).toBeInTheDocument();
  });

  it("shows COMPLETE button for scheduled jobs", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    const buttons = await screen.findAllByText("Complete");
    expect(buttons.length).toBe(1);
  });

  it("calls onRefresh when completing a job", async () => {
    const onRefresh = vi.fn();
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={onRefresh} />);

    const completeBtn = await screen.findByText("Complete");
    globalThis.fetch = mockFetch({ id: mockJobs[0].id, status: "completed" });
    await userEvent.click(completeBtn);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("shows Feedback button for completed jobs", async () => {
    globalThis.fetch = mockFetch(mockJobs);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Feedback")).toBeInTheDocument();
  });

  it("shows empty state when no jobs", async () => {
    globalThis.fetch = mockFetch([]);
    render(<JobList refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
  });
});
