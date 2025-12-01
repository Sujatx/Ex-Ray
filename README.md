# **EX-RAY 🔍 — The Relationship X-Ray Tool**

*A brutal AI-powered vibe check for your Instagram DMs.*

EX-RAY scans your Instagram DM conversations and exposes the real vibe — dry, flirty, dead, desperate, one-sided, chaotic… whatever it is, EX-RAY will say it **with no filter**.

Built with a custom ML model + Gemini + sarcasm.

---

## ⭐ **Features**

* 🧠 **AI vibe analysis** (ML + heuristic rules + Gemini roast mode)
* 🔍 **Deep Scan** — scrolls up automatically to fetch long chat history
* 🎭 **Mood detection** (You vs Them)
* ⚡ **Energy match score**
* 👻 **Ghosting risk prediction**
* 💬 **Will-they-text-again %**
* 🔥 **Brutally honest verdict** (short, toxic, and accurate)
* 🧊 **Glassmorphism UI**
* 🖱️ **One-click floating button** inside Instagram Web
* 🛠️ **Fully open-source** for contributions

---

# 📦 **Project Structure**

```
EX-RAY/
│
├── backend/
│   ├── app.py               # FastAPI backend server
│   ├── .env                 # Gemini API key (ignored in git)
│   ├── logic/
│   │   ├── features.py
│   │   ├── labels.py
│   │   └── rules.py
│   └── ml/
│       ├── train.py
│       ├── try_vibe.py
│       ├── vibe_model.joblib
│       └── vibe_vectorizer.joblib
│
├── extension/
│   ├── manifest.json        # Chrome/Edge extension config
│   └── content.js           # Main content script
│
├── datasets/
│   └── hinglish.csv         # Training data
│
├── .gitignore
└── README.md
```

---

# 🚀 **How to Run the Backend (FastAPI)**

### **1. Go to backend folder**

```bash
cd backend
```

### **2. Create a virtual environment**

```bash
python -m venv .venv
```

### **3. Activate it**

**Windows**

```bash
.venv\Scripts\activate
```

**Mac/Linux**

```bash
source .venv/bin/activate
```

### **4. Install dependencies**

```bash
pip install -r requirements.txt
```

If you don’t have a requirements file, generate one:

```bash
pip freeze > requirements.txt
```

### **5. Add your Gemini API key**

Create `.env` in `/backend`:

```
GEMINI_API_KEY=your_key_here
```

### **6. Run the server**

```bash
uvicorn app:app --reload
```

Server runs at:

```
http://127.0.0.1:8000
```

---

# 🧩 **How to Install the Browser Extension Locally**

### **1. Open Chrome or Edge**

### **2. Go to**

```
chrome://extensions/
```

or

```
edge://extensions/
```

### **3. Enable Developer Mode**

Top-right toggle.

### **4. Click “Load Unpacked”**

### **5. Select the `/extension` folder**

Done.
Your EX-RAY floating button will appear inside Instagram Web.

---

# ⚙️ **How it Works (High Level)**

1. **content.js** injects a floating button in Instagram Web.
2. On click → it scrolls up, grabs up to 40 messages.
3. Sends the chat to the FastAPI backend.
4. Backend:

   * Extracts features
   * Runs ML vibe classification
   * Applies rule-based heuristics
   * Generates a brutal AI verdict via Gemini
5. The frontend displays a sexy glass UI with vibe breakdown.

---

# 🤝 **Contributing**

Pull requests are welcome.

Things you can help with:

* Improving ML model
* Training better Hinglish dataset
* Adding more vibe types
* UI/UX tweaks
* Publishing to Edge/Chrome Store
* Brand assets/icons

---

# 📜 **License**

MIT License — completely open for modification and commercial use.

---

# ❤️ **Made by Sujat**

Just vibes, sarcasm, and code.

---



Just say what you need next.
