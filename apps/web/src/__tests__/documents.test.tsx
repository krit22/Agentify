import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import DocumentsPage from "@/app/(dashboard)/documents/page";
import { useDocuments } from "@/hooks/use-api";

// Mock the API hooks module
vi.mock("@/hooks/use-api", () => ({
  useDocuments: vi.fn(),
}));

describe("DocumentsPage Component", () => {
  const mockDeleteDocument = vi.fn();
  const mockUploadDocument = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loader spinner when loading", () => {
    vi.mocked(useDocuments).mockReturnValue({
      documents: [],
      pagination: undefined,
      isLoading: true,
      refetch: vi.fn(),
      uploadDocument: mockUploadDocument,
      isUploading: false,
      uploadError: null,
      deleteDocument: mockDeleteDocument,
      isDeleting: false,
    });

    const { container } = render(<DocumentsPage />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("displays empty state message when no documents exist", () => {
    vi.mocked(useDocuments).mockReturnValue({
      documents: [],
      pagination: undefined,
      isLoading: false,
      refetch: vi.fn(),
      uploadDocument: mockUploadDocument,
      isUploading: false,
      uploadError: null,
      deleteDocument: mockDeleteDocument,
      isDeleting: false,
    });

    render(<DocumentsPage />);
    expect(screen.getByText(/No Documents Uploaded/i)).toBeDefined();
    expect(screen.getByText(/Get started by uploading guides/i)).toBeDefined();
  });

  it("renders documents list table with statuses and size formatting", () => {
    vi.mocked(useDocuments).mockReturnValue({
      documents: [
        {
          id: "doc_1",
          title: "Setup_Instructions.pdf",
          fileSize: 1048576, // 1 MB
          status: "READY",
          createdAt: "2026-06-23T09:00:00Z",
        },
        {
          id: "doc_2",
          title: "API_Spec.docx",
          fileSize: 51200, // 50 KB
          status: "EMBEDDING",
          createdAt: "2026-06-23T09:10:00Z",
        },
      ],
      pagination: { page: 1, limit: 20, totalPages: 1, totalCount: 2 },
      isLoading: false,
      refetch: vi.fn(),
      uploadDocument: mockUploadDocument,
      isUploading: false,
      uploadError: null,
      deleteDocument: mockDeleteDocument,
      isDeleting: false,
    });

    render(<DocumentsPage />);

    // Verify filenames and sizes are rendered correctly
    expect(screen.getByText("Setup_Instructions.pdf")).toBeDefined();
    expect(screen.getByText("1 MB")).toBeDefined();
    expect(screen.getByText("Ready")).toBeDefined();

    expect(screen.getByText("API_Spec.docx")).toBeDefined();
    expect(screen.getByText("50 KB")).toBeDefined();
    expect(screen.getByText("Indexing")).toBeDefined();
  });

  it("calls deleteDocument when delete icon is clicked", () => {
    vi.mocked(useDocuments).mockReturnValue({
      documents: [
        {
          id: "doc_uuid_999",
          title: "Delete_Me.txt",
          fileSize: 1024,
          status: "READY",
          createdAt: "2026-06-23T09:00:00Z",
        },
      ],
      pagination: undefined,
      isLoading: false,
      refetch: vi.fn(),
      uploadDocument: mockUploadDocument,
      isUploading: false,
      uploadError: null,
      deleteDocument: mockDeleteDocument,
      isDeleting: false,
    });

    render(<DocumentsPage />);

    const deleteBtn = screen.getByTitle("Delete knowledge source");
    fireEvent.click(deleteBtn);

    expect(mockDeleteDocument).toHaveBeenCalledWith("doc_uuid_999");
  });
});
