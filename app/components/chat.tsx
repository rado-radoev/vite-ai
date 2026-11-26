import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Bubble, BubbleContent } from "~/components/ui/bubble";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Message, MessageContent, MessageHeader } from "~/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "~/components/ui/message-scroller";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import { useChat } from "~/hooks/use-chat";

const prompts = ["Explain how this app works", "Give me a small TypeScript tip"];

export function Chat({ mode }: { mode: "local" | "agentcore" }) {
  const chat = useChat();
  const locked = chat.status !== "idle";

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Card className="flex-1">
        <CardHeader className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle><h1>vite-ai</h1></CardTitle>
            <CardDescription>Strands + AgentCore</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{mode === "local" ? "Local agent" : "AgentCore"}</Badge>
            <Button type="button" variant="ghost" disabled={locked} onClick={chat.reset}>New chat</Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="relative h-80 min-h-80 flex-1">
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport aria-label="Conversation messages">
                <MessageScrollerContent aria-label="Conversation" aria-live="polite" aria-busy={chat.status === "pending"}>
                  {chat.messages.map((message, index) => {
                    const align = message.role === "user" ? "end" : "start";
                    // Complete turns are append-only until reset, so indexes
                    // remain stable identifiers within this conversation.
                    return (
                      <MessageScrollerItem key={index} messageId={String(index)} scrollAnchor={message.role === "user"}>
                        <Message align={align}>
                          <MessageContent>
                            <MessageHeader>{message.role === "user" ? "You" : "Assistant"}</MessageHeader>
                            <Bubble variant={message.role === "user" ? "default" : "muted"} align={align}>
                              <BubbleContent>
                                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p>
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
          {chat.messages.length === 0 && (
            <Empty className="absolute inset-0">
              <EmptyHeader>
                <EmptyTitle role="heading" aria-level={2}>Start a conversation</EmptyTitle>
                <EmptyDescription>Ask a question or try a prompt below.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {prompts.map((prompt) => (
                  <Button key={prompt} type="button" variant="outline" disabled={locked} onClick={() => chat.setDraft(prompt)}>{prompt}</Button>
                ))}
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
        <CardFooter>
          <form className="flex w-full flex-col gap-4" onSubmit={(event) => {
            event.preventDefault();
            void chat.send();
          }}>
            {chat.status === "pending" && <p role="status" className="text-sm text-muted-foreground">Thinking…</p>}
            {chat.error && <Alert variant="destructive"><AlertDescription>{chat.error}</AlertDescription></Alert>}
            <FieldGroup>
              <Field data-disabled={locked}>
                <FieldLabel htmlFor="message">Message</FieldLabel>
                <Textarea
                  id="message"
                  name="message"
                  value={chat.draft}
                  onChange={(event) => chat.setDraft(event.target.value)}
                  disabled={locked}
                  placeholder="Ask anything…"
                  rows={3}
                  className="max-h-48 resize-y"
                />
              </Field>
              <Field orientation="horizontal" className="justify-end">
                <Button type="submit" disabled={!chat.draft.trim() || locked}>Send</Button>
              </Field>
            </FieldGroup>
          </form>
        </CardFooter>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Replies can be inaccurate. Check important information.</p>
    </main>
  );
}
