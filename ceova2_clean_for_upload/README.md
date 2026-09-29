# VisionAI — Neural Camera & AI Observation Reporter

VisionAI is a real-time web application that transforms standard device cameras into an intelligent spatial tracking and automated AI observation reporter using TensorFlow.js and COCO-SSD.

---

## 🚀 Deploying to Vercel

The project is fully configured for zero-configuration deployment to [Vercel](https://vercel.com).

### Option 1: Deploy via Vercel CLI (Fastest)

Run the following command in your terminal from the project root:

```bash
npx vercel
```

- When prompted `Set up and deploy?`, press **Y**.
- Select your Vercel scope/account.
- Link to existing project? **N**.
- Project name: press **Enter** (or choose a custom name).
- Directory located: `./` (press **Enter**).
- Vercel will automatically detect the settings from `vercel.json` (`vite build`, output directory `dist`).

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
