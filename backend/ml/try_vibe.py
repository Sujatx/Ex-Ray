import joblib

model = joblib.load("backend/ml/vibe_model.joblib")
vectorizer = joblib.load("backend/ml/vibe_vectorizer.joblib")

def predict_vibe(text: str):
    vec = vectorizer.transform([text])
    label = model.predict(vec)[0]
    proba = model.predict_proba(vec).max()
    return label, proba

if __name__ == "__main__":
    while True:
        msg = input("You: ")
        if msg.lower() in ["q", "quit", "exit"]:
            break
        label, confidence = predict_vibe(msg)
        print(f"Vibe → {label}   (conf: {confidence:.2f})")
