# buc — Browser Use Chromium

Agent-agnostic browser automation via Chrome DevTools Protocol.

## What It Does

Control a real Chrome browser from the terminal. Works with any AI agent (Hermes, Pi, MiMoCode, Claude, etc.) or standalone.

**Key features:**
- Headed mode (visible browser) and headless mode (no window)
- Toggle requires sudo — agent cannot enable/disable itself
- Zero dependencies beyond Node.js and Chrome
- Cross-platform (Linux, macOS, Windows)

## Dependencies

- Node.js 18+
- Chrome, Chromium, Edge, or Brave (CDP-compatible browser)
- Bash (Linux/macOS) or WSL (Windows)

### Windows

Windows requires WSL (Windows Subsystem for Linux). Install WSL, then use buc from within WSL. 
(buc-windows coming soon if any demand.)

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
sudo cp buc /usr/local/bin/buc
```

## Usage

```bash
# Toggle (requires sudo)
buc status                  # Show state
sudo buc on headed          # Enable with visible browser
sudo buc on headless        # Enable headless (no window)
sudo buc off                # Disable

# Browser commands
buc start                   # Launch Chrome
buc nav https://example.com # Navigate
buc state                   # Show clickable elements
buc clicki 3                # Click element #3
buc ss /tmp/page.png        # Screenshot
buc stop                    # Close browser
```

## How It Works

1. `buc start` launches Chrome with remote debugging enabled
2. `buc` connects via Chrome DevTools Protocol (CDP)
3. Commands interact with the live browser
4. `buc state` returns numbered elements — use `buc clicki` to interact

## Security

- Toggle requires sudo — agent cannot enable browser without admin
- Agent can read status but cannot change it
- Browser uses temp profile by default — no access to your Chrome accounts

## Documentation

- `SKILL.md` — agent instructions
- `USER_GUIDE.md` — beginner-friendly user guide

## License

MIT
