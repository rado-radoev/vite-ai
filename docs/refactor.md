# Learning-starter refactor

## Request

Use Matt Pocock's installed engineering skills together with the official Strands, React Router, shadcn, and AWS CDK skills to rewrite this starter without expanding its basic scope. Remove misleading `.js` imports from TypeScript source. Use class-based CDK constructs.

## Acceptance criteria

- Relevant Matt skills are installed and actually loaded for the active Hermes profile; framework skills stay project-local.
- One simple chat screen, stateless full-history JSON requests, one real Bedrock-backed Strands agent, and one AgentCore deployment stack remain.
- Chat retries, pending locks, session reset, plain-text rendering, safe validation/errors, and same-origin/server-only AWS invocation remain working.
- Shared schemas and neutral model config replace duplicated contracts and infrastructure dependencies on the running agent.
- TypeScript source no longer imports local `.js` paths. The compiled agent still starts with native Node ESM; emitted `.js` imports are correct and expected.
- Runtime deployment resources and permissions live behind a class-based CDK construct; stack configuration and outputs stay readable. Preserve logical IDs where feasible and disclose replacements.
- Use the existing behavior-test seams, passing type checks, production builds, unit/browser tests, compiled server smoke check, and credential-free synthesis. Report live AWS/container limitations separately.
- No Git commit/push, live deployment, billable inference, auth/database/streaming, or enterprise architecture is requested.

## Review baseline

The clean starting revision is `f6d614234559a03209d82c3c628c434760282ef4`. Review the working-tree diff against that revision, including new files (no commits are authorized). Standards source: `CODING_STANDARDS.md`; spec source: this document.
