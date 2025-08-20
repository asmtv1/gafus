.PHONY: help build build-web test test-web lint lint-web clean clean-docker clean-node clean-build \
        dev dev-web deploy deploy-prod setup-server setup-github

# Default target
help:
	@echo "🚀 Gafus Project Management"
	@echo "=========================="
	@echo ""
	@echo "📦 Build Commands:"
	@echo "  build          - Build all applications"
	@echo "  build-web      - Build web application only"
	@echo ""
	@echo "🧪 Testing Commands:"
	@echo "  test           - Run all tests"
	@echo "  test-web       - Test web application"
	@echo ""
	@echo "🔍 Quality Commands:"
	@echo "  lint           - Run all linters"
	@echo "  lint-web       - Lint web application"
	@echo ""
	@echo "🧹 Cleanup Commands:"
	@echo "  clean          - Clean all build artifacts"
	@echo "  clean-docker   - Clean Docker containers and images"
	@echo "  clean-node     - Clean node_modules"
	@echo "  clean-build    - Clean build directories"
	@echo ""
	@echo "🚀 Deployment Commands:"
	@echo "  deploy         - Deploy to development environment"
	@echo "  deploy-prod    - Deploy to production environment"
	@echo "  setup-server   - Show server setup instructions"
	@echo "  setup-github   - Show GitHub secrets setup instructions"
	@echo ""

# Build commands
build:
	@echo "🏗️ Building all applications..."
	pnpm install
	pnpm build

build-web:
	@echo "🌐 Building web application..."
	cd apps/web && pnpm build

# Testing commands
test:
	@echo "🧪 Running all tests..."
	pnpm test

test-web:
	@echo "🧪 Testing web application..."
	cd apps/web && pnpm test

# Quality commands
lint:
	@echo "🔍 Running all linters..."
	pnpm lint

lint-web:
	@echo "🔍 Linting web application..."
	cd apps/web && pnpm lint

# Cleanup commands
clean:
	@echo "🧹 Cleaning all build artifacts..."
	$(MAKE) clean-docker clean-node clean-build

clean-docker:
	@echo "🐳 Cleaning Docker containers and images..."
	docker-compose down -v --remove-orphans
	docker system prune -f

clean-node:
	@echo "📦 Cleaning node_modules..."
	find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

clean-build:
	@echo "🏗️ Cleaning build directories..."
	find . -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "build" -type d -exec rm -rf {} + 2>/dev/null || true

# Development commands
dev:
	@echo "🚀 Starting all services in development mode..."
	docker-compose up -d

dev-web:
	@echo "🌐 Starting web app in development mode..."
	cd apps/web && pnpm dev

# Deployment commands
deploy:
	@echo "🚀 Deploying to development environment..."
	docker-compose up -d --build

deploy-prod:
	@echo "🚀 Deploying to production environment..."
	docker-compose -f docker-compose.prod.yml up -d

# Setup commands
setup-server:
	@echo "🖥️ Server Setup Instructions:"
	@echo "1. SSH to your server: ssh root@185.239.51.125"
	@echo "2. Clone repository: git clone https://github.com/asmtv1/gafus.git /root/gafus"
	@echo "3. Run setup script: cd /root/gafus && chmod +x scripts/setup-server.sh && ./scripts/setup-server.sh"
	@echo "4. Configure DNS: point gafus.ru to 185.239.51.125"
	@echo "5. Get SSL certificates: certbot --nginx -d gafus.ru -d www.gafus.ru"

setup-github:
	@echo "🔐 GitHub Secrets Setup Instructions:"
	@echo "1. Go to your GitHub repository"
	@echo "2. Click Settings → Secrets and variables → Actions"
	@echo "3. Add these secrets:"
	@echo "   - SERVER_HOST: 185.239.51.125"
	@echo "   - SERVER_USERNAME: root"
	@echo "   - SERVER_PASSWORD: YOUR_SERVER_PASSWORD"
	@echo "   - SERVER_PORT: 22"
	@echo "4. Run: ./scripts/setup-github-secrets.sh for detailed instructions"

# Docker commands
docker-build:
	@echo "🐳 Building all Docker images..."
	docker-compose build

docker-build-web:
	@echo "🐳 Building web Docker image..."
	docker-compose build web

# Utility commands
logs:
	@echo "📋 Showing logs for all services..."
	docker-compose logs -f

logs-web:
	@echo "📋 Showing logs for web service..."
	docker-compose logs -f web

status:
	@echo "📊 Showing service status..."
	docker-compose ps

restart:
	@echo "🔄 Restarting all services..."
	docker-compose restart

restart-web:
	@echo "🔄 Restarting web service..."
	docker-compose restart web
