"use client";

import * as React from "react";
import { useDocuments } from "@/hooks/use-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Upload,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
} from "lucide-react";

export default function DocumentsPage() {
  const {
    documents,
    isLoading,
    isUploading,
    uploadError,
    uploadDocument,
    deleteDocument,
    isDeleting,
  } = useDocuments();

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    uploadDocument(selectedFile, {
      onSuccess: () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  // Helper to format file sizes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Helper to render status badges
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50">Ready</Badge>;
      case "FAILED":
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="size-3" /> Failed</Badge>;
      case "QUEUED":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50 animate-pulse flex items-center gap-1">
            <Loader2 className="animate-spin size-3 shrink-0" /> Queued
          </Badge>
        );
      case "EXTRACTING":
        return (
          <Badge className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900/50 animate-pulse flex items-center gap-1">
            <Loader2 className="animate-spin size-3 shrink-0" /> Parsing
          </Badge>
        );
      case "EMBEDDING":
        return (
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50 animate-pulse flex items-center gap-1">
            <Loader2 className="animate-spin size-3 shrink-0" /> Indexing
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Database className="size-8" /> Knowledge Base Ingestion
        </h1>
        <p className="text-sm text-zinc-500">
          Upload customer guides, API specifications, and service directories to feed Aegis AI&apos;s responder context.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Upload panel */}
        <Card className="md:col-span-1 border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50 h-fit">
          <CardHeader>
            <CardTitle>Ingest Document</CardTitle>
            <CardDescription>
              Select a file (PDF, DOCX, TXT, MD) up to 10MB to index into Pinecone vector storage namespaces.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUploadSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
                <Upload className="size-8 text-zinc-400 mb-2" />
                <span className="text-xs text-zinc-500 font-medium text-center">
                  Drag files here or click to browse
                </span>
                <input
                  ref={fileInputRef}
                  id="file-upload"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose File
                </Button>
              </div>

              {selectedFile && (
                <div className="flex items-center gap-2 rounded-md bg-zinc-50 border border-zinc-200/80 p-2.5 dark:bg-zinc-800/40 dark:border-zinc-700/60">
                  <FileText className="size-4 text-zinc-500 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
                      {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatBytes(selectedFile.size)}
                    </span>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive flex items-start gap-1.5">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>{uploadError.message}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="w-full mt-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin size-4 shrink-0 mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-4 shrink-0 mr-2" />
                    Upload & Ingest
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* List of Documents */}
        <Card className="md:col-span-2 border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <CardHeader>
            <CardTitle>Indexed Knowledge Sources</CardTitle>
            <CardDescription>
              Stored files processed into vector database structures for semantic retrieval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="animate-spin text-zinc-500 size-8" />
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 border border-zinc-200 border-dashed rounded-lg dark:border-zinc-800 text-center p-6 bg-zinc-50/50 dark:bg-zinc-900/20">
                <Database className="size-8 text-zinc-400 mb-2" />
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">No Documents Uploaded</span>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  Get started by uploading guides to automatically populate the agent&apos;s memory.
                </p>
              </div>
            ) : (
              <div className="border border-zinc-200/80 rounded-lg overflow-hidden dark:border-zinc-800/80">
                <Table>
                  <TableHeader className="bg-zinc-50 dark:bg-zinc-800/20">
                    <TableRow>
                      <TableHead>Document Title</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: { id: string; title: string; fileSize: number; status: string; createdAt: string }) => (
                      <TableRow key={doc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10">
                        <TableCell className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2 max-w-xs truncate">
                          <FileText className="size-4 text-zinc-500 shrink-0" />
                          <span className="truncate" title={doc.title}>
                            {doc.title}
                          </span>
                        </TableCell>
                        <TableCell className="text-zinc-600 dark:text-zinc-400">
                          {formatBytes(doc.fileSize)}
                        </TableCell>
                        <TableCell>{renderStatusBadge(doc.status)}</TableCell>
                        <TableCell className="text-zinc-500 text-xs">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={isDeleting || doc.status === "DELETING"}
                            onClick={() => deleteDocument(doc.id)}
                            className="text-zinc-400 hover:text-destructive hover:bg-destructive/10"
                            title="Delete knowledge source"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
