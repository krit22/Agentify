/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import TicketsPage from "@/app/(dashboard)/tickets/page";
import { useTickets, useTicketDetail } from "@/hooks/use-api";
import { useUIStore } from "@/lib/store";

// Mock the API hooks and Zustand store
vi.mock("@/hooks/use-api", () => ({
  useTickets: vi.fn(),
  useTicketDetail: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useUIStore: vi.fn(),
}));

describe("TicketsPage Component", () => {
  const mockSelectTicket = vi.fn();
  const mockSendReply = vi.fn();
  const mockSuggestResolve = vi.fn();
  const mockHarvestResolve = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    // Default mock for UIStore
    vi.mocked(useUIStore).mockReturnValue({
      activeTicketId: null,
      selectTicket: mockSelectTicket,
    } as any);
  });

  it("renders split-pane layout and lists open tickets", () => {
    vi.mocked(useTickets).mockReturnValue({
      tickets: [
        {
          id: "ticket_1",
          userContact: "customer1@gmail.com",
          urgency: "high",
          status: "OPEN",
          summary: "Need help upgrading custom plan",
          createdAt: "2026-06-23T09:00:00Z",
        },
      ],
      pagination: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.mocked(useTicketDetail).mockReturnValue({
      ticket: undefined,
      isLoading: false,
      isError: false,
      sendReply: mockSendReply,
      isSendingReply: false,
      suggestResolve: mockSuggestResolve,
      isSuggestingResolve: false,
      harvestResolve: mockHarvestResolve,
      isHarvesting: false,
    });

    render(<TicketsPage />);

    // Verify list pane displays the ticket email and summary preview
    expect(screen.getByText("customer1@gmail.com")).toBeDefined();
    expect(screen.getByText("Need help upgrading custom plan")).toBeDefined();
    expect(screen.getByText("High")).toBeDefined();

    // Right pane should show empty selected state
    expect(screen.getByText("No Ticket Selected")).toBeDefined();
  });

  it("renders messages thread when ticket is active", () => {
    vi.mocked(useUIStore).mockReturnValue({
      activeTicketId: "ticket_1",
      selectTicket: mockSelectTicket,
    } as any);

    vi.mocked(useTickets).mockReturnValue({
      tickets: [],
      pagination: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    vi.mocked(useTicketDetail).mockReturnValue({
      ticket: {
        id: "ticket_1",
        userContact: "customer1@gmail.com",
        urgency: "high",
        status: "OPEN",
        summary: "Need help upgrading custom plan",
        createdAt: "2026-06-23T09:00:00Z",
        messages: [
          { role: "user", content: "Can you help me?" },
          { role: "assistant", content: "Yes, I am here." },
        ],
      },
      isLoading: false,
      isError: false,
      sendReply: mockSendReply,
      isSendingReply: false,
      suggestResolve: mockSuggestResolve,
      isSuggestingResolve: false,
      harvestResolve: mockHarvestResolve,
      isHarvesting: false,
    });

    render(<TicketsPage />);

    // Verify messages thread renders
    expect(screen.getByText("Can you help me?")).toBeDefined();
    expect(screen.getByText("Yes, I am here.")).toBeDefined();

    // Verify response box and resolve ticket actions are rendered
    expect(screen.getByPlaceholderText("Draft response to the client...")).toBeDefined();
    expect(screen.getByRole("button", { name: /resolve ticket/i })).toBeDefined();
  });

  it("opens Harvester modal dialog when clicking Resolve Ticket and loads suggestions", async () => {
    vi.mocked(useUIStore).mockReturnValue({
      activeTicketId: "ticket_1",
      selectTicket: mockSelectTicket,
    } as any);

    vi.mocked(useTickets).mockReturnValue({
      tickets: [],
      pagination: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    mockSuggestResolve.mockResolvedValue({
      suggestedQuestion: "Suggested resolution question?",
      suggestedAnswer: "Suggested resolution answer.",
    });

    vi.mocked(useTicketDetail).mockReturnValue({
      ticket: {
        id: "ticket_1",
        userContact: "customer1@gmail.com",
        urgency: "high",
        status: "OPEN",
        summary: "Need help upgrading custom plan",
        createdAt: "2026-06-23T09:00:00Z",
        messages: [],
      },
      isLoading: false,
      isError: false,
      sendReply: mockSendReply,
      isSendingReply: false,
      suggestResolve: mockSuggestResolve,
      isSuggestingResolve: false,
      harvestResolve: mockHarvestResolve,
      isHarvesting: false,
    });

    render(<TicketsPage />);

    // Click Resolve Ticket Button
    const resolveBtn = screen.getByRole("button", { name: /resolve ticket/i });
    fireEvent.click(resolveBtn);

    // Verify harvester modal titles render
    await waitFor(() => {
      expect(screen.getByText("Final Customer Question Summary")).toBeDefined();
      expect(screen.getByText("Resolved Answer / Solution")).toBeDefined();
    });

    // Verify pre-populated suggested text boxes
    expect((screen.getByLabelText(/Final Customer Question Summary/i) as HTMLInputElement).value).toBe(
      "Suggested resolution question?"
    );
    expect((screen.getByLabelText(/Resolved Answer \/ Solution/i) as HTMLTextAreaElement).value).toBe(
      "Suggested resolution answer."
    );
  });
});
