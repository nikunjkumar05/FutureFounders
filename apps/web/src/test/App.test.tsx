import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import ProviderDashboard from "../pages/ProviderDashboard";
import { mockJobs, mockFetch } from "./mocks";

function renderDashboard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<ProviderDashboard />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  const me = mockFetch({
    id: "test-id",
    email: "test@test.com",
    name: "Test User",
    role: "provider",
  });
  globalThis.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
    if (url === "/api/auth/me") return me();
    return mockFetch(mockJobs)();
  });
  localStorage.setItem("auth", JSON.stringify({
    user: { id: "test-id", email: "test@test.com", name: "Test User", role: "provider" },
    token: "fake-token",
  }));
});

describe("App", () => {
  it("renders the header with MakeWebApp title", async () => {
    renderDashboard();
    expect(await screen.findByText("MakeWebApp")).toBeInTheDocument();
  });

  it("renders the sign out button", async () => {
    renderDashboard();
    expect(await screen.findByText("Sign Out")).toBeInTheDocument();
  });

  it("shows completion percentage based on job data", async () => {
    renderDashboard();
    const pct = await screen.findByText("50%");
    expect(pct).toBeInTheDocument();
  });

  it("renders all main section headings", async () => {
    renderDashboard();
    expect(await screen.findByText("Job Queue")).toBeInTheDocument();
  });

  it("shows the provider name in header", async () => {
    renderDashboard();
    expect(await screen.findByText("Test User")).toBeInTheDocument();
  });
});
