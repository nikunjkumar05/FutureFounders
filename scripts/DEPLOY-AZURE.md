# Deploy WhatsApp Bot on Azure for Students (100% Free)

This guide shows you how to deploy the custom NestJS OpenWA API gateway onto a **Microsoft Azure for Students** virtual machine. This gives you a permanent, 100% free hosting solution with **no credit card required** to sign up.

---

## Step 1: Sign up for Azure for Students

1. Go to the [Azure for Students Sign Up Page](https://azure.microsoft.com/en-us/free/students/).
2. Click **Activate Now**.
3. Log in with your **academic email address** (ending in `.edu` or your university domain).
4. Verify your student status. **You do NOT need to input any credit card details.**
5. Once verified, you will be redirected to the Azure Portal with **$100 in free credits** activated.

---

## Step 2: Create a Free Virtual Machine (VM)

1. In the search bar at the top of the Azure Portal, search for **Virtual Machines** and click on it.
2. Click **Create -> Azure virtual machine**.
3. Configure the instance details:
   * **Project details**: Select your subscription (Azure for Students) and create a new Resource Group (e.g. `aquatrak-rg`).
   * **Virtual machine name**: `aquatrak-bot-vm`.
   * **Region**: Select a region close to you (e.g. `East US` or `West US`).
   * **Security type**: Standard.
   * **Image**: Select **Ubuntu Server 22.04 LTS - x64 Gen2**.
   * **Size**: Select **Standard_B1s** (1 vCPU, 1 GiB RAM). *This is eligible for the free tier credits.*
4. **Administrator account**:
   * **Authentication type**: Select **SSH public key** (or **Password** if you prefer a simpler login. If selecting Password, write down the username and password!).
   * **Username**: `azureuser`.
5. **Inbound port rules**:
   * Select **Allow selected ports**.
   * Check **SSH (22)**.
6. Click **Review + Create**, then click **Create** (if you chose SSH keys, download the private key when prompted).
7. Wait 2 minutes for the VM deployment to finish. Go to the resource and copy the **Public IP Address** (e.g., `20.124.52.12`).

---

## Step 3: Run the Setup Script on the VM

1. **SSH into your VM** using Git Bash, PowerShell, or command prompt:
   ```bash
   ssh azureuser@<YOUR_VM_PUBLIC_IP>
   ```
   *(If you used a password, enter it when prompted).*

2. **Clone your GitHub project** on the VM:
   ```bash
   git clone https://github.com/nikunjkumar05/FutureFounders.git ~/FutureFounders
   ```

3. **Navigate to the scripts folder** and run the automated setup:
   ```bash
   cd ~/FutureFounders/scripts
   bash setup-azure.sh
   ```
4. During execution, the script will:
   * Enable **2GB of swap space** (so the build doesn't run out of memory).
   * Install Docker, Docker Compose, and ngrok.
   * Ask you to paste your **ngrok authtoken** (get it free from [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)).
   * Clone the OpenWA gateway and build the container.
   * Automatically launch the bot, create the session, and register the Vercel webhook!

---

## Step 4: Scan the WhatsApp QR Code

Once the script completes, get the QR code to link your phone:

1. Request the QR code by running this command on the VM terminal:
   ```bash
   curl -s -X GET "http://localhost:2785/api/sessions/aquatrak-session/qr" -H "X-API-Key: owa_k1_17bbdae706b3994981c70be61bb93ff3eb45d1764266b983a33145847a196bf4"
   ```
2. Copy the long value under `"qrCode"` starting with `data:image/png;base64,...`.
3. Open a browser on your computer, paste that entire string into the address bar, and press Enter.
4. Scan the QR code using **WhatsApp on your phone** (Linked Devices -> Link a Device).

---

## Step 5: Finalize and Test

The script will automatically attempt to update Vercel with your new ngrok tunnel URL if you have your `.env` copied to the VM at `~/FutureFounders/.env`. 

If it did not update automatically, you can do it manually:
1. Retrieve your current tunnel URL by running:
   ```bash
   curl -s http://127.0.0.1:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | head -1 | cut -d'"' -f4
   ```
2. Go to **Vercel -> Settings -> Environment Variables** and update:
   * `OPENWA_API_URL` to the ngrok URL printed above.
   * `OPENWA_SESSION_ID` to `aquatrak-session`.
3. Trigger a Vercel redeploy.
4. Send a WhatsApp message to test! Your bot is now running fully serverless and free!
