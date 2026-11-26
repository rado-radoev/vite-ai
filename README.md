# vite-ai

A small AI chat starter for learning **TypeScript**, **Vite**, **React Router Framework**, **shadcn/ui**, **Strands Agents**, and **AWS Bedrock AgentCore Runtime**.

One chat page. One agent. One CDK stack. No database, authentication, tool servers, or persistent memory in the application.

## How it fits together

```text
Browser chat
  → React Router server action: POST /api/chat
  → local agent: POST http://127.0.0.1:8080/invocations
    OR AWS SDK: InvokeAgentRuntime (IAM-signed, server-side)
  → TypeScript Strands Agent
  → Amazon Bedrock model
```

The browser sends the conversation history with each request. The agent is created fresh for each turn, so conversations do not share mutable agent state. Reloading the page clears the chat. AgentCore's session ID identifies the runtime session; it is not durable chat storage.

Responses are plain text and non-streaming on purpose. Strands runs the model loop; AgentCore hosts the agent. Neither replaces the other.

## Start locally

Prerequisites:

- Node.js **22.22+** and npm.
- AWS credentials from your normal AWS credential chain (for example an AWS CLI SSO profile).
- Permission to invoke the chosen Amazon Bedrock model in your region. Local development still uses Bedrock and incurs model charges.

```bash
npm ci
cp .env.example .env
# Optional: set AWS_PROFILE in .env for an existing profile.
# Sign in to that profile using your normal AWS SSO workflow.
npm run dev
```

Open **http://localhost:5173**. This starts the web app and the agent together. Stop both with Ctrl+C.

The default region is `us-east-1`; the default model is `amazon.nova-lite-v1:0`. Both are configurable in `.env`. Use a model available for direct invocation in your region; this starter's CDK policy intentionally grants only the configured foundation model, not arbitrary models or cross-region inference profiles.

Check the agent without invoking the model:

```bash
curl http://127.0.0.1:8080/ping
```

Without working AWS credentials or model permission, the UI shows an error rather than a fabricated AI reply. Credentials and AWS calls stay on the server. Do not put credentials in variables prefixed with `VITE_`.

## The files to learn first

| File | What to change here |
| --- | --- |
| `app/routes.ts` | `flatRoutes()` enables React Router's filesystem conventions. |
| `app/routes/_index.tsx` | The `/` page and server loader. |
| `app/components/chat.tsx` | The chat UI and browser state. |
| `app/routes/api.chat.ts` | The `/api/chat` resource route and server action. |
| `app/lib/agent.server.ts` | Switches between local HTTP and AWS AgentCore invocation. |
| `shared/chat.ts` | The request types and Zod validation shared by both servers. |
| `agent/` | Strands agent, HTTP runtime, and container. |
| `infra/` | TypeScript AWS CDK app and AgentCore runtime stack. |
| `app/components/ui/` | shadcn components copied into your repo, ready to edit. |

Routing examples: `app/routes/about.tsx` becomes `/about`; `app/routes/chat.$id.tsx` becomes `/chat/:id`. Keep helpers outside `app/routes/` so they do not become routes.

## Deploy only the agent to AgentCore

This repository scaffolds agent deployment, **not hosting for the web application**. You can keep the web app local while learning AgentCore.

Prerequisites: working AWS CLI credentials, Docker with ARM64 build support, AgentCore availability in the selected region, and permission to bootstrap/deploy CDK infrastructure. CDK publishes a container to ECR and creates an IAM-authenticated AgentCore Runtime. Deployment and usage incur AWS charges.

```bash
aws sts get-caller-identity
npm run cdk -- bootstrap
npm run cdk:synth
npm run cdk -- diff
npm run cdk -- deploy --outputs-file cdk-outputs.json
```

Use the same region/profile for CDK and the application. CDK configuration loads `.env`. Review the generated IAM policy before deploying. No deployment runs automatically during installation, builds, or tests.

Copy the runtime ARN from the stack output into `.env`:

```dotenv
AGENTCORE_RUNTIME_ARN=your-deployed-runtime-arn
```

Restart the web app with **`npm run dev:web`**. It now calls AgentCore using the server's AWS credentials; the local agent server is no longer needed. The calling identity needs `bedrock-agentcore:InvokeAgentRuntime` on that runtime. The runtime execution role has separate Bedrock model permissions.

Clean up the agent stack when finished learning:

```bash
npm run cdk -- destroy
```

CDK's shared bootstrap resources and published ECR assets may remain; review your AWS account separately for those.

## Verify the starter

```bash
npm run check        # type generation, TypeScript, unit tests, web build, agent build
npx playwright install chromium
npm run test:e2e     # browser tests (explicit test-only API fixtures, no AWS charges)
npm run cdk:synth    # synthesize CloudFormation without deploying
npm audit
```

Tests cover the UI, request validation, local transport, AWS SDK invocation shape, the agent runtime, and the CDK template. They do **not** prove live Bedrock access or a deployed AgentCore invocation. Browser replies are fixtures only in tests; there is no production mock mode.

Production web server: `npm run build && npm start`. Run the local agent separately, or set the deployed runtime ARN. This starter has no end-user authentication or rate limiting: keep it local/private until you add those protections. Same-origin checks are not authentication.

## Optional coding-assistant tooling

These help your coding assistant; they are not dependencies of the chat agent.

Official skills for Strands, shadcn, React Router, Bedrock/AgentCore, and the Strands SOP workflows are installed under `.agents/skills/`. See [the skill inventory and update commands](.agents/README.md). `skills-lock.json` records their upstream sources and revisions. Skills are loaded on demand; installing them does not run the workflows or change the application.

The AWS CDK skill is installed project-locally under `.agents/skills/aws-cdk/`:

```bash
npx skills add https://github.com/aws/agent-toolkit-for-aws --skill aws-cdk --agent codex --yes
```

Strands documentation MCP server (requires `uv`):

```bash
npm run mcp:inspect  # interactive Inspector UI
npm run mcp:check    # CLI handshake and list available documentation tools
```

The actual package name is `@modelcontextprotocol/inspector`, not a local file named `modelcontextprotocol/inspector`.

Codex marketplace registration:

```bash
codex plugin marketplace add strands-agents/harness-sdk
```

This registers the marketplace; it does not install every plugin or add MCP configuration to other editors.

Add more UI components with `npx shadcn@latest add <component>`.

The full dependency audit currently reports a moderate minimatch advisory in React Router's filesystem-route build tooling. `npm audit --omit=dev` is clean. Do not override minimatch to v11: it removed `makeRe`, which filesystem routing needs. Update the routing package when an upstream-compatible fix is available.

## Small next steps

1. Add an `/about` route to practice filesystem routing and loaders.
2. Add a system prompt in `agent/runtime.ts`.
3. Add one read-only Strands tool.
4. Learn Strands streaming, then stream replies to the UI.
5. Add authentication before exposing the app publicly.

## Documentation

- [React Router Framework](https://reactrouter.com/start/framework/installation)
- [Filesystem routing](https://reactrouter.com/how-to/file-route-conventions)
- [shadcn + React Router](https://ui.shadcn.com/docs/installation/react-router)
- [Strands TypeScript SDK](https://strandsagents.com/docs/user-guide/sdk/quickstart/typescript/)
- [AgentCore CDK constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrockagentcore-readme.html)
- [AgentCore HTTP runtime contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)
