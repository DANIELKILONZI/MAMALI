#!/usr/bin/env bash
# =============================================================================
# MAMALI Deployment Script
# Run from the project root:  ./deploy/deploy.sh
# Or from deploy/:            ./deploy.sh
# =============================================================================

set -euo pipefail

# ── Resolve project root ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

echo ""
echo -e "${BLUE}███╗   ███╗ █████╗ ███╗   ███╗ █████╗ ██╗     ██╗${NC}"
echo -e "${BLUE}████╗ ████║██╔══██╗████╗ ████║██╔══██╗██║     ██║${NC}"
echo -e "${BLUE}██╔████╔██║███████║██╔████╔██║███████║██║     ██║${NC}"
echo -e "${BLUE}██║╚██╔╝██║██╔══██║██║╚██╔╝██║██╔══██║██║     ██║${NC}"
echo -e "${BLUE}██║ ╚═╝ ██║██║  ██║██║ ╚═╝ ██║██║  ██║███████╗██║${NC}"
echo -e "${BLUE}╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝${NC}"
echo -e "           ${YELLOW}Production Deployment Script${NC}"
echo ""

# ── Parse flags ──────────────────────────────────────────────────────────────
ENV="production"
SKIP_SEED=false
RESTART_ONLY=false

for arg in "$@"; do
  case $arg in
    --dev)           ENV="development" ;;
    --skip-seed)     SKIP_SEED=true ;;
    --restart-only)  RESTART_ONLY=true ;;
    --help)
      echo "Usage: $0 [--dev] [--skip-seed] [--restart-only]"
      echo "  --dev           Deploy in development mode"
      echo "  --skip-seed     Skip database seeding"
      echo "  --restart-only  Skip build, just restart PM2 processes"
      exit 0
      ;;
  esac
done

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v node  >/dev/null 2>&1 || error "Node.js is not installed. Install from https://nodejs.org"
command -v npm   >/dev/null 2>&1 || error "npm is not installed."

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1))")
MAJOR="${NODE_VER%%.*}"
[[ "$MAJOR" -ge 18 ]] || error "Node.js 18+ required (found $NODE_VER)."

if ! command -v pm2 >/dev/null 2>&1; then
  warn "PM2 not found — installing globally (requires sudo)..."
  sudo npm install -g pm2
fi

success "Node $(node --version) | npm $(npm --version) | pm2 $(pm2 --version)"

# ── Environment file ──────────────────────────────────────────────────────────
if [[ ! -f backend/.env ]]; then
  warn "backend/.env not found — copying from .env.example."
  cp backend/.env.example backend/.env
  echo ""
  echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ACTION REQUIRED: Edit backend/.env before continuing        ║${NC}"
  echo -e "${YELLOW}║                                                              ║${NC}"
  echo -e "${YELLOW}║  Required:                                                   ║${NC}"
  echo -e "${YELLOW}║    JWT_SECRET=<random 64-char string>                        ║${NC}"
  echo -e "${YELLOW}║    REFRESH_TOKEN_SECRET=<different random 64-char string>    ║${NC}"
  echo -e "${YELLOW}║                                                              ║${NC}"
  echo -e "${YELLOW}║  For production with real M-Pesa, also set:                  ║${NC}"
  echo -e "${YELLOW}║    MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,                ║${NC}"
  echo -e "${YELLOW}║    MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL        ║${NC}"
  echo -e "${YELLOW}║    MPESA_ENVIRONMENT=production                              ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Press Enter after editing backend/.env to continue, or Ctrl+C to abort..."
fi

# Validate that secrets have been changed from defaults
JWT_SECRET=$(grep '^JWT_SECRET=' backend/.env | cut -d= -f2- | tr -d '"')
REFRESH_SECRET=$(grep '^REFRESH_TOKEN_SECRET=' backend/.env | cut -d= -f2- | tr -d '"')

if [[ "$ENV" == "production" ]]; then
  [[ "$JWT_SECRET" == "your-secret-key-change-in-production" ]] && \
    error "JWT_SECRET is still the default placeholder. Set a real secret in backend/.env"
  [[ "$REFRESH_SECRET" == "your-refresh-secret-change-in-production" ]] && \
    error "REFRESH_TOKEN_SECRET is still the default placeholder. Set a real secret in backend/.env"
fi

success "Environment file OK."

# ── Skip to restart if requested ──────────────────────────────────────────────
if [[ "$RESTART_ONLY" == true ]]; then
  info "Restart-only mode — restarting PM2 processes..."
  pm2 restart deploy/ecosystem.config.js --env "$ENV"
  pm2 save
  success "Processes restarted."
  exit 0
fi

# ── Install dependencies ───────────────────────────────────────────────────────
info "Installing backend dependencies..."
(cd backend && npm install)
success "Backend dependencies installed."

info "Installing frontend dependencies..."
(cd frontend && npm install)
success "Frontend dependencies installed."

info "Installing admin dependencies..."
(cd admin && npm install)
success "Admin dependencies installed."

# ── Build backend ─────────────────────────────────────────────────────────────
info "Building backend (TypeScript → dist/)..."
(cd backend && npm run build)
success "Backend built."

# ── Database ──────────────────────────────────────────────────────────────────
info "Running Prisma migrations..."
(cd backend && npx prisma migrate deploy)
success "Database migrations applied."

info "Generating Prisma client..."
(cd backend && npx prisma generate)
success "Prisma client generated."

if [[ "$SKIP_SEED" == false ]]; then
  info "Seeding database (default admin user + sample data)..."
  (cd backend && npx ts-node prisma/seed.ts) || \
    warn "Seeding skipped or failed — this is OK if DB was already seeded."
fi

# ── Build frontend & admin ────────────────────────────────────────────────────
info "Building customer storefront (Next.js)..."
(cd frontend && npm run build)
success "Frontend built."

info "Building admin dashboard (Next.js)..."
(cd admin && npm run build)
success "Admin built."

# ── Log directories ───────────────────────────────────────────────────────────
mkdir -p backend/logs frontend/logs admin/logs
success "Log directories ready."

# ── Start PM2 ────────────────────────────────────────────────────────────────
info "Starting services with PM2 (env: $ENV)..."
pm2 start deploy/ecosystem.config.js --env "$ENV"
pm2 save
success "PM2 processes started."

# ── PM2 startup hook ─────────────────────────────────────────────────────────
if [[ "$ENV" == "production" ]]; then
  info "Configuring PM2 to start on system boot..."
  if sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"; then
    success "PM2 startup configured."
  else
    warn "Could not auto-configure startup. Run 'sudo env PATH=\"$PATH\" pm2 startup systemd -u \"$USER\" --hp \"$HOME\"' manually."
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  MAMALI deployment complete!                                 ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Services:                                                   ║${NC}"
echo -e "${GREEN}║    Customer storefront  →  http://localhost:3000             ║${NC}"
echo -e "${GREEN}║    Admin dashboard      →  http://localhost:3001             ║${NC}"
echo -e "${GREEN}║    Backend API          →  http://localhost:5000             ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
echo -e "${GREEN}║  Useful commands:                                            ║${NC}"
echo -e "${GREEN}║    pm2 status           — check running processes            ║${NC}"
echo -e "${GREEN}║    pm2 logs             — tail all logs                      ║${NC}"
echo -e "${GREEN}║    pm2 logs mamali-backend — tail backend logs only          ║${NC}"
echo -e "${GREEN}║    pm2 restart all      — restart everything                 ║${NC}"
echo -e "${GREEN}║                                                              ║${NC}"
if [[ "$ENV" == "production" ]]; then
echo -e "${GREEN}║  Next steps:                                                 ║${NC}"
echo -e "${GREEN}║    1. Point your domain DNS to this server's IP              ║${NC}"
echo -e "${GREEN}║    2. Install the Nginx config:                              ║${NC}"
echo -e "${GREEN}║       sudo cp deploy/nginx.conf /etc/nginx/sites-available/mamali${NC}"
echo -e "${GREEN}║       sudo ln -s /etc/nginx/sites-available/mamali /etc/nginx/sites-enabled/mamali${NC}"
echo -e "${GREEN}║       sudo nginx -t && sudo systemctl reload nginx           ║${NC}"
echo -e "${GREEN}║    3. Get SSL certificates:                                  ║${NC}"
echo -e "${GREEN}║       sudo ./deploy/setup-https.sh yourdomain.com you@email.com${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
fi
echo ""

pm2 list
