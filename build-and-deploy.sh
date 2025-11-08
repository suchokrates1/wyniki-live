#!/bin/bash
# Build and Deploy Script for Wyniki Live v2

set -e

echo "🎾 Building Wyniki Live v2..."

# Colors
GREEN='\033[0.32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Build Frontend
echo -e "${BLUE}📦 Step 1: Building Frontend...${NC}"
cd frontend

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

echo "Building frontend assets..."
npm run build

cd ..

# Step 2: Verify Build Output
if [ ! -d "static_v2" ]; then
    echo -e "${RED}❌ Error: static_v2 directory not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Frontend built successfully${NC}"

# Step 3: Build Docker Image
echo -e "${BLUE}🐳 Step 2: Building Docker Image...${NC}"
docker-compose -f docker-compose.test.yml build

echo -e "${GREEN}✅ Docker image built${NC}"

# Step 4: Stop Old Container (if running)
echo -e "${BLUE}🛑 Step 3: Stopping old container...${NC}"
docker-compose -f docker-compose.test.yml down || true

# Step 5: Start New Container
echo -e "${BLUE}🚀 Step 4: Starting new container...${NC}"
docker-compose -f docker-compose.test.yml up -d

# Step 6: Wait for Health Check
echo -e "${BLUE}⏳ Step 5: Waiting for health check...${NC}"
sleep 5

for i in {1..30}; do
    if curl -f http://localhost:8088/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Application is healthy!${NC}"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Step 7: Show Container Status
echo -e "${BLUE}📊 Container Status:${NC}"
docker-compose -f docker-compose.test.yml ps

# Step 8: Show Logs (last 20 lines)
echo -e "${BLUE}📋 Recent Logs:${NC}"
docker-compose -f docker-compose.test.yml logs --tail=20

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo -e "Access the application at:"
echo -e "  ${BLUE}http://localhost:8088${NC}"
echo -e "  ${BLUE}http://test.score.vestmedia.pl:8088${NC} (if DNS configured)"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:    ${BLUE}docker-compose -f docker-compose.test.yml logs -f${NC}"
echo -e "  Stop:         ${BLUE}docker-compose -f docker-compose.test.yml down${NC}"
echo -e "  Restart:      ${BLUE}docker-compose -f docker-compose.test.yml restart${NC}"
