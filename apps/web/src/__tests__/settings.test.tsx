import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import SettingsPage from "@/app/(dashboard)/settings/page";
import { useSettings } from "@/hooks/use-api";

// Mock the API hooks module
vi.mock("@/hooks/use-api", () => ({
  useSettings: vi.fn(),
}));

describe("SettingsPage Component", () => {
  const mockUpdateSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loader spinner when query is loading", () => {
    vi.mocked(useSettings).mockReturnValue({
      settings: undefined,
      isLoading: true,
      isError: false,
      error: null,
      updateSettings: mockUpdateSettings,
      isUpdating: false,
    });

    const { container } = render(<SettingsPage />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("pre-populates configurations inside input forms when loaded", () => {
    vi.mocked(useSettings).mockReturnValue({
      settings: {
        orgId: "org_123",
        settings: {
          vectorScoreThreshold: 0.78,
          defaultTicketUrgency: "high",
          escalationSLAHours: 12,
        },
        widgetConfig: {
          brandColor: "#00ff00",
          logoUrl: null,
          widgetPosition: "right",
          greetingMessage: "Welcome to support",
          allowedDomains: ["test.com", "app.test.com"],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      updateSettings: mockUpdateSettings,
      isUpdating: false,
    });

    render(<SettingsPage />);

    // Verify input elements are pre-filled correctly
    expect((screen.getByLabelText(/Vector Search Similarity/i) as HTMLInputElement).value).toBe("0.78");
    expect((screen.getByLabelText(/SLA Warning Window/i) as HTMLInputElement).value).toBe("12");
    expect((screen.getByLabelText(/Widget Brand Color/i) as HTMLInputElement).value).toBe("#00ff00");
    expect((screen.getByLabelText(/Widget Greeting Message/i) as HTMLInputElement).value).toBe("Welcome to support");
    expect((screen.getByLabelText(/Allowed CORS Web Domains/i) as HTMLTextAreaElement).value).toBe("test.com, app.test.com");
  });

  it("dispatches updateSettings on form submission with changed inputs", () => {
    vi.mocked(useSettings).mockReturnValue({
      settings: {
        orgId: "org_123",
        settings: {
          vectorScoreThreshold: 0.70,
          defaultTicketUrgency: "med",
          escalationSLAHours: 24,
        },
        widgetConfig: {
          brandColor: "#111111",
          logoUrl: null,
          widgetPosition: "right",
          greetingMessage: "Hello",
          allowedDomains: ["localhost"],
        },
      },
      isLoading: false,
      isError: false,
      error: null,
      updateSettings: mockUpdateSettings,
      isUpdating: false,
    });

    render(<SettingsPage />);

    // Modify inputs
    const thresholdInput = screen.getByLabelText(/Vector Search Similarity/i);
    fireEvent.change(thresholdInput, { target: { value: "0.85" } });

    const greetingInput = screen.getByLabelText(/Widget Greeting Message/i);
    fireEvent.change(greetingInput, { target: { value: "Howdy!" } });

    // Submit form
    const saveButton = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(saveButton);

    // Assert dispatch payload contains updated and converted types
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      settings: {
        vectorScoreThreshold: 0.85,
        defaultTicketUrgency: "med",
        escalationSLAHours: 24,
      },
      widgetConfig: {
        brandColor: "#111111",
        greetingMessage: "Howdy!",
        allowedDomains: ["localhost"],
      },
    });
  });
});
