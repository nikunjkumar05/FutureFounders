import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AquaBot from "../components/AquaBot";
import { mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AquaBot", () => {
  it("renders the AquaBot header", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText("AquaBot")).toBeInTheDocument();
  });

  it("renders the AI badge", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("shows initial greeting message", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText(/Hi! I'm AquaBot/i)).toBeInTheDocument();
  });

  it("has an input field and send button", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByPlaceholderText("Ask AquaBot...")).toBeInTheDocument();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("send button is disabled when input is empty", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    const sendBtn = screen.getByText("Send");
    expect(sendBtn).toBeDisabled();
  });

  it("send button is enabled when input has text", async () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    const input = screen.getByPlaceholderText("Ask AquaBot...");
    await userEvent.type(input, "price");
    const sendBtn = screen.getByText("Send");
    expect(sendBtn).toBeEnabled();
  });

  it("adds user message and bot reply on send", async () => {
    const reply = "Our standard water tank cleaning starts at ₹999.";
    globalThis.fetch = mockFetch({ reply });
    render(<AquaBot />);

    const input = screen.getByPlaceholderText("Ask AquaBot...");
    await userEvent.type(input, "What is the price?");
    await userEvent.click(screen.getByText("Send"));

    expect(await screen.findByText("What is the price?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(reply)).toBeInTheDocument());
  });

  it("shows error message on non-ok response", async () => {
    globalThis.fetch = mockFetch(null, false);
    render(<AquaBot />);

    const input = screen.getByPlaceholderText("Ask AquaBot...");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByText("Send"));

    expect(await screen.findByText(/Sorry, I couldn't process/)).toBeInTheDocument();
  });
});
