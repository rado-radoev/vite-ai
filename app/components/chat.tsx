import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";

type Message = { role: "user" | "assistant"; content: string };

export function Chat({ mode }: { mode: "local" | "agentcore" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // Disable the composer until mount so pre-hydration typing isn't lost.
  useEffect(() => { setSessionId(crypto.randomUUID()); }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || pending || !sessionId) return;
    setPending(true);
    setError(undefined);
    const userMessage: Message = { role: "user", content: draft.trim() };
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage], sessionId }),
      });
      const result: { reply?: string; error?: string } = await response.json();
      if (!response.ok) {
        setError(result.error || "Couldn't send your message. Please try again.");
        return;
      }
      if (typeof result.reply !== "string" || !result.reply.trim()) {
        setError("The agent returned an empty reply. Please try again.");
        return;
      }
      // Commit a complete turn only after success. On failure the draft stays
      // in place, so Send retries it without adding duplicate user messages.
      setMessages([...messages, userMessage, { role: "assistant", content: result.reply }]);
      setDraft("");
    } catch {
      setError("Couldn't reach the agent. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">vite-ai</h1>
          <p className="mt-1 text-sm text-muted-foreground">Strands + AgentCore</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">{mode === "local" ? "Local agent" : "AgentCore"}</Badge>
          <Button type="button" variant="ghost" disabled={pending || !sessionId} onClick={() => {
            setMessages([]);
            setDraft("");
            setError(undefined);
            setSessionId(crypto.randomUUID());
          }}>New chat</Button>
        </div>
      </header>
      <Card className="flex-1">
        <CardContent className="flex min-h-80 flex-1 flex-col gap-6">
          <div role="log" aria-label="Conversation" aria-live="polite" className="space-y-5">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-xl px-4 py-3 sm:max-w-[85%] ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="mb-1 text-xs opacity-70">{message.role === "user" ? "You" : "Assistant"}</p>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                </div>
              </div>
            ))}
          </div>
          {messages.length === 0 && (
            <div className="py-10 text-center">
              <h2 className="text-lg font-medium">Start a conversation</h2>
              <p className="mt-2 text-sm text-muted-foreground">Ask a question or try a prompt below.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {["Explain how this app works", "Give me a small TypeScript tip"].map((prompt) => (
                  <Button key={prompt} type="button" variant="outline" disabled={pending || !sessionId} onClick={() => setDraft(prompt)}>{prompt}</Button>
                ))}
              </div>
            </div>
          )}
          {pending && <p role="status" className="text-sm text-muted-foreground">Thinking…</p>}
          {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <form onSubmit={send} className="mt-auto space-y-3 border-t pt-5">
            <label htmlFor="message" className="text-sm font-medium">Message</label>
            <Textarea id="message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={pending || !sessionId} placeholder="Ask anything…" rows={3} className="max-h-48 resize-y" />
            <div className="flex justify-end">
              <Button type="submit" disabled={!draft.trim() || pending || !sessionId}>Send</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Replies can be inaccurate. Check important information.</p>
    </main>
  );
}
