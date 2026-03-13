#!/usr/bin/env bash
# setup.sh — One-shot project setup for AIG monorepo
# Usage: bash scripts/setup.sh (from repo root)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> AIG Project Setup"
echo ""

# 1. Copy .env.local if not present
if [ ! -f "$ROOT/frontend/.env.local" ]; then
  if [ -f "$ROOT/.env.example" ]; then
    cp "$ROOT/.env.example" "$ROOT/frontend/.env.local"
    echo "[OK] Copied .env.example -> frontend/.env.local (fill in all values)"
  else
    echo "[WARN] .env.example not found — create frontend/.env.local manually"
  fi
else
  echo "[OK] frontend/.env.local already exists — skipping copy"
fi

# 2. Install frontend dependencies
echo ""
echo "==> Installing frontend dependencies..."
cd "$ROOT/frontend" && npm install
echo "[OK] Frontend deps installed"

# 3. Install scripts dependencies
echo ""
echo "==> Installing scripts dependencies..."
cd "$ROOT/scripts" && npm install
echo "[OK] Scripts deps installed"

# 4. Check forge
echo ""
if command -v forge &>/dev/null; then
  echo "[OK] forge $(forge --version 2>/dev/null | head -1) is available"
else
  echo "[WARN] forge not found — install Foundry to build/test contracts:"
  echo "       curl -L https://foundry.paradigm.xyz | bash && foundryup"
fi

# 5. Done
echo ""
echo "======================================"
echo "  Setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Fill in all values in frontend/.env.local"
echo "  2. Run CCTP smoke test:  cd scripts && npm run test:cctp"
echo "     EXIT 0 -> set BRIDGE_MODE=CCTP in .env.local"
echo "     EXIT 1 -> set BRIDGE_MODE=ADMIN_RELAY in .env.local"
echo "  3. Run Supabase migrations in your Supabase SQL editor:"
echo "     frontend/supabase/migrations/001_create_payment_sessions.sql"
echo "     frontend/supabase/migrations/002_create_points_tables.sql"
echo "  4. Start dev server:  cd frontend && npm run dev"
echo "  5. (Optional) Build contracts:  cd contracts && forge build && forge test"
