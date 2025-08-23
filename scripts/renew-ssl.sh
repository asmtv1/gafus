#!/bin/bash

# SSL Certificate Renewal Script for Gafus
# This script should be run via cron job: 0 12 * * * /path/to/renew-ssl.sh

set -e

echo "🔄 Starting SSL certificate renewal..."

# Navigate to project directory
cd /root/gafus

# Check if certificates need renewal
if docker-compose -f docker-compose.prod.yml run --rm certbot certbot renew --dry-run; then
    echo "✅ Certificates are up to date"
else
    echo "🔄 Renewing certificates..."
    
    # Stop nginx temporarily
    docker-compose -f docker-compose.prod.yml stop nginx
    
    # Renew certificates
    docker-compose -f docker-compose.prod.yml run --rm certbot certbot renew
    
    # Start nginx with new certificates
    docker-compose -f docker-compose.prod.yml up -d nginx
    
    echo "✅ SSL certificates renewed successfully"
fi

echo "🎉 SSL renewal process completed"
