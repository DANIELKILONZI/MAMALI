#!/usr/bin/env bash
# =============================================================================
# MAMALI Production Setup Script
# Run once on a fresh Ubuntu 22.04+ server to set up HTTPS with Let's Encrypt
# Usage: ./deploy/setup-https.sh yourdomain.com your@email.com
# =============================================================================

set -euo pipefail

DOMAIN="${1:-mamali.example.com}"
EMAIL="${2:-admin@example.com}"

echo "=== MAMALI HTTPS Setup ==="
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo ""

# Install Certbot
if ! command -v certbot &>/dev/null; then
  echo "Installing Certbot..."
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
fi

# Obtain certificate
certbot --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "api.$DOMAIN" \
  -d "admin.$DOMAIN"

# Set up auto-renewal cron
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
  echo "Auto-renewal cron job added."
fi

echo ""
echo "HTTPS setup complete! Your certificates are at:"
echo "  /etc/letsencrypt/live/$DOMAIN/"
