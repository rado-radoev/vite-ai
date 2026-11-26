# Project agent skills

These are project-local coding-assistant instructions, not runtime agent tools or application dependencies. Compatible assistants discover `skills/*/SKILL.md` on demand.

## Installed skills

| Source | Skills |
| --- | --- |
| [Strands Harness SDK](https://github.com/strands-agents/harness-sdk) | `strands`, `build-with-strands`, `scaffold-agent`, `add-tool`, `add-mcp-server`, `port-from-langgraph` |
| [shadcn/ui](https://ui.shadcn.com/docs/skills) | `shadcn` |
| [React Router](https://github.com/remix-run/react-router/tree/main/.agents/skills/react-router) | `react-router` |
| [AWS Agent Toolkit](https://github.com/aws/agent-toolkit-for-aws) | `aws-cdk`, `amazon-bedrock` (includes AgentCore Runtime/container guides) |
| [Strands Agent SOPs](https://github.com/strands-agents/agent-sop/tree/skills-dist) | `code-assist`, `code-task-generator`, `codebase-summary`, `pdd`, `eval`, `agent-sop-author` |

The React Router and Strands source repositories also contain contributor-only maintenance, documentation, and release skills. Those are intentionally excluded from this consuming application.

## Use

Examples: ask your coding assistant to “add a filesystem route,” “add a Strands tool,” or “plan this feature using pdd.” It should select the corresponding skill. Installing skills does not authorize commits, pushes, AWS deployment, billable model calls, or broad rewrites. In particular, skip the `code-assist` SOP's commit step unless the user explicitly requests a commit.

Keep this learning app's existing framework and simple structure. Skills may describe optional tools, streaming, databases, or managed harnesses; do not introduce them merely because a skill mentions them.

SOP output conventions:

- `summary/`: codebase documentation.
- `planning/`: designs and implementation plans.
- `tasks/`: generated task specifications.
- `scratchpad/`: temporary working notes, ignored by Git.

No empty output directories are created until a workflow actually needs them.

## Reinstall or update

Run from the repository root:

```bash
npx skills add https://github.com/strands-agents/harness-sdk --skill strands build-with-strands scaffold-agent add-tool add-mcp-server port-from-langgraph --agent codex --yes
npx skills add https://github.com/shadcn/ui --skill shadcn --agent codex --yes
npx skills add https://github.com/remix-run/react-router --skill react-router --agent codex --yes
npx skills add https://github.com/aws/agent-toolkit-for-aws --skill aws-cdk amazon-bedrock --agent codex --yes
npx skills add https://github.com/strands-agents/agent-sop/tree/skills-dist --skill '*' --agent codex --yes
npx skills list
```

The SOP repository's `main` branch contains only the native `agent-sop-author` skill. Its official `skills-dist` branch includes the generated workflow skills; use that branch to install the complete set.

`skills-lock.json` records upstream sources, commits, and hashes. The Strands focused skills are flattened into sibling directories by the installer; their relative links were corrected locally to point to `../strands/SKILL.md` and `../strands/references/`. Recheck these links after updating: upstream hashes describe the original source, while those five local files contain this path-only adaptation.

The shadcn repository redirects to `shadcn-ui/ui`; that canonical source is recorded by the installer. Upstream skills are supplied with their supporting references and scripts. Review changes before running any scripts or allowing deployment actions.
