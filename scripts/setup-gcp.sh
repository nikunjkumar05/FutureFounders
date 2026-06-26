#!/bin/bash
# Run this ONCE on your Google Cloud e2-micro instance
# Usage: ssh into instance, then bash setup-gcp.sh

set -e

echo "=== Setting up OpenWA Bot on Google Cloud ==="

# 1. Update system
echo "[1/6] Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker $USER
    newgrp docker
fi

# 3. Install Docker Compose
echo "[3/6] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo apt install docker-compose -y
fi

# 4. Install ngrok
echo "[4/6] Installing ngrok..."
if ! command -v ngrok &> /dev/null; then
    curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-linux-amd64.tgz | sudo tar -xz -C /usr/local/bin
fi

# 5. Setup OpenWA
echo "[5/6] Setting up OpenWA..."
mkdir -p ~/openwa/sessions
cd ~/openwa

# Get ngrok token
echo "  Get your free authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
read -p "  Paste your ngrok authtoken: " NGROK_TOKEN
ngrok config add-authtoken "$NGROK_TOKEN"

# Create docker-compose
cat > docker-compose.yml << 'COMPOSEOF'
version: '3.8'
services:
  openwa:
    image: openwa/wa-automate:latest
    container_name: openwa-bot
    restart: always
    ports:
      - "2785:2785"
      - "2886:2886"
    environment:
      - MULTI_DEVICE=true
      - OFFLINE_MODE=false
    volumes:
      - ./sessions:/root/.open-wa
COMPOSEOF

# Create start script with ngrok
cat > start.sh << 'STARTEOF'
#!/bin/bash
cd ~/openwa

# Start OpenWA
docker-compose up -d
echo "Waiting for OpenWA to start..."
sleep 10

# Start ngrok in background
pkill ngrok 2>/dev/null || true
ngrok http 2785 --log=stdout > /tmp/ngrok.log &
NGROK_PID=$!

# Get tunnel URL
sleep 5
TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4)
echo "Tunnel URL: $TUNNEL_URL"

# Get session ID
SESSION_ID=$(curl -s http://localhost:2785/api/sessions -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"

# Update Vercel env
cd ~/FutureFounders
VERCEL_TOKEN=$(grep OPENWA_VERCEL_TOKEN .env | cut -d= -f2-)
if [ -n "$VERCEL_TOKEN" ]; then
    echo "$TUNNEL_URL" | npx vercel env add OPENWA_API_URL production --token "$VERCEL_TOKEN" 2>/dev/null
    if [ -n "$SESSION_ID" ]; then
        echo "$SESSION_ID" | npx vercel env add OPENWA_SESSION_ID production --token "$VERCEL_TOKEN" 2>/dev/null
    fi
    echo "Vercel env updated!"
fi

echo "Bot is running!"
STARTEOF
chmod +x start.sh

# 6. Create systemd service
echo "[6/6] Creating auto-restart service..."
sudo tee /etc/systemd/system/openwa-bot.service > /dev/null << SVCEOF
[Unit]
Description=OpenWA WhatsApp Bot
After=docker.service
Requires=docker.service

[Service]
Type=forking
WorkingDirectory=/home/$USER/openwa
ExecStart=/home/$USER/openwa/start.sh
Restart=always
RestartSec=30
Environment=HOME=/home/$USER

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable openwa-bot

echo ""
echo "========================================"
echo " Setup complete!"
echo "========================================"
echo ""
echo "To start the bot:"
echo "  cd ~/openwa && ./start.sh"
echo ""
echo "To auto-start on reboot:"
echo "  sudo systemctl start openwa-bot"
echo ""
echo "To check status:"
echo "  docker ps"
echo "  curl http://localhost:2785/api/health"
echo ""
echo "To view logs:"
echo "  docker logs openwa-bot -f"
