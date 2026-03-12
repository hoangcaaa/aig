# UI Testing Workflow

Browser-based visual testing using `chrome-devtools` skill. Requires skill to be installed.

## Prerequisites

```bash
SKILL_DIR="$HOME/.claude/skills/chrome-devtools/scripts"
# Install deps if first time
npm install --prefix "$SKILL_DIR" 2>/dev/null
```

## Step 1: Discovery

Browse target URL, discover pages, components, endpoints:

```bash
node "$SKILL_DIR/navigate.js" --url http://localhost:3000
node "$SKILL_DIR/aria-snapshot.js" --url http://localhost:3000
node "$SKILL_DIR/snapshot.js" --url http://localhost:3000
```

## Step 2: Visual Capture

```bash
# Full page screenshot
node "$SKILL_DIR/screenshot.js" --url http://localhost:3000 --output ./screenshots/home.png --full-page true

# Specific component
node "$SKILL_DIR/screenshot.js" --url http://localhost:3000 --selector ".main-content" --output ./screenshots/main.png
```

## Step 3: Console Error Check

```bash
# Capture JS errors for 5 seconds
node "$SKILL_DIR/console.js" --url http://localhost:3000 --types error,pageerror --duration 5000
```

Zero errors = pass. Any errors = investigate before proceeding.

## Step 4: Network Validation

```bash
# Check for failed API calls
node "$SKILL_DIR/network.js" --url http://localhost:3000 | jq '.requests[] | select(.response.status >= 400)'
```

## Step 5: Responsive Testing

Capture at key breakpoints:
```bash
# Desktop (default), Tablet, Mobile
for viewport in "1920x1080" "768x1024" "375x812"; do
  W=$(echo $viewport | cut -d'x' -f1)
  H=$(echo $viewport | cut -d'x' -f2)
  node "$SKILL_DIR/evaluate.js" --url http://localhost:3000 --script "
    Object.defineProperty(window, 'innerWidth', {value: $W, writable: true});
    Object.defineProperty(window, 'innerHeight', {value: $H, writable: true});
    window.dispatchEvent(new Event('resize'));
  "
  node "$SKILL_DIR/screenshot.js" --output "./screenshots/responsive-${W}x${H}.png"
done
```

## Step 6: Form & Interaction Testing

```bash
node "$SKILL_DIR/fill.js" --selector "#email" --value "test@example.com"
node "$SKILL_DIR/fill.js" --selector "#password" --value "Test123!"
node "$SKILL_DIR/click.js" --selector "button[type=submit]"
node "$SKILL_DIR/screenshot.js" --output ./screenshots/form-submitted.png
```

## Step 7: Performance Metrics

```bash
node "$SKILL_DIR/performance.js" --url http://localhost:3000 | jq '.vitals'
```

## Authentication for Protected Routes

For testing pages behind auth, inject credentials first:

```bash
# Option A: Inject cookies
node "$SKILL_DIR/inject-auth.js" --url https://site.com \
  --cookies '[{"name":"session","value":"abc123","domain":".site.com"}]'

# Option B: Bearer token
node "$SKILL_DIR/inject-auth.js" --url https://site.com \
  --token "Bearer eyJhbG..." --header Authorization

# Option C: localStorage
node "$SKILL_DIR/inject-auth.js" --url https://site.com \
  --local-storage '{"auth_token":"xyz"}'
```

After injection, browser session persists. Run tests normally until `--close true`.

## Screenshot Analysis

Use `ai-multimodal` skill to analyze captured screenshots for:
- Layout correctness
- Visual regressions
- Missing elements
- Broken styling
- Accessibility issues (contrast, text size)

## Parallel Execution

Spawn multiple `tester` subagents in parallel for independent pages/flows to speed up UI testing.

## Cleanup

```bash
# Close browser session when done
node "$SKILL_DIR/navigate.js" --url about:blank --close true
```
