"use client";

import * as React from "react";
import { useUIStore } from "@/lib/store";
import { useTickets, useTicketDetail } from "@/hooks/use-api";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Inbox,
  Clock,
  Send,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface TicketData {
  id: string;
  userContact: string;
  urgency: "low" | "med" | "high";
  status: string;
  summary: string | null;
  createdAt: string;
}

export default function TicketsPage() {
  const { activeTicketId, selectTicket } = useUIStore();
  const [activeTab, setActiveTab] = React.useState<string>("OPEN");
  const { tickets, isLoading, refetch } = useTickets(activeTab);

  const {
    ticket,
    isLoading: isTicketLoading,
    sendReply,
    isSendingReply,
    suggestResolve,
    isSuggestingResolve,
    harvestResolve,
    isHarvesting,
  } = useTicketDetail(activeTicketId);

  // Local state for drafting a reply
  const [replyText, setReplyText] = React.useState("");

  // Local state for Q&A Harvester modal
  const [isHarvesterOpen, setIsHarvesterOpen] = React.useState(false);
  const [harvestQuestion, setHarvestQuestion] = React.useState("");
  const [harvestAnswer, setHarvestAnswer] = React.useState("");
  const [publishToKb, setPublishToKb] = React.useState(true);

  // Reference to auto-scroll message thread
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [ticket?.messages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicketId) return;

    try {
      await sendReply(replyText.trim());
      setReplyText("");
    } catch (err) {
      console.error("Failed to send reply:", err);
    }
  };

  const handleOpenHarvester = async () => {
    if (!activeTicketId) return;
    setIsHarvesterOpen(true);
    try {
      const suggestion = await suggestResolve();
      setHarvestQuestion(suggestion.suggestedQuestion || "");
      setHarvestAnswer(suggestion.suggestedAnswer || "");
    } catch (err) {
      console.error("Failed to load resolution suggestion:", err);
    }
  };

  const handleHarvestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicketId) return;

    try {
      await harvestResolve({
        publish: publishToKb,
        question: harvestQuestion,
        answer: harvestAnswer,
      });
      setIsHarvesterOpen(false);
      selectTicket(null); // Deselect ticket once resolved
      refetch();
    } catch (err) {
      console.error("Failed to harvest ticket:", err);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case "high":
        return <Badge className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">High</Badge>;
      case "med":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50">Medium</Badge>;
      default:
        return <Badge className="bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">Low</Badge>;
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* LEFT PANE: TICKETS LIST */}
      <div className="w-80 flex flex-col border border-zinc-200 bg-white rounded-lg overflow-hidden dark:border-zinc-800 dark:bg-zinc-900/30 shrink-0">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Inbox className="size-5" /> Support Queue
          </h2>
        </div>
        
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-3 pt-2">
            <TabsList className="grid grid-cols-3 w-full bg-zinc-100 dark:bg-zinc-800">
              <TabsTrigger value="OPEN" className="text-xs">Open</TabsTrigger>
              <TabsTrigger value="PENDING" className="text-xs">Pending</TabsTrigger>
              <TabsTrigger value="RESOLVED" className="text-xs">Resolved</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="animate-spin text-zinc-500 size-6" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-400 dark:text-zinc-500">
                <MessageSquare className="size-8 mb-2 opacity-50" />
                <span className="text-xs font-medium">No tickets in queue</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {tickets.map((t: TicketData) => {
                  const isActive = activeTicketId === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTicket(t.id)}
                      className={`w-full text-left rounded-lg border p-3.5 transition-all outline-hidden ${
                        isActive
                          ? "bg-zinc-900 border-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900"
                          : "border-zinc-200/70 bg-zinc-50/30 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-950/20 dark:text-zinc-300 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <span className="text-xs font-semibold truncate max-w-[140px]">
                          {t.userContact}
                        </span>
                        {getUrgencyBadge(t.urgency)}
                      </div>
                      <p className={`text-xs line-clamp-2 leading-relaxed ${isActive ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-500"}`}>
                        {t.summary || "No summary available."}
                      </p>
                      <div className="flex items-center gap-1 mt-2.5 text-[10px] opacity-70">
                        <Clock className="size-3" />
                        <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Tabs>
      </div>

      {/* RIGHT PANE: DETAIL & CHAT PANEL */}
      <div className="flex-1 flex flex-col border border-zinc-200 bg-white rounded-lg overflow-hidden dark:border-zinc-800 dark:bg-zinc-900/30 min-w-0">
        {!activeTicketId ? (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-zinc-950/10">
            <MessageSquare className="size-12 mb-4 opacity-40" />
            <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">No Ticket Selected</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm">
              Select an active ticket from the support queue to view the conversation thread, reply to the client, or resolve the issue.
            </p>
          </div>
        ) : isTicketLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="animate-spin text-zinc-500 size-8" />
          </div>
        ) : !ticket ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-6 text-red-500">
            <AlertCircle className="size-10 mb-2" />
            <span>Ticket details could not be loaded.</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header info */}
            <header className="flex justify-between items-center p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {ticket.userContact}
                  </span>
                  <Badge variant="outline" className="capitalize text-[10px] font-medium py-0 h-5">
                    {ticket.status.toLowerCase()}
                  </Badge>
                </div>
                <span className="text-xs text-zinc-500 mt-0.5 truncate max-w-lg">
                  {ticket.summary}
                </span>
              </div>

              {ticket.status !== "RESOLVED" && (
                <Button
                  size="sm"
                  onClick={handleOpenHarvester}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 gap-1.5"
                >
                  <CheckCircle className="size-4 shrink-0" />
                  Resolve Ticket
                </Button>
              )}
            </header>

            {/* Scrollable messages thread */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-zinc-50/50 dark:bg-zinc-950/10 min-h-0">
              {ticket.messages && ticket.messages.map((msg: { role: string; content: string }, idx: number) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={idx}
                    className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm shadow-xs ${
                        isUser
                          ? "bg-white border border-zinc-200 text-zinc-950 dark:bg-zinc-800 dark:border-zinc-700/60 dark:text-zinc-50"
                          : "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input Box */}
            <div className="p-4 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shrink-0">
              {ticket.status === "RESOLVED" ? (
                <div className="rounded-lg bg-zinc-50 border border-zinc-200/80 p-3.5 text-xs text-zinc-500 text-center dark:bg-zinc-800/40 dark:border-zinc-700/60">
                  This conversation has been resolved and archived. Knowledge harvesting was completed successfully.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="flex gap-3 items-end">
                  <Textarea
                    placeholder="Draft response to the client..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    required
                    className="min-h-[44px] h-[44px] flex-1 resize-none py-3"
                  />
                  <Button
                    type="submit"
                    disabled={isSendingReply || !replyText.trim()}
                    className="h-11 px-4 shrink-0 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900"
                  >
                    {isSendingReply ? (
                      <Loader2 className="animate-spin size-4 shrink-0" />
                    ) : (
                      <Send className="size-4 shrink-0" />
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RESOLUTION & KNOWLEDGE HARVESTER DIALOG */}
      <Dialog open={isHarvesterOpen} onOpenChange={setIsHarvesterOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <CheckCircle className="size-5 text-emerald-600" />
              Resolve Ticket & Harvest Knowledge
            </DialogTitle>
            <DialogDescription>
              Review the synthetic Q&A formulated from this conversation thread to index it in your knowledge base.
            </DialogDescription>
          </DialogHeader>

          {isSuggestingResolve ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2">
              <Loader2 className="animate-spin text-zinc-500 size-8" />
              <span className="text-xs text-zinc-500 font-medium">Generating suggested Q&A resolution...</span>
            </div>
          ) : (
            <form onSubmit={handleHarvestSubmit} className="flex flex-col gap-4 py-3">
              {/* Question */}
              <div className="grid gap-2">
                <label htmlFor="harvestQ" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Final Customer Question Summary
                </label>
                <Input
                  id="harvestQ"
                  value={harvestQuestion}
                  onChange={(e) => setHarvestQuestion(e.target.value)}
                  required
                />
              </div>

              {/* Answer */}
              <div className="grid gap-2">
                <label htmlFor="harvestA" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Resolved Answer / Solution
                </label>
                <Textarea
                  id="harvestA"
                  value={harvestAnswer}
                  onChange={(e) => setHarvestAnswer(e.target.value)}
                  required
                  className="min-h-[120px]"
                />
              </div>

              {/* Checkbox */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <input
                  id="publishKb"
                  type="checkbox"
                  checked={publishToKb}
                  onChange={(e) => setPublishToKb(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 accent-zinc-900 size-4 cursor-pointer"
                />
                <label htmlFor="publishKb" className="text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                  Publish this resolution summary as a synthetic document to the Knowledge Base.
                </label>
              </div>

              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsHarvesterOpen(false)}
                  disabled={isHarvesting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isHarvesting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isHarvesting ? (
                    <>
                      <Loader2 className="animate-spin size-4 shrink-0 mr-1.5" />
                      Resolving...
                    </>
                  ) : (
                    "Save & Close Ticket"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
