---
name: memory-flush-on-stop
enabled: true
event: stop
pattern: .*
action: warn
---

Before completing this session, ensure important context has been preserved:

1. **Decisions made** — Were any significant architectural or design decisions made? Write them to the appropriate memory file.
2. **Insights discovered** — Did you learn anything non-obvious about the codebase, tools, or problem domain? Write to `D:/greyhawk-grand-campaign/_claude-memory/insights.md`.
3. **Project status changes** — Did any project start, complete, or get blocked? Update `D:/greyhawk-grand-campaign/_claude-memory/context.md`.
4. **Open items** — Is there unfinished work that a future session needs to know about?

If nothing significant was learned or decided, it's fine to stop without writing. Not every session needs a memory write. Use judgment.
