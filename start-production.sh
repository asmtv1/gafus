#!/bin/bash

echo "Starting Gafus production services..."

# Set environment variables
export POSTGRES_DB=gafus
export POSTGRES_USER=gafus
export POSTGRES_PASSWORD=gafus_password
export REDIS_URL=redis://localhost:6379
export NODE_ENV=production
export DATABASE_URL=postgresql://gafus:gafus_password@localhost:5432/gafus
export BOT_TOKEN=7882612913:AAGGrYg0NYG_cq9pAQ8ocaSdLqmQB-mI-as

# Create uploads directories if they don't exist
echo "📁 Creating uploads directories..."
mkdir -p uploads/avatars uploads/pets uploads/courses uploads/shared
chmod -R 755 uploads/

# Create public uploads directories for web app
echo "📁 Creating public uploads directories for web app..."
mkdir -p apps/web/public/uploads/avatars
mkdir -p apps/web/public/uploads/pets
mkdir -p apps/web/public/uploads/courses
mkdir -p apps/web/public/uploads/shared

# Create public uploads directories for trainer panel
echo "📁 Creating public uploads directories for trainer panel..."
mkdir -p apps/trainer-panel/public/uploads/shared

# Set proper permissions
chmod -R 755 apps/web/public/uploads/
chmod -R 755 apps/trainer-panel/public/uploads/

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Run Prisma migrations
echo "🗄️ Running Prisma migrations..."
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U gafus -d gafus -c "SELECT 1;" > /dev/null 2>&1 || sleep 5

# Run migrations using the dedicated Prisma container
docker-compose -f docker-compose.prod.yml exec -T prisma pnpm run prisma:migrate:deploy || echo "Migrations failed, continuing..."

echo "All services started!"
echo ""
echo "Services:"
echo "- Web: http://localhost:3000"
echo "- Trainer Panel: http://localhost:3001"
echo "- Error Dashboard: http://localhost:3005"
echo "- Bull Board: http://localhost:3002"
echo "- Telegram Bot: running in background"
echo "- Nginx: http://localhost:80"
echo ""
echo "To view logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "To stop: docker-compose -f docker-compose.prod.yml down"
