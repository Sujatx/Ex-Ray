from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Literal
from fastapi.middleware.cors import CORSMiddleware
import joblib
from collections import Counter
from dotenv import load_dotenv
load_dotenv()

import os
import json
import google.generativeai as genai

# load key from .env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    # choose a fast small model available to your key
    gemini_model = genai.GenerativeModel("models/gemini-2.5-flash")
else:
    gemini_model = None

# ====== ML MODEL LOADING ======
model = joblib.load("ml/vibe_model.joblib")
vectorizer = joblib.load("ml/vibe_vectorizer.joblib")


def predict_vibe_with_conf(text: str) -> tuple[str, float]:
    """
    Return (label, confidence) for a single message.
    Confidence is max predicted probability in [0,1].
    """
    vec = vectorizer.transform([text])
    probs = model.predict_proba(vec)[0]
    best_idx = probs.argmax()
    label = model.classes_[best_idx]
    confidence = float(probs[best_idx])
    return label, confidence


# ====== FASTAPI SETUP ======
app = FastAPI()


@app.get("/gemini_models")
def gemini_models():
    try:
        out = genai.list_models()
        names = [m.name for m in out]
        return {"models": names}
    except Exception as e:
        return {"error": str(e)}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # fine for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Message(BaseModel):
    sender: Literal["you", "them"]
    text: str


class AnalyzeRequest(BaseModel):
    messages: List[Message]


# ====== FEATURE EXTRACTOR (OLD RULE-BASED) ======
def count_emojis(text: str) -> int:
    # very rough emoji detection: characters outside basic multilingual plane
    return sum(1 for ch in text if ord(ch) > 10000)


def extract_features(messages: List[Message]) -> dict:
    total_msgs = len(messages)
    you_msgs = sum(1 for m in messages if m.sender == "you")
    them_msgs = total_msgs - you_msgs

    # If only "them" is detected, assume it's actually you talking with no reply
    if you_msgs == 0 and them_msgs > 0:
        you_msgs = total_msgs
        them_msgs = 0

    total_words = 0
    emoji_count = 0
    question_count = 0
    flirty_score = 0
    argument_score = 0

    you_words = 0
    them_words = 0
    you_emojis = 0
    them_emojis = 0
    you_questions = 0
    them_questions = 0

    flirty_keywords = [
        "babe", "baby", "cutie", "handsome", "beautiful", "hot",
        "miss you", "love you", "crush", "😘", "❤️", "💋", "😉", "😍", "🤭",
        "yaar", "miss kar", "miss kr", "yaad", "cute lag", "acha lag",
    ]

    argument_keywords = [
        "why", "you never", "you always", "problem", "issue",
        "fight", "argue", "angry", "upset", "annoyed", "fed up",
        "scene nahi", "scene nhi", "gussa", "naraz", "ignore", "ignored",
    ]

    for m in messages:
        txt = m.text.strip()
        if not txt:
            continue

        words = txt.split()
        wlen = len(words)
        total_words += wlen
        ems = count_emojis(txt)
        emoji_count += ems
        qs = txt.count("?")
        question_count += qs

        if m.sender == "you":
            you_words += wlen
            you_emojis += ems
            you_questions += qs
        else:
            them_words += wlen
            them_emojis += ems
            them_questions += qs

        lower = txt.lower()
        if any(k in lower for k in flirty_keywords):
            flirty_score += 1
        if any(k in lower for k in argument_keywords):
            argument_score += 1

    avg_words = total_words / total_msgs if total_msgs else 0
    emojis_per_msg = emoji_count / total_msgs if total_msgs else 0
    questions_per_msg = question_count / total_msgs if total_msgs else 0

    # Energy match (how equal the effort is)
    if you_msgs == 0 and them_msgs == 0:
        energy_match = 0
    else:
        hi = max(you_msgs, them_msgs)
        lo = min(you_msgs, them_msgs)
        energy_match = round((lo / hi) * 100)

    # Ghosting risk based on recent streak of your messages at the end
    last_sender = messages[-1].sender if messages else None
    you_streak_last = 0
    if messages:
        for m in reversed(messages):
            if m.sender == "you":
                you_streak_last += 1
            else:
                break

    if not messages:
        ghost_risk = 0
    elif last_sender == "you":
        if you_streak_last >= 6:
            ghost_risk = 90
        elif you_streak_last >= 4:
            ghost_risk = 75
        elif you_streak_last >= 2:
            ghost_risk = 50
        else:
            ghost_risk = 30
    else:
        ghost_risk = 10

    return {
        "total_messages": total_msgs,
        "you_messages": you_msgs,
        "them_messages": them_msgs,
        "total_words": total_words,
        "avg_words": avg_words,
        "emoji_count": emoji_count,
        "emojis_per_msg": emojis_per_msg,
        "question_count": question_count,
        "questions_per_msg": questions_per_msg,
        "flirty_score": flirty_score,
        "argument_score": argument_score,
        "you_words": you_words,
        "them_words": them_words,
        "you_emojis": you_emojis,
        "them_emojis": them_emojis,
        "you_questions": you_questions,
        "them_questions": them_questions,
        "energy_match": energy_match,
        "last_sender": last_sender,
        "you_streak_last": you_streak_last,
        "ghost_risk": ghost_risk,
    }


# ====== ML VIBE ANALYSIS (with confidence) ======
def analyze_message_vibes(messages: List[Message]) -> dict:
    """
    Per-message ML vibes + raw counts + confidence-weighted top vibe.
    """
    vibe_items = []
    raw_counts = Counter()
    weighted_counts = Counter()

    for m in messages:
        label, conf = predict_vibe_with_conf(m.text)
        vibe_items.append({
            "sender": m.sender,
            "text": m.text,
            "vibe": label,
            "confidence": round(conf, 3),
        })
        raw_counts[label] += 1
        weighted_counts[label] += conf

    if weighted_counts:
        top_vibe = max(weighted_counts, key=weighted_counts.get)
    elif raw_counts:
        top_vibe = max(raw_counts, key=raw_counts.get)
    else:
        top_vibe = None

    return {
        "messages": vibe_items,
        "counts": dict(raw_counts),
        "weighted_counts": {k: round(v, 3) for k, v in weighted_counts.items()},
        "top_vibe": top_vibe,
    }


# ====== WILL THEY TEXT AGAIN ======
def estimate_will_they_text_again(features: dict, overall: str, you_label: str, them_label: str) -> int:
    total = features["total_messages"]
    you_msgs = features["you_messages"]
    them_msgs = features["them_messages"]

    ratio = you_msgs / max(them_msgs, 1) if them_msgs > 0 else 3.0

    # base on overall vibe
    if overall == "flirty_playful":
        base = 75
    elif overall == "friendly_chill":
        base = 65
    elif overall == "dry_drifting":
        base = 40
    elif overall == "awkward_forced":
        base = 35
    elif overall == "argument_tension":
        base = 55
    elif overall == "transactional_only":
        base = 45
    else:
        base = 50

    # adjust for who is more invested
    if them_label == "engaged":
        base += 10
    if you_label == "overinvested" and them_label == "dry":
        base -= 15
    if them_msgs == 0:
        base = 10  # they literally haven't replied

    # small bonus if convo is at least a bit long
    if total >= 20:
        base += 5

    return max(5, min(95, int(base)))


# ====== RULE-BASED LABELS (overall + you/them) ======
def rule_based_labels(features: dict) -> tuple[str, str, str, str, list[str]]:
    total = features["total_messages"]
    avg_words = features["avg_words"]
    emojis_per_msg = features["emojis_per_msg"]
    questions_per_msg = features["questions_per_msg"]
    flirty_score = features["flirty_score"]
    argument_score = features["argument_score"]
    you_msgs = features["you_messages"]
    them_msgs = features["them_messages"]

    signals: list[str] = []

    # overall label
    if total < 5:
        overall = "awkward_forced"
        signals.append("Very few messages, convo is still in shallow waters.")
    elif argument_score >= 2:
        overall = "argument_tension"
        signals.append("Argument / tension keywords detected.")
    elif flirty_score >= 2 or emojis_per_msg > 0.6:
        overall = "flirty_playful"
        signals.append("High flirty / emoji energy in the chat.")
    elif avg_words <= 4 and emojis_per_msg < 0.2:
        overall = "dry_drifting"
        signals.append("Short, low-emotion messages. Classic dry vibes.")
    elif questions_per_msg >= 0.35:
        overall = "friendly_chill"
        signals.append("Good amount of questions, convo is being kept alive.")
    else:
        overall = "transactional_only"
        signals.append("Mostly functional / info exchange, low emotional content.")

    # you / them labels
    if them_msgs == 0:
        you_label = "talking_to_yourself"
        them_label = "unknown"
        signals.append("Only your messages detected (or parser failed to see theirs).")
    else:
        ratio = you_msgs / max(them_msgs, 1)
        if ratio >= 2.5:
            you_label = "overinvested"
            them_label = "dry"
            signals.append("You send way more messages than them.")
        elif ratio <= 0.4:
            you_label = "cold"
            them_label = "engaged"
            signals.append("They are carrying the conversation more than you.")
        else:
            you_label = "balanced"
            them_label = "balanced"
            signals.append("Message count between you and them is fairly balanced.")

    # temporary verdict (will be overridden by brutal one below)
    verdict = "Mid vibes. Could go either way depending on what you do next."

    return overall, you_label, them_label, verdict, signals


# ====== BRUTAL, SARCASTIC VERDICT (fallback) ======
def brutal_verdict(
    overall: str,
    you_label: str,
    them_label: str,
    ghost_risk: int,
    will_they: int,
    top_vibe: str | None,
    total_msgs: int,
) -> str:
    """
    Short, blunt, slightly evil. Uses both rule-based labels + ML top_vibe.
    """

    # If it's literally just you
    if them_label == "unknown" or you_label == "talking_to_yourself":
        return "This isn’t a convo, it’s a diary. Stop texting essays to a ghost."

    # Very early convo
    if total_msgs < 5:
        return "Too early to romanticize this. Send a normal human message and chill."

    # High ghost risk
    if ghost_risk >= 80 and you_label == "overinvested":
        return "You’re speed-running getting ignored. Match their energy or exit the chat."

    # Flirty vibes overall
    if overall == "flirty_playful":
        if will_they >= 70:
            return "Vibes are good and mostly mutual. Don’t fumble it by spamming or trauma-dumping."
        if them_label == "dry":
            return "You’re flirting, they’re texting like HR. Ease off and see if they actually care."
        return "Fun energy, mostly mutual. Keep it light, not desperate."

    # Dry drifting
    if overall == "dry_drifting":
        if you_label == "overinvested":
            return "You’re writing paragraphs, they’re replying like a notification. Pull back."
        if them_label == "engaged":
            return "They’re trying more than you, which is wild. Reply less often, but with actual substance."
        return "Both of you are on low-power mode. Either start a real convo or let this fade with dignity."

    # Friendly chill
    if overall == "friendly_chill":
        if top_vibe == "flirty":
            return "Nice balance: friendly with a side of flirt. Don’t rush it, just don’t go MIA for 3 days."
        if you_label == "cold" and them_label == "engaged":
            return "They’re carrying the social skills. Decide if you’re interested or just bored."
        return "Solid, low-drama flow. If you want more, you’ll have to stop playing emotionally neutral."

    # Argument / tension
    if overall == "argument_tension":
        if top_vibe == "flirty":
            return "This is half fight, half foreplay. Decide which one you’re actually doing."
        if you_label == "overinvested":
            return "You’re more mad than this conversation is worth. Choose peace or block, not 17 messages."
        return "Tension is high. Either de-escalate like an adult or admit you enjoy the chaos."

    # Transactional
    if overall == "transactional_only":
        if top_vibe in ("flirty", "friendly"):
            return "You’re forcing emotions into a logistics chat. Either change the topic or accept it’s just surface-level."
        return "This is scheduling, not seduction. Don’t look for ‘signs’ in grocery-list texts."

    # Awkward forced
    if overall == "awkward_forced":
        if you_label == "overinvested":
            return "You’re trying to revive a corpse. Send one honest message, then stop chasing."
        return "Conversation is limping. Either say something real or let it die quietly."

    # Fallback
    return "Vibes are mid. If you keep doing the same thing, expect the same nothing."


# ====== AI VERDICT (Gemini) ======
def generate_ai_verdict(
    features: dict,
    overall: str,
    you_label: str,
    them_label: str,
    top_vibe: str | None,
    ml_vibes: dict,
) -> str:
    """
    Uses Gemini to generate a short, sarcastic, brutal verdict
    based ONLY on numeric stats + labels. Falls back to brutal_verdict()
    if Gemini is unavailable or errors.
    """
    # if Gemini not configured, just fall back
    if gemini_model is None:
        return brutal_verdict(
            overall=overall,
            you_label=you_label,
            them_label=them_label,
            ghost_risk=features.get("ghost_risk", 0),
            will_they=features.get("will_they_text_again", 50),
            top_vibe=top_vibe,
            total_msgs=features.get("total_messages", 0),
        )

    # Build a compact stats summary – NO raw messages
    stats_payload = {
        "overall_label": overall,
        "you_label": you_label,
        "them_label": them_label,
        "top_vibe": top_vibe,
        "total_messages": features.get("total_messages", 0),
        "you_messages": features.get("you_messages", 0),
        "them_messages": features.get("them_messages", 0),
        "energy_match": features.get("energy_match", 0),
        "ghost_risk": features.get("ghost_risk", 0),
        "will_they_text_again": features.get("will_they_text_again", 50),
        "avg_words": round(features.get("avg_words", 0), 2),
        "emoji_count": features.get("emoji_count", 0),
        "question_count": features.get("question_count", 0),
        "flirty_score": features.get("flirty_score", 0),
        "argument_score": features.get("argument_score", 0),
        "ml_counts": ml_vibes.get("counts", {}),
        "ml_weighted_counts": ml_vibes.get("weighted_counts", {}),
    }

    payload_str = json.dumps(stats_payload)

    prompt = f"""
You are a brutally honest, sarcastic friend roasting someone's chat game at 2AM.
You ONLY see numeric stats and labels from a conversation, not the messages themselves.

Here is the data (JSON):
{payload_str}

Rules for your answer:
- 1 or 2 sentences MAX. Keep it punchy.
- Tone: sharp, savage, a bit toxic but still playful.
- You may use light profanity like "shit", "hell", "ass", or "fuck" — but:
  - NO slurs.
  - NO attacks on looks, race, religion, gender, or mental health.
- No emojis. No hashtags. No motivational quotes.
- Do NOT mention internal labels like "awkward_forced", "dry_drifting", or "transactional_only" by name.
  Instead, say things like "awkward", "dry", "pure logistics", "argument vibes", etc.
- Talk directly to "you" (the user).
- Use the numbers: if ghost risk is high, call out chasing/overinvesting; if energy match is low, mention imbalance;
  if message counts are lopsided, roast the one doing the most emotional labour.
- If vibes are mutual, admit it, but still with attitude.

Give ONE short verdict line, nothing else.
"""

    try:
        res = gemini_model.generate_content(prompt)
        text = (res.text or "").strip()
        if not text:
            raise ValueError("Empty response from Gemini")
        # safety: compress multi-line into single line
        return " ".join(text.split())
    except Exception:
        # fall back to our deterministic brutal verdict
        return brutal_verdict(
            overall=overall,
            you_label=you_label,
            them_label=them_label,
            ghost_risk=features.get("ghost_risk", 0),
            will_they=features.get("will_they_text_again", 50),
            top_vibe=top_vibe,
            total_msgs=features.get("total_messages", 0),
        )


# ====== ROUTES ======
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "chat brain online"}


@app.post("/analyze_instagram")
def analyze_instagram(req: AnalyzeRequest):
    # old rule-based stats
    features = extract_features(req.messages)
    overall_label, you_label, them_label, old_verdict, signals = rule_based_labels(features)

    # ML vibes (with confidence)
    ml_vibes = analyze_message_vibes(req.messages)
    top_vibe = ml_vibes.get("top_vibe")

    # will they text again
    will_they = estimate_will_they_text_again(features, overall_label, you_label, them_label)
    features["will_they_text_again"] = will_they

    # AI verdict (Gemini) using only stats + labels, fallback to brutal_verdict
    verdict = generate_ai_verdict(
        features=features,
        overall=overall_label,
        you_label=you_label,
        them_label=them_label,
        top_vibe=top_vibe,
        ml_vibes=ml_vibes,
    )

    return {
        "overall_label": overall_label,
        "you_label": you_label,
        "them_label": them_label,
        "stats": features,
        "signals": signals,
        "verdict": verdict,
        "ml_vibes": ml_vibes,
    }
