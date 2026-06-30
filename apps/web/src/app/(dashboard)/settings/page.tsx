"use client";

import * as React from "react";
import { useSettings } from "@/hooks/use-api";
import { useTheme } from "next-themes";
import { useAuth } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, HelpCircle, Loader2, Sun, Moon, Monitor, Copy, Check, Trash2, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { settings, isLoading, isUpdating, updateSettings, clearKnowledgeBase, isClearing } = useSettings();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const { orgId } = useAuth();
  const [copiedType, setCopiedType] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<'html' | 'react' | 'inline'>('html');

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  React.useEffect(() => {
    const frameId = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Local state for form values to ensure smooth typing
  const [vectorThreshold, setVectorThreshold] = React.useState("0.70");
  const [urgency, setUrgency] = React.useState<"low" | "med" | "high">("med");
  const [slaHours, setSlaHours] = React.useState("24");
  const [brandColor, setBrandColor] = React.useState("#18181b");
  const [greeting, setGreeting] = React.useState("Hello! How can I help you today?");
  const [domains, setDomains] = React.useState("");

  // Sync state when settings query finishes loading
  React.useEffect(() => {
    if (settings) {
      const syncSettings = () => {
        setVectorThreshold(settings.settings?.vectorScoreThreshold?.toString() || "0.70");
        setUrgency(settings.settings?.defaultTicketUrgency || "med");
        setSlaHours(settings.settings?.escalationSLAHours?.toString() || "24");
        setBrandColor(settings.widgetConfig?.brandColor || "#18181b");
        setGreeting(settings.widgetConfig?.greetingMessage || "Hello! How can I help you today?");
        setDomains(settings.widgetConfig?.allowedDomains?.join(", ") || "");
      };
      syncSettings();
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedDomains = domains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    updateSettings({
      settings: {
        vectorScoreThreshold: parseFloat(vectorThreshold),
        defaultTicketUrgency: urgency,
        escalationSLAHours: parseInt(slaHours, 10),
      },
      widgetConfig: {
        brandColor,
        greetingMessage: greeting,
        allowedDomains: parsedDomains,
      },
    });
  };

  const handleClearKnowledgeBase = async () => {
    const confirmed = window.confirm(
      "WARNING: This will permanently delete all ingested documents, raw stored files, and purge all vectorized embeddings from the Pinecone index.\n\nAre you sure you want to clear the entire knowledge base? This action is irreversible."
    );
    if (!confirmed) return;

    try {
      const res = await clearKnowledgeBase();
      alert(`Knowledge base cleared successfully!\nRemaining documents in DB: ${res.remainingDbDocs}\nRemaining vector embeddings in Pinecone: ${res.remainingVectors}`);
    } catch (err: any) {
      alert(`Error clearing knowledge base: ${err.message || err}`);
    }
  };

  const apiHost = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname.replace(':3001', '')}:3000` : 'http://localhost:3000';
  const htmlSnippet = `<script\n  src="${apiHost}/api/widget/script"\n  data-org-id="${orgId || ''}"\n  async\n></script>`;
  const reactSnippet = `import Script from 'next/script';\n\nexport default function AegisSupportWidget() {\n  return (\n    <Script\n      src="${apiHost}/api/widget/script"\n      data-org-id="${orgId || ''}"\n      strategy="afterInteractive"\n    />\n  );\n}`;
  const inlineSnippet = `<!-- Container Target Mount Element -->\n<div id="aegis-chat-widget" style="height: 600px; width: 400px; border-radius: 12px; overflow: hidden;"></div>\n\n<!-- Script Injection -->\n<script\n  src="${apiHost}/api/widget/script"\n  data-org-id="${orgId || ''}"\n  data-container-id="aegis-chat-widget"\n  async\n></script>`;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-zinc-500 size-8" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Title */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Settings className="size-8" /> Workspace Settings
        </h1>
        <p className="text-sm text-zinc-500">
          Configure response filters, escalation metrics, Allowed CORS domains, and brand profiles.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Core AI configurations */}
        <Card className="border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <CardHeader>
            <CardTitle>Copilot Logic Configurations</CardTitle>
            <CardDescription>
              Tweak how the autonomous responder processes context and categorizes issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Score Threshold */}
            <div className="grid gap-2">
              <label
                htmlFor="scoreThreshold"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5"
              >
                Vector Search Similarity Threshold
                <span className="group relative">
                  <HelpCircle className="size-4 text-zinc-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-md bg-zinc-950 p-2 text-xs text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md">
                    Matches scoring below this limit trigger escalation warnings. E.g. 0.75.
                  </span>
                </span>
              </label>
              <Input
                id="scoreThreshold"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={vectorThreshold}
                onChange={(e) => setVectorThreshold(e.target.value)}
                required
                className="max-w-xs"
              />
            </div>

            {/* Default Urgency */}
            <div className="grid gap-2">
              <label
                htmlFor="urgency"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Default Support Urgency Escalation Profile
              </label>
              <Select
                value={urgency}
                onValueChange={(val) => {
                  if (val) setUrgency(val);
                }}
              >
                <SelectTrigger id="urgency" className="max-w-xs">
                  <SelectValue placeholder="Select Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (General inquiries)</SelectItem>
                  <SelectItem value="med">Medium (Standard accounts requests)</SelectItem>
                  <SelectItem value="high">High (Service outage / production errors)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* SLA Hours */}
            <div className="grid gap-2">
              <label
                htmlFor="slaHours"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Escalation SLA Warning Window (Hours)
              </label>
              <Input
                id="slaHours"
                type="number"
                min="1"
                value={slaHours}
                onChange={(e) => setSlaHours(e.target.value)}
                required
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Chat Widget configuration */}
        <Card className="border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <CardHeader>
            <CardTitle>Chat Widget Configuration</CardTitle>
            <CardDescription>
              Style and restrict access settings for the public website widget.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Brand Color */}
            <div className="grid gap-2">
              <label
                htmlFor="brandColor"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Widget Brand Color (Hex Theme)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="brandColor"
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  required
                  className="max-w-xs font-mono"
                />
                <div
                  className="size-8 rounded-md border border-zinc-300 dark:border-zinc-700 shadow-sm"
                  style={{ backgroundColor: brandColor }}
                />
              </div>
            </div>

            {/* Greeting Message */}
            <div className="grid gap-2">
              <label
                htmlFor="greeting"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Default Widget Greeting Message
              </label>
              <Input
                id="greeting"
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                required
              />
            </div>

            {/* Allowed domains */}
            <div className="grid gap-2">
              <label
                htmlFor="domains"
                className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Allowed CORS Web Domains
              </label>
              <Textarea
                id="domains"
                placeholder="E.g. localhost:5173, domain.com, sub.domain.com"
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                className="min-h-[80px]"
              />
              <p className="text-xs text-zinc-500">
                Comma-separated list of domains allowed to embed and query your widget streams. Leave empty to allow all.
              </p>
            </div>
          </CardContent>
          <CardFooter className="border-t border-zinc-100 dark:border-zinc-800 p-6 flex justify-end">
            <Button type="submit" disabled={isUpdating} className="w-28">
              {isUpdating ? (
                <>
                  <Loader2 className="animate-spin size-4 shrink-0 mr-2" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Theme Preference Settings */}
      <Card className="border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50">
        <CardHeader>
          <CardTitle>Appearance Preferences</CardTitle>
          <CardDescription>
            Customize your console theme. Toggle between light mode, dark mode, or system themes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border border-zinc-200/80 dark:border-zinc-800/85 rounded-xl p-4 bg-zinc-50/50 dark:bg-zinc-950/20">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Console Mode</span>
              <span className="text-xs text-zinc-500">Switch current appearance preference.</span>
            </div>
            
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
              <Button
                variant={mounted && theme === "light" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("light")}
                className={`rounded-lg gap-1.5 px-3 py-1 text-xs font-semibold ${mounted && theme === "light" ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                <Sun className="size-3.5" /> Light
              </Button>
              <Button
                variant={mounted && theme === "dark" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("dark")}
                className={`rounded-lg gap-1.5 px-3 py-1 text-xs font-semibold ${mounted && theme === "dark" ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                <Moon className="size-3.5" /> Dark
              </Button>
              <Button
                variant={mounted && theme === "system" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setTheme("system")}
                className={`rounded-lg gap-1.5 px-3 py-1 text-xs font-semibold ${mounted && theme === "system" ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                <Monitor className="size-3.5" /> System
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widget Integration Card */}
      <Card className="border border-zinc-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/50">
        <CardHeader>
          <CardTitle>Widget Integration Snippet</CardTitle>
          <CardDescription>
            Inject the automated responder widget into your websites. Copy and paste the script below before the closing body tag.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Tab Selector Button Row */}
          <div className="flex justify-between items-center bg-zinc-100/50 dark:bg-zinc-950/20 border border-zinc-200/80 dark:border-zinc-800/50 p-2 rounded-xl">
            <span className="text-xs font-semibold text-zinc-500 pl-1">Integration Format</span>
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
              <Button
                variant={activeTab === 'html' ? "secondary" : "ghost"}
                size="sm"
                type="button"
                onClick={() => setActiveTab('html')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${activeTab === 'html' ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                HTML Script
              </Button>
              <Button
                variant={activeTab === 'react' ? "secondary" : "ghost"}
                size="sm"
                type="button"
                onClick={() => setActiveTab('react')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${activeTab === 'react' ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                React/Next.js
              </Button>
              <Button
                variant={activeTab === 'inline' ? "secondary" : "ghost"}
                size="sm"
                type="button"
                onClick={() => setActiveTab('inline')}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${activeTab === 'inline' ? "bg-white dark:bg-zinc-700 shadow-xs text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                Inline Target
              </Button>
            </div>
          </div>

          {/* Snippet Code Box */}
          <div className="relative rounded-xl border border-zinc-200/80 bg-zinc-950 dark:border-zinc-800/80 p-4 font-mono text-[11px] text-zinc-200 leading-relaxed overflow-x-auto min-h-[120px]">
            <pre className="whitespace-pre">
              {activeTab === 'html' && htmlSnippet}
              {activeTab === 'react' && reactSnippet}
              {activeTab === 'inline' && inlineSnippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleCopy(
                activeTab === 'html' ? htmlSnippet : activeTab === 'react' ? reactSnippet : inlineSnippet,
                activeTab
              )}
              className="absolute top-3 right-3 size-7 bg-zinc-900/85 hover:bg-zinc-800 text-zinc-300 border-zinc-800 rounded-lg shrink-0 outline-hidden hover:text-white"
              title="Copy snippet to clipboard"
            >
              {copiedType === activeTab ? (
                <Check className="size-3.5 text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-900/25 text-xs text-zinc-500 leading-relaxed">
            {activeTab === 'html' && (
              <p>
                <strong>HTML instructions:</strong> Simply paste this tag inside the <code>&lt;body&gt;</code> element of any index.html or static website page. Ensure the <code>data-org-id</code> matches your workspace.
              </p>
            )}
            {activeTab === 'react' && (
              <p>
                <strong>Next.js instructions:</strong> Import the code inside your root layout or page template using Next.js&apos;s standard <code>next/script</code> helper component.
              </p>
            )}
            {activeTab === 'inline' && (
              <p>
                <strong>Inline instructions:</strong> Set up a matching target container element (e.g. <code>&lt;div id=&quot;aegis-chat-widget&quot;&gt;</code>) somewhere on the page. The loader will automatically mount the chat module within that specific element rather than generating a floating trigger bubble in the bottom corner.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border border-red-200/80 bg-red-50/10 dark:border-red-900/30 dark:bg-red-950/10">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2 text-xl font-bold">
            <Trash2 className="size-5 shrink-0" /> Danger Zone
          </CardTitle>
          <CardDescription className="text-red-500/80 dark:text-red-400/70 text-xs">
            Permanently delete all ingested documents, raw stored files, and purge all vectorized embeddings from the Pinecone index.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between border border-red-200/50 dark:border-red-900/20 rounded-xl p-4 bg-red-50/5 dark:bg-red-950/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Clear Knowledge Base</span>
              <span className="text-xs text-zinc-500">Purge database records, vector stores, and raw assets.</span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={isClearing}
              onClick={handleClearKnowledgeBase}
              className="gap-1.5 font-semibold"
            >
              {isClearing ? (
                <>
                  <Loader2 className="animate-spin size-4 shrink-0" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="size-4 shrink-0" /> Clear All Data
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
