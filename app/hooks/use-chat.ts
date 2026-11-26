import { useEffect, useRef, useState } from "react";
import {
  chatErrorSchema,
  chatResponseSchema,
  type ChatMessage,
  type ChatRequest,
} from "../../shared/chat";

// One interface owns the draft, complete turns, session, and request lifecycle.
export function useChat() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"initializing" | "idle" | "pending">("initializing");
  const [error, setError] = useState<string>();
  const sessionId = useRef<string | undefined>(undefined);
  const activeRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    // Keep the composer disabled until hydration so early typing isn't lost.
    sessionId.current = crypto.randomUUID();
    setStatus("idle");
    return () => activeRequest.current?.abort();
  }, []);

  async function send() {
    if (!draft.trim() || !sessionId.current || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setStatus("pending");
    setError(undefined);
    const userMessage: ChatMessage = { role: "user", content: draft.trim() };
    const payload: ChatRequest = {
      messages: [...messages, userMessage],
      sessionId: sessionId.current,
    };

    try {
      // This resource route returns plain JSON, including HTTP errors. Native
      // fetch lets malformed JSON/network failures stay inline with the draft,
      // rather than replacing the chat with a router error boundary. There is
      // no loader-owned conversation to revalidate after sending a message.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        const parsed = chatErrorSchema.safeParse(result);
        setError(parsed.success ? parsed.data.error : "Couldn't send your message. Please try again.");
        return;
      }
      const parsed = chatResponseSchema.safeParse(result);
      if (!parsed.success) {
        setError("The agent returned an empty reply. Please try again.");
        return;
      }
      // Commit a complete turn only after success. A failed attempt keeps the
      // same draft and history, so Send retries without duplicating messages.
      setMessages([...payload.messages, { role: "assistant", content: parsed.data.reply }]);
      setDraft("");
    } catch {
      if (!controller.signal.aborted) {
        setError("Couldn't reach the agent. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        activeRequest.current = undefined;
        setStatus("idle");
      }
    }
  }

  function reset() {
    if (!sessionId.current || activeRequest.current) return;
    setMessages([]);
    setDraft("");
    setError(undefined);
    sessionId.current = crypto.randomUUID();
  }

  return { draft, setDraft, messages, status, error, send, reset };
}
