# Ex-Ray 

Ex-Ray is a tiny open-source tool that scans your Instagram DMs and roasts your chat game.

- Chrome extension content script (runs on `instagram.com`)
- FastAPI backend on `localhost:8000`
- ML model to tag message vibes
- Gemini (optional) for toxic little verdicts

## How it works

1. Open any Instagram DM thread.
2. Click the floating Ex-Ray button near the chat input.
3. It scrolls back, grabs ~40 messages, sends **only text + sender labels** to the local backend.
4. Backend:
   - extracts stats (who talks more, emojis, questions, etc.)
   - runs a scikit-learn model for per-message vibes
   - uses Gemini (if configured) to generate a **brutal 1-liner verdict**
5. You get a glassy overlay with:
   - overall vibe
   - you vs them effort
   - ghost risk
   - “will they text again” %
   - one-line roast

## Setup

### Backend

```bash
git clone https://github.com/yourname/ex-ray.git
cd ex-ray/backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
Create a .env:

GEMINI_API_KEY=your_key_here   # optional but recommended


Run:
```
uvicorn app:app --reload --port 8000
```


Backend lives at http://127.0.0.1:8000.

Content script (dev mode)

Go to chrome://extensions

Enable Developer mode

Click Load unpacked

Select the extension folder (where manifest.json + content.js live)

Open Instagram DMs, refresh, click the Ex-Ray button.

Safety / Privacy

Runs on your machine.

Only sends:

sender: "you" / "them"

text: message text

No usernames, IDs, or tokens.

Gemini only sees aggregate stats, not raw messages.


