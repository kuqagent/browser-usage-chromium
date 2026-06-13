# buc User Guide

A beginner-friendly guide to browser automation with buc.

## What Is buc?

buc is a tool that lets you control a web browser from the terminal. It's designed to work with AI agents, but you can use it manually too.

**What you can do:**
- Open websites
- Click buttons and links
- Fill out forms
- Take screenshots
- Extract text from pages
- Automate repetitive web tasks

## Prerequisites

Before using buc, you need:

1. **Node.js** (version 18 or newer)
   - Check: `node --version`
   - Install: https://nodejs.org

2. **A Chromium-based browser**
   - Google Chrome
   - Chromium
   - Microsoft Edge
   - Brave

3. **Windows users:** WSL (Windows Subsystem for Linux) is required. Install from PowerShell: `wsl --install`

## Installation

```bash
# 1. Download buc
git clone https://github.com/yourname/buc.git
cd buc

# 2. Run installer
chmod +x install.sh
./install.sh

# 3. Verify installation
buc --help
```

## First Use

### Step 1: Enable Browser

buc is disabled by default. To enable it:

```bash
sudo buc on headed
```

This opens a visible browser window so you can see what's happening.

**Other options:**
- `sudo buc on headless` — no window (faster, for automation)
- `sudo buc on both` — agent can choose

### Step 2: Check Status

```bash
buc status
```

You should see:
```
Browser: enabled
Mode: headed
```

### Step 3: Start Browsing

```bash
# Launch Chrome
buc start

# Go to a website
buc nav https://example.com

# See what's on the page
buc state
```

The `state` command shows numbered elements you can click:
```
[
  {"index":1, "role":"link", "name":"Home"},
  {"index":2, "role":"button", "name":"Sign In"},
  {"index":3, "role":"textbox", "name":"Search"},
  ...
]
```

### Step 4: Interact

```bash
# Click element #2 (Sign In button)
buc clicki 2

# Type into a text field
buc type "input[name=q]" "search term"

# Or use smart submit
buc send "search term"

# Take a screenshot
buc ss /tmp/page.png
```

### Step 5: Clean Up

```bash
# Close the browser
buc stop

# Or disable buc entirely
sudo buc off
```

## Common Tasks

### Fill Out a Form

```bash
buc nav https://example.com/form
buc type "#name" "John Doe"
buc type "#email" "john@example.com"
buc clicki 5  # Submit button (check state first)
```

### Scrape a Page

```bash
buc nav https://example.com
buc text  # Get all text on page
```

### Take Screenshots

```bash
buc nav https://example.com
buc ss /tmp/screenshot.png
```

### Automate Login

```bash
buc nav https://example.com/login
buc type "#username" "myuser"
buc type "#password" "mypass"
buc clicki 4  # Login button
buc wait load  # Wait for redirect
```

## Headed vs Headless

| Mode | Window | Speed | Use Case |
|------|--------|-------|----------|
| headed | Visible | Slower | Watching, debugging, first time |
| headless | Hidden | Faster | Automation, servers, repeat tasks |

**Recommendation:** Start with headed mode to see what's happening. Switch to headless once you're comfortable.

## Safety Notes

### Browser Isolation

buc uses a temporary Chrome profile by default. It does NOT access your:
- Logged-in websites
- Saved passwords
- Browser history
- Cookies from your main Chrome

### Account Access

If you need buc to use your logged-in Chrome profile:

```bash
# Launch Chrome with your profile (advanced)
google-chrome --remote-debugging-port=9222 --user-data-dir=~/.config/google-chrome
```

**Warning:** This gives full access to your logged-in accounts. Only do this if you:
- Trust the agent using buc
- Understand the security implications
- Are running in a secure environment

### The sudo Requirement

The `sudo` requirement for `buc on/off` is intentional:
- Prevents AI agents from enabling browser without your permission
- You control when browser access is available
- Agent can only use browser when you've explicitly enabled it

## Troubleshooting

### "buc: command not found"

buc isn't in your PATH. Try:
```bash
/usr/local/bin/buc --help
```

Or add to PATH:
```bash
export PATH="/usr/local/bin:$PATH"
```

### "Cannot connect"

Chrome isn't running or buc can't reach it:
```bash
buc start  # Launch Chrome
buc status # Check connection
```

### "Browser: disabled"

You need to enable buc:
```bash
sudo buc on headed
```

### Elements Not Found

Page might not be fully loaded:
```bash
buc wait load  # Wait for page load
buc state      # Try again
```

### Wrong Element Clicked

Use the full accessibility tree:
```bash
buc snap  # Shows complete page structure
```

## Getting Help

```bash
buc --help     # Show all commands
buc status     # Check current state
```

For agent integration, see `SKILL.md`.
