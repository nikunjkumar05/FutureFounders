export const TIME_SAVED_WEIGHTS = {
  completedJob: 15,
  reminderSent: 2,
  reminderResponseReceived: 3,
  customerCreated: 2,
  attendanceCheckIn: 0.5,
} as const;

export interface TimeSavedCounts {
  completedJobs: number;
  remindersSent: number;
  reminderResponses: number;
  customersCreated: number;
  attendanceCheckIns: number;
}

export function calculateTotalMinutes(counts: TimeSavedCounts): number {
  return (
    counts.completedJobs * TIME_SAVED_WEIGHTS.completedJob +
    counts.remindersSent * TIME_SAVED_WEIGHTS.reminderSent +
    counts.reminderResponses * TIME_SAVED_WEIGHTS.reminderResponseReceived +
    counts.customersCreated * TIME_SAVED_WEIGHTS.customerCreated +
    counts.attendanceCheckIns * TIME_SAVED_WEIGHTS.attendanceCheckIn
  );
}

export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}
