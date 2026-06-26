# Deploy Custom OpenWA Gateway on Fly.io (No Ngrok Needed)

This guide shows you how to deploy the custom NestJS OpenWA API gateway (from your local folder `C:\Users\sange\OpenWA`) to Fly.io. This provides a permanent HTTPS endpoint (e.g. `https://your-app.fly.dev`) directly, which eliminates the need to run local ngrok tunnels or keep your computer on.

---

## Prerequisites

1. **Install Fly CLI**:
   - **Windows (PowerShell)**:
     ```powershell
     pwsh -Command "iwr https://fly.io/install.ps1 | iex"
     ```
   - **macOS / Linux**:
     ```bash
     curl -L https://fly.io/install.sh | sh
     ```
2. **Restart your terminal** so the `fly` command is available in your PATH.
3. **Log in or Sign Up**:
     ```bash
     fly auth login
     ```

---

## Step-by-Step Deployment

All commands below should be run from inside the **`C:\Users\sange\OpenWA`** directory.

### Step 1: Initialize the Fly App
Run the following command inside `C:\Users\sange\OpenWA` to set up your app (press `y` when asked to use the existing `fly.toml` configuration):
```bash
fly launch --no-deploy
```
*If asked to name the app, type a unique name like `aquatrak-bot` or another identifier. Keep note of the app name.*

### Step 2: Create a Persistent Volume
WhatsApp sessions require storing Chromium and session files so you don't have to scan the QR code every time the server restarts. Create a 1GB persistent volume in your desired region (e.g., `bom` for Mumbai, or choose a region closest to you):
```bash
fly volumes create openwa_data --region bom --size 1
```

### Step 3: Configure the API Master Key
To make sure Vercel can talk to your new Fly app immediately without updating the API Key, configure your existing API Key as the Master Key. Fly.io will pass this securely to the app on boot:
```bash
fly secrets set API_MASTER_KEY="owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4"
```

### Step 4: Deploy the App
Run this command to build and deploy your app. Fly.io will spin up a remote builder, build the NestJS container using the local Dockerfile, and launch the service:
```bash
fly deploy
```

---

## How to Initialize Your WhatsApp Session

Once deployed, your app is running live! You can manage the session using either the **Swagger UI** or simple **`curl` commands**.

### Option A: Using the Swagger API Docs (Recommended)
1. In your browser, navigate to: `https://<your-app-name>.fly.dev/api/docs` (replace `<your-app-name>` with your actual app name).
2. Click the **Authorize** button at the top right, paste your API Key (`owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4`), and click Authorize.
3. Scroll to **sessions** and click `POST /sessions` to create your session (e.g., set `name` to `aquatrak-session`).
4. Click `POST /sessions/{id}/start` with `id = aquatrak-session` to launch Chromium.
5. Click `GET /sessions/{id}/qr` with `id = aquatrak-session`. Copy the `qrCode` base64 string (`data:image/png;base64,...`), paste it into your browser's address bar, and press Enter to view and scan the QR code.
6. Scroll to **webhooks** and click `POST /sessions/{sessionId}/webhooks` with `sessionId = aquatrak-session` and register:
   ```json
   {
     "url": "https://futurefounders-ruddy.vercel.app/api/webhook",
     "events": ["message.received"]
   }
   ```

### Option B: Using Curl Commands
Replace `<your-app-name>` with your actual Fly.io app name:

1. **Create the Session**:
   ```bash
   curl -X POST "https://<your-app-name>.fly.dev/api/sessions" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" \
     -d '{"name": "aquatrak-session"}'
   ```

2. **Start the Session (Spawns Headless Chrome)**:
   ```bash
   curl -X POST "https://<your-app-name>.fly.dev/api/sessions/aquatrak-session/start" \
     -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4"
   ```

3. **Get the QR Code Base64 URL**:
   ```bash
   curl -X GET "https://<your-app-name>.fly.dev/api/sessions/aquatrak-session/qr" \
     -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4"
   ```
   *Copy the long `qrCode` value starting with `data:image/png;base64,...`, paste it into any web browser's URL bar, and scan it with your phone.*

4. **Register the Webhook**:
   ```bash
   curl -X POST "https://<your-app-name>.fly.dev/api/sessions/aquatrak-session/webhooks" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4" \
     -d '{"url": "https://futurefounders-ruddy.vercel.app/api/webhook", "events": ["message.received"]}'
   ```

---

## Update Vercel Settings

1. Open your Vercel Project Dashboard (`futurefounders-ruddy`).
2. Go to **Settings -> Environment Variables**.
3. Update `OPENWA_API_URL` to: `https://<your-app-name>.fly.dev`
4. Update `OPENWA_SESSION_ID` to: `aquatrak-session`
5. Redeploy your Vercel project or push a commit to trigger a rebuild so the variables update in production.
