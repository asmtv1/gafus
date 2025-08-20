#!/bin/bash

# Server setup script for Gafus project
set -e

echo "🚀 Setting up Gafus server..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "🔧 Installing required packages..."
apt install -y \
    curl \
    wget \
    git \
    docker.io \
    docker-compose \
    nginx \
    htop \
    unzip

# Start and enable Docker
echo "🐳 Starting Docker service..."
systemctl start docker
systemctl enable docker

# Add current user to docker group
usermod -aG docker $USER

# Create project directory
echo "📁 Creating project directory..."
mkdir -p /root/gafus
cd /root/gafus

# Clone repository
echo "📥 Cloning repository..."
git clone https://github.com/asmtv1/gafus.git .

# Create uploads directories
echo "📁 Creating uploads directories..."
mkdir -p uploads/avatars uploads/pets uploads/courses
chmod -R 755 uploads/

# Create nginx directories
echo "🌐 Setting up Nginx..."
mkdir -p nginx/ssl nginx/conf.d

# Setup firewall
echo "🔥 Setting up firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Setup Nginx
echo "🌐 Setting up Nginx..."
systemctl start nginx
systemctl enable nginx

echo "✅ Server setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Configure DNS: point gafus.ru to 185.239.51.125"
echo "2. Get SSL certificate: certbot --nginx -d gafus.ru -d www.gafus.ru"
echo "3. Start services: docker-compose -f docker-compose.prod.yml up -d"
