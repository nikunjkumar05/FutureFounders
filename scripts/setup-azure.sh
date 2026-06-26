#!/bin/bash
# Run this ONCE on your Azure B1s Ubuntu instance
# Usage: ssh into instance, then run: bash setup-azure.sh

set -e

echo "=== Setting up OpenWA Bot on Azure for Students ==="

# 1. Enable 2GB Swap space (crucial for 1GB RAM instances to avoid OOM crashes during build)
echo "[1/7] Enabling Swap space..."
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "  Swap space enabled!"
else
    echo "  Swap space already configured."
fi

# 2. Update system
echo "[2/7] Updating system..."
sudo apt update && sudo apt upgrade -y

# 3. Install Docker
echo "[3/7] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker $USER
    echo "  Docker installed!"
else
    echo "  Docker already installed."
fi

# 4. Install Docker Compose
echo "[4/7] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo apt install docker-compose -y
    echo "  Docker Compose installed!"
else
    echo "  Docker Compose already installed."
fi

# 5. Install ngrok
echo "[5/7] Installing ngrok..."
if ! command -v ngrok &> /dev/null; then
    curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-linux-amd64.tgz | sudo tar -xz -C /usr/local/bin
    echo "  ngrok installed!"
else
    echo "  ngrok already installed."
fi

# 6. Setup OpenWA
echo "[6/7] Setting up OpenWA Gateway..."
mkdir -p ~/openwa
cd ~/openwa

# Get ngrok token
echo "  Get your free authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
read -p "  Paste your ngrok authtoken: " NGROK_TOKEN
ngrok config add-authtoken "$NGROK_TOKEN"

# Clone rmyndharis/OpenWA if not exists
if [ ! -d "OpenWA" ]; then
    git clone https://github.com/rmyndharis/OpenWA.git OpenWA
fi

cd OpenWA

# Create docker-compose.prod.yml
cat > docker-compose.prod.yml << 'COMPOSEOF'
version: '3.8'
services:
  openwa-api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: openwa-api
    restart: always
    ports:
      - "2785:2785"
    environment:
      - NODE_ENV=production
      - PORT=2785
      - DATABASE_TYPE=sqlite
      - DATABASE_NAME=/app/data/openwa.sqlite
      - DATABASE_SYNCHRONIZE=true
      - ENGINE_TYPE=whatsapp-web.js
      - SESSION_DATA_PATH=/app/data/sessions
      - PUPPETEER_HEADLESS=true
      - PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu,--disable-crashpad
      - STORAGE_TYPE=local
      - STORAGE_LOCAL_PATH=/app/data/media
      - API_MASTER_KEY=owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4
      - AUTO_START_SESSIONS=true
    volumes:
      - ./data:/app/data
COMPOSEOF

# Create start script with ngrok
cat > start-bot.sh << 'STARTEOF'
#!/bin/bash
cd ~/openwa/OpenWA

echo "Starting OpenWA Docker Container..."
docker-compose -f docker-compose.prod.yml up -d --build
echo "Waiting for OpenWA to boot up..."
sleep 15

# Start ngrok in background
pkill ngrok 2>/dev/null || true
ngrok http 2785 --log=stdout > /tmp/ngrok.log &
NGROK_PID=$!

# Extract public URL
sleep 5
TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Tunnel URL: $TUNNEL_URL"

if [ -z "$TUNNEL_URL" ]; then
    echo "ERROR: Failed to retrieve ngrok tunnel URL. Check ngrok authtoken."
    exit 1
fi

# We use the standard session ID configured in your app
SESSION_ID="aquatrak-session"

# Initialize session in the background
echo "Initializing session '$SESSION_ID'..."
curl -s -X POST "http://localhost:2785/api/sessions" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" \
  -d "{\"name\": \"$SESSION_ID\"}" || true

curl -s -X POST "http://localhost:2785/api/sessions/$SESSION_ID/start" \
  -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" || true

# Register the webhook url
WEBHOOK_URL="https://futurefounders-ruddy.vercel.app/api/webhook"
echo "Registering webhook: $WEBHOOK_URL..."
curl -s -X POST "http://localhost:2785/api/sessions/$SESSION_ID/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" \
  -d "{\"url\": \"$WEBHOOK_URL\", \"events\": [\"message.received\"]}" || true

# Update Vercel Env
cd ~/FutureFounders
VERCEL_TOKEN=$(grep OPENWA_VERCEL_TOKEN .env | cut -d= -f2-)
if [ -n "$VERCEL_TOKEN" ]; then
    echo "Updating Vercel production variables..."
    echo "$TUNNEL_URL" | npx vercel env add OPENWA_API_URL production --token "$VERCEL_TOKEN" --force || true
    echo "$SESSION_ID" | npx vercel env add OPENWA_SESSION_ID production --token "$VERCEL_TOKEN" --force || true
    
    # Trigger redeploy
    git commit --allow-empty -m "redeploy: new Azure bot tunnel URL $TUNNEL_URL" 2>/dev/null || true
    git push origin main 2>/dev/null || true
    echo "Vercel env updated and redeploy triggered!"
else
    echo "WARNING: OPENWA_VERCEL_TOKEN not found in .env. Please update Vercel variables manually."
fi

echo "========================================"
echo " Bot is now running on Azure!"
echo " Tunnel URL: $TUNNEL_URL"
echo " Session Name: $SESSION_ID"
echo "========================================"
STARTEOF
chmod +x start-bot.sh

# 7. Create systemd service
echo "[7/7] Creating auto-restart service..."
sudo tee /etc/systemd/system/openwa-bot.service > /dev/null << SVCEOF
[Unit]
Description=OpenWA WhatsApp Bot
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/home/$USER/openwa/OpenWA
ExecStart=/home/$USER/openwa/OpenWA/start-bot.sh
Restart=always
RestartSec=60
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
echo "To clone your project on the VM so Vercel can update automatically, run:"
echo "  git clone <your-github-repo-url> ~/FutureFounders"
echo "  (And copy your local .env to ~/FutureFounders/.env)"
echo ""
echo "To start the bot and register webhooks:"
echo "  cd ~/openwa/OpenWA && ./start-bot.sh"
echo ""
echo "To get the QR code to scan:"
echo "  curl -s -X GET \"http://localhost:2785/api/sessions/aquatrak-session/qr\" -H \"X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4\""
echo "  (Copy the data:image/png;base64... URL and paste it into your browser to scan)"
echo ""
