#!/bin/bash

# Setup script for Gafus production server
# Run this on your server to prepare it for deployment

set -e

echo "🚀 Setting up Gafus production server..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "✅ Docker already installed"
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "🐙 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo "✅ Docker Compose already installed"
fi

# Install Git
if ! command -v git &> /dev/null; then
    echo "📚 Installing Git..."
    sudo apt install -y git
else
    echo "✅ Git already installed"
fi

# Create project directory
PROJECT_DIR="/root/gafus"
if [ ! -d "$PROJECT_DIR" ]; then
    echo "📁 Creating project directory..."
    mkdir -p $PROJECT_DIR
    cd $PROJECT_DIR
    
    # Clone repository (you'll need to set up SSH keys or use HTTPS)
    echo "🔗 Cloning repository..."
    git clone https://github.com/asmtv1/gafus.git .
else
    echo "✅ Project directory already exists"
    cd $PROJECT_DIR
    git pull origin main
fi

# Create uploads directories with proper structure
echo "📁 Creating uploads directories..."
mkdir -p packages/public-assets/public/uploads/avatars
mkdir -p packages/public-assets/public/uploads/pets
mkdir -p packages/public-assets/public/uploads/courses
mkdir -p packages/public-assets/public/uploads/shared
chmod -R 755 packages/public-assets/public/uploads/

# Create .env file for environment variables
if [ ! -f ".env" ]; then
    echo "⚙️ Creating .env file..."
    cat > .env << EOF
# Database
POSTGRES_DB=gafus
POSTGRES_USER=gafus
POSTGRES_PASSWORD=gafus_password

# Redis
REDIS_URL=redis://localhost:6379

# Node Environment
NODE_ENV=production

# Ports
WEB_PORT=3000
TRAINER_PANEL_PORT=3001
ERROR_DASHBOARD_PORT=3005
BULL_BOARD_PORT=3002

# Database URL for applications
DATABASE_URL=postgresql://gafus:gafus_password@postgres:5432/gafus

# Telegram Bot
BOT_TOKEN=7882612913:AAGGrYg0NYG_cq9pAQ8ocaSdLqmQB-mI-as
EOF
    echo "✅ BOT_TOKEN already configured"
fi

# Create systemd service for auto-start
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/gafus.service > /dev/null << EOF
[Unit]
Description=Gafus Production Services
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable gafus.service

echo "✅ Server setup completed!"
echo ""
echo "Next steps:"
echo "1. Edit .env file and set your BOT_TOKEN"
echo "2. Push to main branch to trigger automatic deployment"
echo "3. Or run manual deployment from GitHub Actions"
echo ""
echo "To start services manually:"
echo "  cd $PROJECT_DIR"
echo "  docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "To stop services:"
echo "  docker-compose -f docker-compose.prod.yml down"
