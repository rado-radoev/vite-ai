# Coding standards

This is a learning starter: keep one chat flow, one Strands agent, and one CDK stack. These project rules adapt [Matt Pocock's engineering skills](https://github.com/mattpocock/skills), especially `codebase-design`, `tdd`, and `code-review`.

## Design and TypeScript

- Design deep modules: small interfaces that hide meaningful implementation. Add an abstraction only when it earns locality or supports a real alternate adapter.
- Keep deterministic logic in ordinary TypeScript. React UI stays functional; CDK resources use classes extending `Construct` or the appropriate CDK class.
- Share chat schemas, types, limits, and neutral model configuration. Infer transport types from Zod; parse external JSON as `unknown` instead of asserting it is trustworthy.
- Import TypeScript source using extensionless paths in Vite/tsx code, and explicit `.ts` paths in the compiled agent. The agent compiler rewrites those to `.js` in its output. Source imports must not pretend a TypeScript file is already JavaScript.
- Preserve public behavior while refactoring. Prefer named props, clear control flow, and comments explaining why rather than narrating syntax.

## Frameworks

- React Router uses Framework mode, filesystem routes, generated route types, and server-only modules for AWS access. Choose fetchers for route mutations when they simplify the interface; a JSON resource-route transport may use native fetch if it preserves simple retry and error behavior.
- Compose official shadcn primitives and use their variants and semantic tokens. Form fields, errors, empty states, messages, and scrolling use the corresponding components instead of hand-built substitutes.
- Strands owns the model loop. Instantiate one agent per request and pass the submitted prior history; keep model calls server-side and configuration explicit.
- A CDK construct class owns runtime resources and execution permissions; the stack owns configuration and outputs. Use `this` as child scope, exact IAM grants, and stable logical IDs. Review synthesized changes before any deployment.

## Verification and scope

- Test behavior at the existing browser, JSON API/HTTP, model invocation, transport, and CDK synthesis seams. For a newly introduced seam, confirm it first. For new behavior, run a single failing test before its minimal implementation; use existing green tests to protect refactoring.
- Run type checks regularly and the combined checks and browser suite before delivery. Exercise compiled agent startup, not only its TypeScript source.
- Mock only external/cloud calls when live inference is not authorized. Fixtures stay in tests. Passing synthesis or fixtures does not prove deployment or live Bedrock access.
- Keep credentials and message contents out of logs, bundles, source, and test reports. Keep local/private deployment limitations explicit.
- Installing skills does not authorize Git commits, pushes, AWS deployment, billable model calls, or changing other profiles. Perform those only on explicit user request.

Framework skill sources and update commands are listed in `.agents/README.md`. Matt's skill bundle is installed for the active Hermes profile and loaded on demand; its workflow-specific setup is not permission to create remote issue labels or modify a tracker.
