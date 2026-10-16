# Ceova AI Vision — Surveillance Platform & IP Webcam Discovery

**Ceova** is an AI-powered computer-vision monitoring and surveillance dashboard. It connects seamlessly to Android smartphones running **IP Webcam** via zero-config local Wi-Fi auto-discovery, integrated laptop webcams, or phone QR code streaming. It runs real-time object detection and tracking using an asynchronous YOLO/ByteTrack pipeline, maintains a 20-second object memory across occlusions, logs time-stamped security events, and generates structured AI surveillance reports.

---

## 🚀 Instant Deployment Guide

### Option 1: Deploy to Vercel (Cloud Dashboard)

The frontend web dashboard is pre-configured for zero-config deployment on **Vercel**:

1. **Push this repository to GitHub** (see instructions below to avoid upload errors).
2. Go to [Vercel Dashboard](https://vercel.com/new).
3. Click **Import Repository** and select your GitHub repo.
4. Keep the default settings:
   - **Framework Preset:** `Vite`
   - **Build Command:** `cd frontend && npm install && npm run build`
   - **Output Directory:** `frontend/dist`
5. Click **Deploy**.

> **How Vercel connects to your camera:**  
> A cloud server cannot access your private home Wi-Fi (`192.168.x.x`). The Vercel web app opens in your laptop browser and securely communicates with the **Local Camera Companion Service** running on your laptop (`http://localhost:8000`). This ensures **zero cloud bandwidth lag** and total privacy!

---

### Option 2: Deploy to GitHub (Avoiding the "Try Uploading One File at Once" Error)

> [!IMPORTANT]
> **Why does GitHub give the error *"Try uploading one file at a time or fewer files at once"*?**  
> If you drag and drop a whole folder into GitHub's web browser uploader, GitHub enforces a strict **100-file limit** and rejects `node_modules` or `__pycache__` (which contain thousands of files).  
> **Always push using Git in your terminal** as shown below:

Open PowerShell or Terminal inside the `AG FINAL` directory:

```bash
# 1. Initialize Git repository
git init

# 2. Stage all project files (.gitignore automatically excludes junk files)
git add .

# 3. Commit the clean source files
git commit -m "Initial commit: Ceova AI Vision with Vercel & GitHub support"

# 4. Set your main branch
git branch -M main

# 5. Connect to your GitHub repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 6. Push to GitHub
git push -u origin main
```

---

## 💻 Running Locally

### 1-Click Launchers

* **Windows:** Double-click `start_companion.bat`  
* **Unified (Companion + UI):** Run `npm run dev` in the root folder.

### Manual Terminal Commands

#### Terminal 1: Backend Companion Service (Port 8000)
```bash
cd backend
pip install -r requirements.txt
python run_companion.py
```

#### Terminal 2: Frontend Dashboard (Port 5173)
```bash
cd frontend
npm install
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 📡 Automatic Android IP Webcam Discovery

1. Connect your Android phone and laptop to the same Wi-Fi network.
2. In the **IP Webcam** app on Android, scroll to the bottom and tap **Start server**.
3. In the Ceova Dashboard, click **Connect Camera** → **IP Webcam**.
4. Ceova automatically detects your active network adapter (e.g. `Wi-Fi 192.168.0.0/24`), sweeps the subnet for open camera endpoints, and displays 6-stage reachability diagnostics:
   - **Stage 1: Host Reachable** (DNS resolution / ARP)
   - **Stage 2: Port Reachable** (Configurable TCP port `1–65535`)
   - **Stage 3: HTTP Server Responds** (`/status.json`, `/shot.jpg`, `/`)
   - **Stage 4: Authentication Challenge** (Basic / Digest auth)
   - **Stage 5: Credentials Verified**
   - **Stage 6: Live Video Stream Ready** (`/video`)
5. Click **Auto-Discover & Connect Camera**.

---

## 📁 Project Structure

```text
AG FINAL/
├── .env.example              # Sample environment configuration
├── .gitignore                # Production gitignore (keeps repository clean)
├── README.md                 # Deployment & feature documentation
├── dev.js                    # Unified local runner (Companion + Frontend)
├── package.json              # Root orchestrator for Vercel and local dev
├── start_companion.bat       # Windows 1-click companion launcher
├── start_companion.sh        # Linux/macOS 1-click companion launcher
├── vercel.json               # Vercel cloud deployment specification
├── backend/
│   ├── app/                  # FastAPI companion source (detection, tracking, memory, discovery)
│   ├── tests/                # Verification test suite (12 test scenarios + memory cache tests)
│   ├── requirements.txt      # Python dependencies
│   ├── run_companion.py      # Companion launcher with network banner
│   └── .env.example
└── frontend/
    ├── public/               # Static assets & SVG icons
    ├── src/                  # React 19 UI components, hooks & services
    ├── index.html            # Main HTML entry point
    ├── package.json          # Frontend dependencies (React, Lucide, Vite)
    └── vite.config.js        # Vite build configuration with API reverse proxies
```
