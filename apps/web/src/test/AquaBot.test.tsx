import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AquaBot from "../components/AquaBot";
import { mockFetch } from "./mocks";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AquaBot", () => {
  it("renders the AI Assistant header", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
  });

  it("renders the BETA badge", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText("BETA")).toBeInTheDocument();
  });

  it("shows initial greeting message", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByText(/Hi! I'm the AI assistant/i)).toBeInTheDocument();
  });

  it("has an input field and send button", () => {
    globalThis.fetch = mockFetch({ reply: "Hello!" });
    render(<AquaBot />);
    expect(screen.getByPlaceholderText("Ask the assistant...")).toBeInTheDocument();
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
    const input = screen.getByPlaceholderText("Ask the assistant...");
    await userEvent.type(input, "help");
    const sendBtn = screen.getByText("Send");
    expect(sendBtn).toBeEnabled();
  });

  it("adds user message and bot reply on send", async () => {
    const reply = "I'm the MakeWebApp assistant. How can I help you today?";
    globalThis.fetch = mockFetch({ reply });
    render(<AquaBot />);

    const input = screen.getByPlaceholderText("Ask the assistant...");
    await userEvent.type(input, "What services do you offer?");
    await userEvent.click(screen.getByText("Send"));

    expect(await screen.findByText("What services do you offer?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(reply)).toBeInTheDocument());
  });

  it("shows error message on non-ok response", async () => {
    globalThis.fetch = mockFetch(null, false);
    render(<AquaBot />);

    const input = screen.getByPlaceholderText("Ask the assistant...");
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByText("Send"));

    expect(await screen.findByText(/Sorry, I couldn't process/)).toBeInTheDocument();
  });
});
