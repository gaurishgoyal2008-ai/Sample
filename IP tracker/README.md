# IP Tracker — Neural Camera & AI Observation Reporter

IP Tracker transforms your **smartphone into a wireless IP camera sensor** while your **laptop acts as the high-powered AI Command Center powered by YOLO26**.

- **Phone (Wireless Sensor / Transmitter)**: Uses rear camera to capture ultra-low latency video, transmitting over local IP / WebRTC with zero heavy neural models loaded on mobile.
- **Laptop (AI Command Center & Reporter)**: Receives the phone's live video stream over WebRTC, performs real-time neural object detection (YOLO26 & COCO-SSD), holographic AR overlays, spatial tracking, speech narration, and generates complete structured AI observation reports.
- **GitHub Ready**: Clean, lightweight source tree (under 10 MB total, exactly 18 files) ready to upload to GitHub without any file count or size errors.

---

## 📱 How to Use: Phone Camera -> Laptop Feed

1. **Start the App on Laptop**:
   ```bash
   npm run dev
   ```
   Open `https://localhost:5173` on your laptop (or your deployed Vercel URL).
2. **Connect Phone**:
   - The laptop screen will display a pairing card with a **QR code**, a **Room Code** (e.g. `V-7429`), and a direct link.
   - Scan the QR code with your phone camera or open `https://<laptop-ip>:5173/phone.html?room=V-7429`.
   - Tap **Allow** when prompted for camera access on your phone.
3. **Live Streaming & Analysis**:
   - The live video feed from your phone immediately appears on your laptop screen.
   - Neural bounding boxes, labels, dwell times, and center reticle targeting track objects live on the laptop.
   - Click **Generate AI Report** on your laptop anytime to view KPI metrics, structured observation tables, markdown, JSON, CSV, or PDF exports.

---

To deploy directly to production:
```bash
npx vercel --prod
```

---

### Option 2: Deploy via GitHub (Continuous Deployment)

1. Initialize git and commit your code:
   ```bash
   git init
   git add .
   git commit -m "feat: setup project with vercel deployment config"
   ```
2. Push to your GitHub repository:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. Go to [vercel.com/new](https://vercel.com/new).
4. Import your repository.
5. Vercel automatically detects the Vite framework and reads `vercel.json`.
6. Click **Deploy**.

---

## ⚙️ Configuration Details

- **`vercel.json`**:
  - **Framework**: `vite`
  - **Build Command**: `vite build`
  - **Output Directory**: `dist`
  - **Single Page App Routing**: Rewrites all routes to `/index.html`
  - **Permissions Policy Header**: Explicitly enables `camera=*` and `microphone=*` across modern mobile and desktop browsers so camera access works seamlessly on public HTTPS domains.
  - **Asset Caching**: Long-term immutable caching for bundled scripts and CSS.
- **Node Engine**: `>=18.0.0` configured in `package.json`.

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start development server (HTTPS enabled via basic-ssl)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```
