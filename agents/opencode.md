---
name: opencode
description: Low-cost coding agent using GLM-5.1 for simple tasks (rename, format, docs, config)
model: glm-5.1
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# OpenCode Agent

Low-cost coding agent powered by GLM-5.1.

## When to use
- File renaming and reformatting
- Documentation updates
- Configuration changes
- Simple bug fixes (1-3 files)
- Code style adjustments

## Execution
```bash
opencode -p "<task instruction>" --model glm-5.1
```

## Limitations
- Not suitable for complex architecture decisions
- May struggle with multi-file coordination
- Best for isolated, well-defined changes
