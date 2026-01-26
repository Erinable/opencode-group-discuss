# OpenCode Group Discuss

<p align="center">
  <img src="./.github/assets/hero.svg" alt="OpenCode Group Discuss Hero" />
</p>

<p align="center">
  <a href="./README_CN.md">中文文档</a> | <b>English</b>
</p>

> [!WARNING]
> **Security: file sandbox is strict.**
> - `files` can only read files within the OpenCode project root (`realpath` check prevents symlink escape).
> - Limits: max 10 files; max 256 KiB per file; max 1 MiB total (fail-closed if exceeded).

[![CI](https://github.com/Erinable/opencode-group-discuss/actions/workflows/ci.yml/badge.svg)](https://github.com/Erinable/opencode-group-discuss/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square)](./LICENSE)

---

# Your Single Agent is Lonely. Give them a Team.

[Claude Code](https://www.claude.com/product/claude-code) is great. DeepSeek is smart.
But if you're building complex software, **you don't work alone. Why should your AI?**

**OpenCode Group Discuss** brings the "Room of Experts" to your terminal.
**Stop baby-sitting your agent. Let them fight it out.**

- **Debate Mode**: Uncertainty? Have an _Advocate_ and a _Critic_ battle it out while a _Moderator_ decides the winner.
- **Collaborative Mode**: Building a system? Summon an _Architect_, a _DBA_, and a _Security Expert_ to draft the plan together.
- **Consensus Engine**: It's not just a chatroom. It detects consensus, breaks stalemates, and delivers a final verdict.
- **Zero Hallucination Loops**: Configurable rounds and strict context budgeting prevent endless rambling.

Remember the last time you merged a PR without review? Yeah, don't do that with AI code either.
**This isn't just a plugin. It's your AI Engineering Manager.**

## Just Skip Reading This Readme

### It's the Age of Agents

**Just paste this link into Claude Code / OpenCode and ask it to explain.**
Ask why this is better than a single prompt. ask how it prevents "yes-man" behavior.

```text
Hey, please read this readme and explain why "Group Discuss" is better than a single agent for architectural decisions.
https://raw.githubusercontent.com/Erinable/opencode-group-discuss/master/README.md
```

### 🪄 The Magic Word: `preset`

**Don't want to configure JSONs? Just use `preset`.**

We've baked in the best practices.

- `tech-review`: 3-round debate for choosing tech stacks.
- `code-review`: Author vs Reviewer vs Security.
- `architecture`: High-level system design committee.

Just type:
```javascript
group_discuss({ "preset": "tech-review", "topic": "Should we use Next.js or Remix?" })
```
And watch them fight.

## Installation

### For Humans

1. Install the package in your OpenCode project:
   ```bash
   npm install -D opencode-group-discuss
   ```

2. Enable it in your `opencode.json`:
   ```json
   {
     "plugin": ["opencode-group-discuss"]
   }
   ```

### For LLM Agents

Fetch the installation guide and follow it (yes, you can tell your agent to do this):

```bash
npm install -D opencode-group-discuss && \
node -e 'const fs=require("fs"); const p="opencode.json"; const c=JSON.parse(fs.readFileSync(p)); if(!c.plugin.includes("opencode-group-discuss")) { c.plugin.push("opencode-group-discuss"); fs.writeFileSync(p, JSON.stringify(c, null, 2)); }'
```

## Features that Matter

### 1. Debate Mode (The "Truth Seeker")
Single agents are biased. They want to please you.
**Debate Mode forces conflict.**
- **Advocate**: Proposes a solution and defends it.
- **Critic**: Ruthlessly finds edge cases, security flaws, and scalability issues.
- **Moderator**: Watches silently, then delivers the final verdict based on *logic*, not politeness.

### 2. Collaborative Mode (The "Builder")
Perfect for multi-faceted problems.
- Need a database schema? The **DBA** agent handles it.
- Need an API? The **Backend** agent specs it out.
- Need it secure? The **Security** agent audits everything in real-time.

### 3. Context Budgeting
Context windows are expensive.
This plugin implements **Smart Context Budgeting**:
- Auto-compresses discussion history when it gets too long.
- extracting key insights before discarding raw text.
- Ensures your bill doesn't explode while keeping the "memory" of the meeting alive.

## Quick Start

**1. Check your status:**
```javascript
group_discuss_context()
```

**2. Start a simple debate:**
```javascript
group_discuss({
  "topic": "PostgreSQL vs MySQL for a high-write logging system",
  "preset": "tech-review"
})
```

**3. Run a custom board meeting:**
```javascript
group_discuss({
  "topic": "Design a high-availability payment gateway",
  "mode": "collaborative",
  "participants": [
    { "name": "Architect", "subagent_type": "critic", "role": "Reliability & Uptime" },
    { "name": "Security", "subagent_type": "critic", "role": "PCI Compliance" },
    { "name": "Product", "subagent_type": "general", "role": "User Experience" }
  ],
  "rounds": 4
})
```

## Configuration

Highly opinionated, but adjustable.
See `docs/CONFIG.md` for the nitty-gritty.

**Config Locations:**
- Project: `.opencode/group-discuss.json`
- Global: `~/.config/opencode/group-discuss.json`

**Key Knobs:**
- `consensus.threshold`: How much agreement is needed to stop early? (0.0 - 1.0)
- `termination.enable_stalemate_detection`: If they argue in circles, kill the meeting.
- `context_budget.profile`: `small` (cheap), `balanced` (standard), or `large` (deep work).

---

## Troubleshooting

**"Unauthorized" / 401?**
OpenCode Desktop authentication issue. Restart your OpenCode client.

**Tool not found?**
Did you add it to `opencode.json`? Did you restart?

---

## Contributing

We welcome PRs.
If you think you can build a better Moderator, come prove it.

## License

MIT
