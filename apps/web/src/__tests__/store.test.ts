import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/lib/store";

describe("useUIStore Zustand Store", () => {
  beforeEach(() => {
    // Reset state before each test
    useUIStore.setState({
      sidebarOpen: true,
      activeTicketId: null,
    });
  });

  it("should initialize with default values", () => {
    const state = useUIStore.getState();
    expect(state.sidebarOpen).toBe(true);
    expect(state.activeTicketId).toBeNull();
  });

  it("should toggle the sidebar state", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(false);

    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarOpen).toBe(true);
  });

  it("should select a ticket ID", () => {
    useUIStore.getState().selectTicket("ticket_123");
    expect(useUIStore.getState().activeTicketId).toBe("ticket_123");

    useUIStore.getState().selectTicket(null);
    expect(useUIStore.getState().activeTicketId).toBeNull();
  });
});
