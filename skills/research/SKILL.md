---
name: research
description: |
  Research competitors and market landscape for the target project.
  Uses /research (gstack tavily), agent-browser, and /crawl to gather
  competitive intelligence. Generates structured analysis report.
  Use when: "research competitors", "competitive analysis", "market landscape",
  "who are our competitors", or during Phase 1 strategic planning.
version: 3.0.0
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
  - WebFetch
  - WebSearch
---

> **CLI alias used below:** `ham-cli` = `HAM_PROJECT_DIR="$PWD" node "${CLAUDE_PLUGIN_ROOT:-$PWD}/dist/index.js"`

# Competitive Research

Research the competitive landscape for the current project.

## Step 1: Identify Domain

Ask the user or infer from project docs:
- What domain/market is this project in?
- Who are the main competitors?

```bash
# Initialize competitive analysis
ham-cli research init "<project-name>" "<domain>"
```

## Step 2: Research Competitors

For each competitor, use available tools:

### Using gstack /research (recommended)
```
/research <competitor-name> features pricing tech stack
```

### Using /crawl for docs
```
/crawl <competitor-url>
```

### Using agent-browser for live analysis
```
Use agent-browser to navigate competitor sites, take screenshots,
analyze UI/UX, check pricing pages.
```

## Step 3: Add Findings

```bash
# Add each competitor (the skill fills in the details from research)
ham-cli research add "<competitor-name>"
```

## Step 4: Generate Report

```bash
ham-cli research report
```

## Output

The analysis is saved to `.ham-autocode/research/competitive-analysis.json` and
can be referenced by `/ham-autocode:auto` during Phase 1 planning.

## Rules

- Always cite sources for competitor information
- Ask user to verify findings before saving
- Focus on features, pricing, tech stack, strengths, weaknesses
- Identify opportunities and differentiators
