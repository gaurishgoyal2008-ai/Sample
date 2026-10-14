# Ceova — Real-Time AI Object Detection, Tracking & Surveillance Dashboard

**Ceova** is a high-performance computer-vision monitoring and surveillance application. It ingests live camera streams from Android smartphones running **IP Webcam** (with automatic local Wi-Fi discovery), local webcams, or QR code phone links, runs real-time object detection and tracking using a decoupled YOLO26/ByteTrack pipeline, maintains a **20-second temporary object memory** across occlusions, logs time-stamped security events into a live timeline, and generates structured AI monitoring reports.

Ceova is architected for **instant local execution** and **cloud deployment on Vercel** using a decoupled **Local Camera Companion Service**.

---

## Architecture Overview

```text
 ┌────────────────────────────────────────────────────────┐
 │           Android Phone (IP Webcam App)                │
 │           Connected to Local Home/Office Wi-Fi         │
 └───────────────────────────┬────────────────────────────┘
                             │ Local Subnet (192.168.x.x / 10.x.x.x)
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │    Local Camera Companion Service (User's Laptop)      │
 │    • Port 8000 (FastAPI + OpenCV + PyTorch)            │
 │    • Zero-config Wi-Fi Subnet Scanner & ARP Discovery  │
 │    • Decoupled 30 FPS Video Capture & Display Loop     │
 │    • Asynchronous AI Worker (YOLO26 + ByteTrack)       │
 │    • Local SQLite Database Storage (ceova.db)          │
 └─────────────┬────────────────────────────┬─────────────┘
               │ Localhost:8000             │ WebSockets / MJPEG / REST
               │ (Direct / Proxied)         │ (CORS Enabled)
               ▼                            ▼
 ┌───────────────────────────┐  ┌─────────────────────────┐
 │   Local Web Dashboard     │  │ Vercel Cloud Dashboard  │
 │   http://localhost:5173   │  │ https://your-app.vercel │
 └───────────────────────────┘  └─────────────────────────┘
```

### Why the Local Camera Companion Service Architecture?
A cloud server hosted on **Vercel** cannot scan your home or office Wi-Fi network (private subnets like `192.168.1.x` or `10.0.0.x`). By separating the architecture into:
1. **Frontend Web Dashboard**: Hosted on **Vercel** (or run locally via Vite).
2. **Local Camera Companion Service**: Runs on your laptop (`start_companion.bat` / `run_companion.py`).

Your browser accesses the sleek Vercel cloud dashboard, which connects directly to your Local Companion Service. The companion service handles local Android IP Webcam discovery, camera stream ingestion, and neural network inference right on your hardware with **zero cloud bandwidth lag** and **maximum privacy**.

---

## Key Features

1. **Decoupled 30 FPS Camera & AI Pipeline**:
   - Camera capture and video display run at a smooth **28–30 FPS**.
   - AI inference runs in a dedicated asynchronous worker with **Latest-Frame Processing** (skipping intermediate frames when busy to prevent frame lag).
2. **Automatic Android IP Webcam Discovery**:
   - Zero manual IP entry required. Ceova automatically sweeps local Wi-Fi subnets, authenticates with your configured credentials, verifies the live stream, and connects.
   - Credentials are sanitized in memory (`http://user:***@192.168.0.x:8080/video`) and **never leaked in logs or commits**.
3. **Persistent Categorized Tracking IDs**:
   - Human: `H-001`, `H-002`
   - Vehicle: `V-001`, `V-002`
   - Luggage/Bags: `B-001`
   - Electronics: `E-001`
   - Other Objects: `O-001`
4. **20-Second Temporary Object Memory**:
   - If a person or vehicle is momentarily occluded or steps behind an obstacle, Ceova marks them as `TEMPORARILY_LOST`.
   - When recovered within 20 seconds, the persistent ID is retained without spawning duplicate IDs.
5. **AI Surveillance Reports**:
   - Automatically synthesizes an executive natural-language summary based strictly on observed tracking data.
   - Export session reports to **JSON**, **CSV**, and **Plain Text**.
6. **Vercel & GitHub Ready**:
   - Fully configured `.gitignore`, `.env.example`, `vercel.json`, and one-click startup scripts.

---

## Quick Start (Local Run)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/ceova-ai-vision.git
cd ceova-ai-vision
```

### 2. Install Dependencies
```bash
# Backend dependencies
pip install -r backend/requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Launch the Application

**Option A: 1-Click Launchers**
- **Windows**: Double-click `start_companion.bat`
- **Linux / macOS**: Run `./start_companion.sh`

**Option B: Terminal Commands**
```bash
# Terminal 1: Start Companion Backend (Port 8000)
python backend/run_companion.py

# Terminal 2: Start Frontend Dev Server (Port 5173)
cd frontend
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## Deploying Frontend to Vercel

### Step 1: Push to GitHub
Make sure your repository is pushed to your GitHub account:
```bash
git init
git add .
git commit -m "Initial commit - Ceova AI Vision"
git branch -M main
git remote add origin https://github.com/your-username/ceova-ai-vision.git
git push -u origin main
```

### Step 2: Import into Vercel
1. Log in to [Vercel](https://vercel.com) and click **Add New** → **Project**.
2. Select your `ceova-ai-vision` GitHub repository.
3. Vercel automatically detects the root configuration via `vercel.json`:
   - **Framework Preset**: Vite
   - **Build Command**: `cd frontend && npm install && npm run build` (or root `npm run build`)
   - **Output Directory**: `frontend/dist`
4. *(Optional Environment Variable)*:
   - Add `VITE_COMPANION_URL` set to `http://localhost:8000` (defaults to `http://localhost:8000` automatically if omitted).
5. Click **Deploy**.

### Step 3: Using the Vercel Dashboard with your IP Webcam
1. Start the Local Companion Service on your laptop:
   ```bash
   start_companion.bat   # Windows
   # or
   python backend/run_companion.py
   ```
2. Open your deployed Vercel URL in your browser (e.g., `https://your-ceova-app.vercel.app`).
3. Notice the top navbar shows **Companion Online** with a blue status pill.
4. Open the **IP Webcam** app on your phone, start the camera server, and click **Connect Camera** in the Vercel web app.
5. Click **Auto-Discover & Connect Camera** — your phone camera connects immediately!

---

## AI Model Weights & GitHub Storage

Ceova uses Ultralytics neural backbones:
- **`yolo11s.pt`** (19.3 MB, Accuracy Priority: 47.0 mAP)
- **`yolo11n.pt`** (5.6 MB, Speed Priority: 39.5 mAP)

> [!NOTE]
> **Automatic Download**: Both model checkpoints are below GitHub's 100MB limit. Additionally, Ultralytics has built-in auto-downloading: if model files are not present in your repository, Ultralytics automatically downloads them from official releases on the first run in 2–4 seconds.

---

## Environment Variables Reference

See `.env.example` in the root repository.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Host address for companion server binding |
| `PORT` | `8000` | Port for companion server |
| `ALLOWED_ORIGINS` | `*` | Allowed CORS origins (e.g. `https://your-app.vercel.app`) |
| `DEFAULT_MODEL` | `YOLO26-Accurate` | Active model (`YOLO26-Accurate` or `YOLO26-Fast`) |
| `DEFAULT_CONFIDENCE` | `0.28` | Detection confidence threshold |
| `DEFAULT_MEMORY_SECONDS`| `20.0` | Object occlusion memory buffer (seconds) |
| `DEFAULT_RESOLUTION` | `720p` | Ingestion resolution (`Auto`, `480p`, `720p`, `1080p`) |
| `VITE_COMPANION_URL` | `http://localhost:8000` | Frontend companion endpoint |

---

## Automated Verification Suite

Run the full 12-scenario test suite to verify end-to-end functionality:
```bash
python backend/tests/test_scenarios.py
```
**Verification Coverage**:
1. Single person entry, visibility tracking, and departure.
2. Simultaneous multi-person tracking with distinct IDs (`H-001`, `H-002`).
3. Temporary occlusion recovery without duplicate ID generation.
4. Multi-class entity tracking (People, Cars, Bags).
5. Departure transition after memory threshold expiration.
6. Smartphone QR code stream ingestion and decoding.
7. Credential sanitization (passwords never exposed).
8. Graceful connection failure handling without password leakage.
9. Clean stream disconnection and state preservation.
10. Natural-language surveillance report generation and SQLite persistence.
11. Local Wi-Fi subnet discovery and ARP table inspection.
12. Model weights initialization, CLAHE contrast enhancement, and aspect ratio scaling.

---

## License

This project is licensed under the MIT License.
