import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReminderQueue from "../components/ReminderQueue";
import { mockReminders, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ReminderQueue", () => {
  it("shows loading skeletons initially", () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders reminders after fetch", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Sharma Residence")).toBeInTheDocument();
    expect(screen.getByText("Green Valley Apartments")).toBeInTheDocument();
  });

  it("displays due status badges", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("OVERDUE")).toBeInTheDocument();
  });

  it("shows Send button for pending reminders", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Send")).toBeInTheDocument();
  });

  it("shows Sent badge for sent reminders", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Sent")).toBeInTheDocument();
  });

  it("calls sendReminder and refreshes on Send click", async () => {
    const onRefresh = vi.fn();
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={onRefresh} />);

    const sendLink = await screen.findByText("Send");
    globalThis.fetch = mockFetch({ id: mockReminders[0].id, status: "sent" });
    await userEvent.click(sendLink);

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("shows empty state when no reminders", async () => {
    globalThis.fetch = mockFetch([]);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("No reminders")).toBeInTheDocument();
  });

  it("displays address information", async () => {
    globalThis.fetch = mockFetch(mockReminders);
    render(<ReminderQueue refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText(/Andheri West/)).toBeInTheDocument();
  });
});
