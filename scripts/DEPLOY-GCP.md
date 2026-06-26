# Deploy OpenWA Bot on Google Cloud (Free Tier)

## Quick Start (15 minutes)

### Step 1: Create GCP Instance
1. Go to https://console.cloud.google.com
2. Compute Engine → VM Instances → Create Instance
3. Settings:
   - **Name**: `openwa-bot`
   - **Machine type**: `e2-micro` (free)
   - **Region**: `asia-south1` (Mumbai)
   - **Boot disk**: Ubuntu 22.04 LTS
   - **Firewall**: ✅ Allow HTTP traffic
4. Click Create
5. Note the **External IP** (e.g., `34.93.x.x`)

### Step 2: SSH into Instance
```bash
gcloud compute ssh openwa-bot --zone=asia-south1-a
```
Or use the SSH button in GCP Console.

### Step 3: Run Setup Script
```bash
# Clone the project
git clone https://github.com/your-repo/FutureFounders.git
cd FutureFounders

# Run setup
bash scripts/setup-gcp.sh
```

### Step 4: Start the Bot
```bash
cd ~/openwa
./start.sh
```

### Step 5: Scan QR Code
1. Open browser: `http://YOUR_EXTERNAL_IP:2886`
2. Scan QR code with WhatsApp
3. Bot is now online!

### Step 6: Enable Auto-Start
```bash
sudo systemctl start openwa-bot
```
Bot will auto-restart on server reboot.

## Useful Commands

| Command | Description |
|---------|-------------|
| `docker ps` | Check if OpenWA is running |
| `docker logs openwa-bot -f` | View live logs |
| `curl http://localhost:2785/api/health` | Health check |
| `sudo systemctl restart openwa-bot` | Restart bot |
| `sudo systemctl status openwa-bot` | Check service status |

## How It Works

```
WhatsApp Users
      ↓
  OpenWA (GCP Server:2785)
      ↓
  ngrok tunnel
      ↓
  Vercel API (webhook/crons)
      ↓
  Supabase Database
```

- **OpenWA** runs Docker on GCP, stays online 24/7
- **ngrok** tunnels the API to the internet
- **Vercel** receives webhook events and runs cron jobs
- **Auto-restart** via systemd ensures bot survives reboots

## Cost
- **GCP e2-micro**: Free for 12 months (30GB disk, 1GB RAM)
- **ngrok free tier**: 1 tunnel, 40 connections/min
- **Total**: $0/month for first year
