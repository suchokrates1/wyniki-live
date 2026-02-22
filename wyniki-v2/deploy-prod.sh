#!/bin/bash
set -e

echo "=== Wdrożenie wyniki-v2 na produkcję ==="
echo ""

# Kolory
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Katalog v2
V2_DIR=~/count/wyniki-v2

echo -e "${YELLOW}[1/7]${NC} Sprawdzanie katalogu..."
if [ ! -d "$V2_DIR" ]; then
    echo -e "${RED}Błąd: Katalog $V2_DIR nie istnieje${NC}"
    exit 1
fi
cd "$V2_DIR"

echo -e "${GREEN}✓${NC} Katalog znaleziony: $V2_DIR"

echo -e "\n${YELLOW}[2/7]${NC} Aktualizacja kodu z repozytorium..."
git fetch origin
git pull origin main || echo "Warning: Git pull failed, continuing..."

echo -e "\n${YELLOW}[3/7]${NC} Sprawdzanie plików konfiguracyjnych..."
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}Błąd: Brak pliku docker-compose.prod.yml${NC}"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: Brak pliku .env - używam domyślnych wartości${NC}"
fi

echo -e "${GREEN}✓${NC} Pliki konfiguracyjne OK"

echo -e "\n${YELLOW}[4/7]${NC} Zatrzymywanie starego kontenera v1..."
docker stop wyniki-tenis || echo "Kontener wyniki-tenis już zatrzymany"

echo -e "\n${YELLOW}[5/7]${NC} Budowanie obrazu v2..."
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "\n${YELLOW}[6/7]${NC} Uruchamianie kontenera v2..."
docker compose -f docker-compose.prod.yml up -d

echo -e "\n${YELLOW}[7/7]${NC} Sprawdzanie statusu..."
sleep 5
docker ps | grep wyniki-tenis-v2

echo -e "\n${GREEN}=== Wdrożenie zakończone ===${NC}"
echo ""
echo "Sprawdź logi: docker logs wyniki-tenis-v2 -f"
echo "Sprawdź health: curl http://localhost:8087/api/snapshot"
echo ""
echo -e "${YELLOW}Uwaga:${NC} Stary kontener wyniki-tenis został zatrzymany ale nie usunięty."
echo "Jeśli v2 działa poprawnie, usuń stary kontener: docker rm wyniki-tenis"
echo ""
