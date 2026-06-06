import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendancePanel from "../components/AttendancePanel";
import { mockAttendance, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AttendancePanel", () => {
  it("shows loading skeletons initially", () => {
    globalThis.fetch = mockFetch(mockAttendance);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders workers after fetch", async () => {
    globalThis.fetch = mockFetch(mockAttendance);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Rajesh Kumar")).toBeInTheDocument();
    expect(screen.getByText("Amit Singh")).toBeInTheDocument();
  });

  it("shows Present badge for checked-in workers", async () => {
    globalThis.fetch = mockFetch(mockAttendance);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Present")).toBeInTheDocument();
  });

  it("shows Idle badge for workers with no job", async () => {
    globalThis.fetch = mockFetch(mockAttendance);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Idle")).toBeInTheDocument();
  });

  it("shows Check In button for workers with active job but not checked in", async () => {
    const attendanceNoCheckin = [
      { ...mockAttendance[1],
        check_in_status: null,
        job_id: "job-1",
        job_status: "scheduled",
        customer: "Sharma Residence",
      },
    ];
    globalThis.fetch = mockFetch(attendanceNoCheckin);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("Check In")).toBeInTheDocument();
  });

  it("calls onRefresh when checking in", async () => {
    const onRefresh = vi.fn();
    const attendanceData = [{
      ...mockAttendance[1],
      check_in_status: null,
      job_id: "job-1",
      job_status: "scheduled",
      customer: "Sharma Residence",
    }];
    globalThis.fetch = mockFetch(attendanceData);
    render(<AttendancePanel refresh={0} onRefresh={onRefresh} />);

    const checkInBtn = await screen.findByText("Check In");
    globalThis.fetch = mockFetch({ id: "ci-1", status: "on_time" });
    await userEvent.click(checkInBtn);

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("shows empty state when no workers", async () => {
    globalThis.fetch = mockFetch([]);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText("No workers")).toBeInTheDocument();
  });

  it("displays current job assignment", async () => {
    globalThis.fetch = mockFetch(mockAttendance);
    render(<AttendancePanel refresh={0} onRefresh={() => {}} />);
    expect(await screen.findByText(/Sharma Residence/)).toBeInTheDocument();
  });
});
