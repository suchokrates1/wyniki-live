#!/bin/bash
# Complete V2 Deployment Script for Server

set -e

echo "🎾 Wyniki Live v2 - Complete Deployment"
echo "========================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Check Node.js
echo -e "${BLUE}Step 1: Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo -e "${GREEN}✅ Node.js installed${NC}"
else
    echo -e "${GREEN}✅ Node.js found: $(node --version)${NC}"
fi

# Step 2: Install frontend dependencies
echo -e "${BLUE}Step 2: Installing frontend dependencies...${NC}"
cd ~/count/frontend
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 3: Build frontend
echo -e "${BLUE}Step 3: Building frontend...${NC}"
npm run build
echo -e "${GREEN}✅ Frontend built successfully${NC}"

# Step 4: Copy backend files
echo -e "${BLUE}Step 4: Preparing backend...${NC}"
cd ~/count
cp -r wyniki backend/wyniki_compat/
cp app.py backend/app_compat.py
cp requirements.txt backend/
echo -e "${GREEN}✅ Backend files prepared${NC}"

# Step 5: Build Docker image
echo -e "${BLUE}Step 5: Building Docker image...${NC}"
docker compose -f docker-compose.test.yml build
echo -e "${GREEN}✅ Docker image built${NC}"

# Step 6: Start container
echo -e "${BLUE}Step 6: Starting container...${NC}"
docker compose -f docker-compose.test.yml up -d
echo -e "${GREEN}✅ Container started${NC}"

# Step 7: Wait for health check
echo -e "${BLUE}Step 7: Waiting for application...${NC}"
sleep 10

for i in {1..30}; do
    if curl -f http://localhost:8088/api/snapshot > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Application is healthy!${NC}"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

# Step 8: Show status
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Access URLs:"
echo -e "  ${BLUE}http://localhost:8088${NC}"
echo -e "  ${BLUE}http://$(hostname -I | awk '{print $1}'):8088${NC}"
echo -e "  ${BLUE}http://test.score.vestmedia.pl:8088${NC}"
echo ""
echo -e "Container status:"
docker compose -f docker-compose.test.yml ps
echo ""
echo -e "Recent logs:"
docker compose -f docker-compose.test.yml logs --tail=15
echo ""
echo -e "Useful commands:"
echo -e "  View logs: ${BLUE}docker compose -f docker-compose.test.yml logs -f${NC}"
echo -e "  Stop:      ${BLUE}docker compose -f docker-compose.test.yml down${NC}"
echo -e "  Restart:   ${BLUE}docker compose -f docker-compose.test.yml restart${NC}"
