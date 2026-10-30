# Status files

One file per person, so pushes never conflict: `karthik.md`, `rithvik.md`, `pranav.md`, `akshit.md`, `aryan.md`.

`/ship` appends an entry to your own file before every push. `/start` and `CLAUDE.md` make every Claude Code session read all of them before writing code. This is how the three Claude Code setups learn about each other's changes.

Entry format:

```
## <YYYY-MM-DD HH:MM> — <task-id> — <one-line summary>
- Changed: <files/areas>
- Seams/contracts affected: <none | what changed and who must update>
- Teammates should know: <anything that affects their work>
- Next: <next step>
```

Only write in your own file.
