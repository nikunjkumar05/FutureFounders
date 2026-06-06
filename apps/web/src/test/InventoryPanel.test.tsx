import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryPanel from "../components/InventoryPanel";
import { mockInventory, mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("InventoryPanel", () => {
  it("renders inventory items after fetch", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    render(<InventoryPanel refresh={0} />);
    expect(await screen.findByText("Chlorine Solution")).toBeInTheDocument();
    expect(screen.getByText("Anti-Bacterial Gel")).toBeInTheDocument();
  });

  it("displays item quantities", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    render(<InventoryPanel refresh={0} />);
    expect(await screen.findByText("50")).toBeInTheDocument();
  });

  it("displays unit labels", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    render(<InventoryPanel refresh={0} />);
    const litres = await screen.findAllByText("litre");
    expect(litres.length).toBe(2);
  });

  it("shows low stock warning for items below threshold", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    render(<InventoryPanel refresh={0} />);
    expect(await screen.findByText(/Low stock/)).toBeInTheDocument();
    expect(screen.getByText(/min 5 litre/)).toBeInTheDocument();
  });

  it("does not show low stock for normal items", async () => {
    globalThis.fetch = mockFetch(mockInventory);
    render(<InventoryPanel refresh={0} />);
    expect(await screen.findByText("Chlorine Solution")).toBeInTheDocument();
  });
});
