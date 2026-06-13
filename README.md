# buc — Browser Use CLI

Agent-agnostic browser automation via Chrome DevTools Protocol.

## What It Does

Control a real Chrome browser from the terminal. Works with any AI agent (Hermes, Pi, MiMoCode, Claude, etc.) or standalone.

**Key features:**
- Headed mode (visible browser) and headless mode (no window)
- Toggle requires sudo — agent cannot enable/disable itself
- Zero dependencies beyond Node.js and Chrome
- Cross-platform (Linux, macOS, Windows via WSL)

## Dependencies

- Node.js 18+ (22+ recommended for built-in WebSocket)
- Chrome, Chromium, Edge, or Brave (CDP-compatible browser)
- Bash (Linux/macOS) or WSL (Windows)

**Note:** Node 18-21 may require `npm install -g ws` for WebSocket support. Node 22+ has built-in WebSocket.

### Windows

Windows requires WSL (Windows Subsystem for Linux). Install WSL, then use buc from within WSL.

```bash
# In WSL
sudo apt install nodejs npm
./buc status
```

## Quick Start

```bash
# Run directly from repo
chmod +x buc
./buc status

# Or install system-wide (optional)
sudo cp buc /usr/local/bin/
sudo cp -r scripts /usr/local/lib/buc/
# Then edit /usr/local/bin/buc line 17 to: CDP="/usr/local/lib/buc/scripts/cdp.mjs"
```

## Usage

```bash
# Toggle (requires sudo)
buc status                  # Show state
sudo buc on headed          # Enable with visible browser
sudo buc on headless        # Enable headless (no window)
sudo buc off                # Disable

# Browser commands (require enabled)
buc start                   # Launch Chrome
buc nav https://example.com # Navigate
buc state                   # Show clickable elements
buc clicki 3                # Click element #3
buc ss /tmp/page.png        # Screenshot
buc stop                    # Close browser

# HTTP (no browser needed)
buc get https://api.example.com/data
```

## How It Works

1. `buc start` launches Chrome with remote debugging enabled
2. `buc` connects via Chrome DevTools Protocol (CDP)
3. Commands interact with the live browser
4. `buc state` returns numbered elements — use `buc clicki` to interact

## Security

- **Toggle requires sudo** — agent cannot enable browser without admin privileges
- **Agent can read status** but cannot change it
- **Browser commands check enabled** — returns error if disabled
- **Browser uses temp profile** — no access to your Chrome accounts

### Account Safety

buc uses a temporary Chrome profile. It does NOT access your logged-in Chrome accounts by default.

If you need to use an existing Chrome profile with logged-in accounts:

```bash
# Launch Chrome with your real profile (risky)
google-chrome --remote-debugging-port=9222 --user-data-dir=~/.config/google-chrome
```

**Warning:** This gives the agent access to your logged-in sessions. Only do this if you trust the agent and understand the risks.

## Modes

| Mode | Use Case |
|------|----------|
| `headed` | Watch the agent work, debugging, complex UIs |
| `headless` | Fast automation, servers, no display needed |
| `both` | Agent chooses per task |

## Agent Integration

buc works with any AI agent. See `SKILL.md` for agent instructions.

## Project Structure

```
buc/
├── buc              # Main script (288 LOC)
├── scripts/cdp.mjs  # CDP client (658 LOC)
├── config/default.json
├── SKILL.md         # Agent instructions
├── USER_GUIDE.md    # User guide
├── README.md        # This file
└── LICENSE          # MIT
```

## License

MIT
