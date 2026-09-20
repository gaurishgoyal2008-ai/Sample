# ⚡ Apex Titan Fitness & Performance

A modern, high-tech gym web application built with **Pentogrid (Bento Grid) Architecture** and **Ultra-Glassmorphism** styling.

---

## 🚀 How to Deploy to Vercel

This project is fully pre-configured for Vercel with [`vercel.json`](./vercel.json), clean URLs, asset caching, and security headers.

### Option 1: Deploy via GitHub (Recommended)
1. Upload or push this folder (`gym`) to a new repository on [GitHub](https://github.com).
2. Go to [Vercel](https://vercel.com) and click **"Add New..."** > **"Project"**.
3. Select your GitHub repository.
4. Keep the default settings (Framework Preset: **Other**) and click **"Deploy"**.
5. Your website will be live with a global CDN URL (e.g. `https://apex-titan-gym.vercel.app`) in under 30 seconds!

### Option 2: Deploy via Vercel CLI
If you have the Vercel CLI installed:
```bash
# In this directory
vercel
```
Follow the prompts to link your project and deploy. For production:
```bash
vercel --prod
```

### Option 3: Deploy via Vercel Dashboard (Drag & Drop)
1. Go to [vercel.com/new](https://vercel.com/new).
2. Drag and drop this folder directly into the browser window.
3. Click **Deploy**.

---

## 📁 Project Structure

```
gym/
├── index.html         # Main Arena (Hero Bento, Facilities, Pricing, Pass Generator)
├── diet.html          # Precision Diet Hub (Macro Calculator & 4 Meal Protocols)
├── contact.html       # Contact, Operating Hours, Map & FAQ Hub
├── vercel.json        # Vercel deployment configuration & caching headers
├── package.json       # Project metadata
├── .gitignore         # Ignored files for version control
├── css/
│   └── style.css      # Pentogrid layout system & Glassmorphism effects
├── js/
│   └── app.js         # Interactive macro math, timetable filter, pass generator
├── server.ps1         # Native local HTTP server
└── start-server.bat   # One-click localhost launcher
```
