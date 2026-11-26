import type { Route } from "./+types/_index";
import { Chat } from "~/components/chat";

export function meta() {
  return [
    { title: "vite-ai | Strands + AgentCore" },
    { name: "description", content: "A simple chat built with React Router, Strands, and AWS AgentCore." },
  ];
}

// Only the mode crosses the server/browser boundary, never the ARN or keys.
export function loader() {
  return { mode: process.env.AGENTCORE_RUNTIME_ARN ? "agentcore" as const : "local" as const };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return <Chat mode={loaderData.mode} />;
}
