---
name: browser-use
description: "Opt-in browser automation via buc. Check status before use."
version: 1.0.0
tags: [browser, automation, web, opt-in]
---

# Browser Use (Opt-In)

Control a real Chrome browser from the terminal. Requires explicit user opt-in.

## Before Using Browser

**Always check status first:**

```bash
buc status
```

## Status Response

- `Browser: disabled` → browser off, must ask user to enable
- `Browser: enabled, Mode: headed` → use headed mode (visible browser)
- `Browser: enabled, Mode: headless` → use headless mode (no window)
- `Browser: enabled, Mode: both` → agent can choose per task

## If Disabled

Tell the user:

```
Browser is off. Run: sudo buc on [headed|headless|both]

- headed: visible browser (watch me work)
- headless: no window (faster, silent)
- both: I'll choose based on the task
```

Do NOT attempt to enable browser yourself. Toggle requires sudo.

## If Enabled

Use browser commands:

```bash
buc start              # Launch Chrome (respects configured mode)
buc nav <url>          # Navigate to URL
buc state              # Show numbered clickable elements
buc clicki <n>         # Click element by number
buc clkt <text>        # Click element by visible text
buc click <selector>   # Click by CSS selector
buc type <sel> <text>  # Type into input
buc send <message>     # Type + smart submit (Enter)
buc ss [path]          # Screenshot (optional path)
buc snap               # Accessibility tree
buc eval <js>          # Run JavaScript
buc scroll [direction] # Scroll (up/down/top/bottom)
buc text [selector]    # Get text content
buc back               # Go back
buc wait <what>        # Wait (selector/load/ms)
buc stop               # Close browser
```

## Workflow

1. Check `buc status`
2. If disabled → tell user to enable
3. If enabled → `buc start` (launches Chrome)
4. `buc nav <url>` (go to page)
5. `buc state` (see clickable elements)
6. `buc clicki <n>` (interact)
7. `buc ss` or `buc snap` (read results)
8. Repeat 4-7 as needed
9. `buc stop` when done (optional)

## Mode Selection

If mode is `both`, choose based on task:

- **headed** — complex UIs, login flows, when user wants to watch
- **headless** — simple scraping, API calls, background automation
- **default to headless** unless headed is needed

## Guiding Users

If user is new to buc:

1. Explain: "buc lets me control a browser for you"
2. Show enable command: `sudo buc on headed` (recommended for first time)
3. Demo: `buc state` → `buc clicki <n>`
4. Mention: headed mode lets them watch, headless is faster

If user asks "what is this?":
- "Browser automation tool. I can browse websites, fill forms, click buttons. Run `sudo buc on headed` to enable."

## Safety

- Agent cannot enable/disable browser (requires sudo)
- Agent cannot access user's Chrome profile unless explicitly configured
- Browser uses temp profile by default
- Warn user if they enable profile access with logged-in accounts

## HTTP Commands

No browser needed for API calls:

```bash
buc get <url>                    # GET request
buc post <url> '<json>'          # POST JSON
buc put <url> '<json>'           # PUT JSON
buc delete <url>                 # DELETE
buc dl <url> [path]              # Download file
```

## Troubleshooting

- "Cannot connect" → run `buc start` first
- "Browser: disabled" → user needs `sudo buc on`
- Elements not found → wait for page load: `buc wait load`
- Wrong element clicked → use `buc snap` to see full page structure
