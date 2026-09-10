# Book Doubt Viewer (MyBook) 📖🔍

> **Personal Study Tool**  
> Store textbook photos on your laptop, inspect difficult questions with high-resolution zoom/pan/rotate, and show your doubts clearly.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────┐
│              GitHub Pages                │
│            PUBLIC FRONTEND               │
│        HTML + CSS + JavaScript           │
│   https://yathin7639.github.io/MyBook/   │
└────────────────────┬─────────────────────┘
                     │ HTTP REST API
                     ▼
┌──────────────────────────────────────────┐
│                MY LAPTOP                 │
│        Node.js + Express BACKEND         │
│          http://localhost:3000           │
│                                          │
│       📁 /uploads     📄 photos.json     │
└──────────────────────────────────────────┘
```

- **Frontend**: Hosted publicly on [GitHub Pages](https://yathin7639.github.io/MyBook/). Contains only static HTML, CSS, and client-side JavaScript.
- **Backend**: Runs privately and locally on your laptop using Node.js & Express.
- **Storage**: Uploaded textbook photos are stored physically on your laptop in `/uploads`, and metadata is recorded in `photos.json`.
- **Offline Notice**: If the backend is offline, the frontend will show `○ Backend offline` with a notice: *"Start the MyBook server on your laptop to upload and view your saved book photos."*

---

## 🚀 Quick Start (Running Backend on Your Laptop)

### 1. Install Dependencies
Open PowerShell or your terminal in this project folder and run:
```bash
npm install
```

### 2. Start the Backend Server
```bash
npm start
```

You will see:
```text
==========================================
📖 Book Doubt Viewer Backend is RUNNING!
🔗 Local URL:         http://localhost:3000
🌐 Allowed Frontend:  https://yathin7639.github.io/MyBook/
📁 Uploads Directory: .../uploads
📄 Metadata File:     .../photos.json
==========================================
```

### 3. Open the Frontend
Visit your GitHub Pages site:
👉 **[https://yathin7639.github.io/MyBook/](https://yathin7639.github.io/MyBook/)**

When your laptop server is running, the status badge at the top right will show **`● Backend connected`** in green!

---

## ⚙️ Frontend ↔ Backend Configuration

The frontend has a single, clearly defined configuration variable at line 9 of [`app.js`](app.js):

```javascript
const API_BASE_URL = "http://localhost:3000";
```

All API requests (`/api/photos`, `/api/health`, `/uploads/...`) use this constant.
- If you run the server locally on your laptop, `http://localhost:3000` is used.
- You can also click the **`Backend status`** badge in the top-right corner to temporarily point to a custom URL (e.g. a Wi-Fi IP or tunnel URL).

---

## 🔍 Fullscreen Question Inspector Controls

Click any textbook card or the **Open** button to open the fullscreen reader:

| Action | Button | Keyboard Shortcut |
| :--- | :--- | :--- |
| **Zoom In (up to 8×)** | `+` button in dock | `+` or `=` |
| **Zoom Out** | `-` button in dock | `-` |
| **Reset / Fit Screen** | `Fit` button in dock | `0` |
| **Mouse-Wheel Zoom** | Scroll mouse wheel | Center zooms under pointer |
| **Pan / Drag** | Click and drag | Touch drag on mobile/tablet |
| **Rotate 90° Clockwise** | `Rotate` button in dock | `R` |
| **Quick 2× Zoom** | `2×` pill in dock | — |
| **Quick 4× Zoom** | `4×` pill in dock | — |
| **Previous Doubt** | `←` navigation arrow | `←` (Left Arrow) |
| **Next Doubt** | `→` navigation arrow | `→` (Right Arrow) |
| **Download Original** | `Original` button in header | — |
| **Close Inspector** | `✕` in header | `Esc` |

---

## 📁 Storage & Persistence Guarantee

All uploaded photos are stored **locally and physically** on your laptop in:
- `MyBook/uploads/` (original, uncompressed image files)
- `MyBook/photos.json` (metadata ledger)

Because photos are saved to your physical drive, closing the browser, restarting Node, or rebooting your laptop will **never** delete your photos.
