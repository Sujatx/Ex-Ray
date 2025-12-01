import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
import joblib

# 1. Load data
df = pd.read_csv("datasets/hinglish.csv")

X = df["text"]
y = df["label"]

# 2. Split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 3. Vectorizer
vectorizer = TfidfVectorizer(
    lowercase=True,
    ngram_range=(1, 2),
    min_df=2
)

X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

# 4. Model
model = LogisticRegression(max_iter=500)
model.fit(X_train_vec, y_train)

# 5. Eval
y_pred = model.predict(X_test_vec)
print(classification_report(y_test, y_pred))

# 6. Save
joblib.dump(model, "backend/ml/vibe_model.joblib")
joblib.dump(vectorizer, "backend/ml/vibe_vectorizer.joblib")

print("✅ Saved: backend/ml/vibe_model.joblib & backend/ml/vibe_vectorizer.joblib")
