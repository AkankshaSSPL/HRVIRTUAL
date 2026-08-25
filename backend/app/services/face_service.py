"""
Face Recognition Service
MTCNN (detect) + InceptionResnetV1 (embed) + sklearn KNN (classify).

Models lazy-load on first use. Classifier retrains after every enroll/remove.
data/face_models/ is created automatically.
"""

import base64
import logging
import pickle
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from PIL import Image
from sklearn.neighbors import KNeighborsClassifier
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.auth.models import User

logger = logging.getLogger(__name__)


class FaceRecognitionService:

    def __init__(self) -> None:
        self._mtcnn = None
        self._resnet = None
        self._models_loaded = False
        self._device = None

    # ── Internals ─────────────────────────────────────────────────────────────

    def _load_models(self) -> None:
        if self._models_loaded:
            return
        import torch
        from facenet_pytorch import MTCNN, InceptionResnetV1

        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info("Loading face models on %s", self._device)
        self._mtcnn = MTCNN(image_size=160, margin=20, keep_all=False, device=self._device)
        self._resnet = InceptionResnetV1(pretrained="vggface2").eval().to(self._device)
        self._models_loaded = True

    def _models_dir(self) -> Path:
        p = Path(settings.face_models_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _classifier_path(self) -> Path:
        return self._models_dir() / "face_classifier.pkl"

    def _b64_to_pil(self, b64: str) -> Image.Image:
        return Image.open(BytesIO(base64.b64decode(b64))).convert("RGB")

    def _get_embedding(self, b64: str) -> Optional[np.ndarray]:
        """Decode image → MTCNN align → ResNet 512-dim embedding. None if no face."""
        import torch
        self._load_models()
        face = self._mtcnn(self._b64_to_pil(b64))
        if face is None:
            return None
        with torch.no_grad():
            emb = self._resnet(face.unsqueeze(0).to(self._device))
        return emb.cpu().numpy().flatten()

    def _load_classifier(self) -> Optional[KNeighborsClassifier]:
        p = self._classifier_path()
        return joblib.load(str(p)) if p.exists() else None

    # ── Public API ────────────────────────────────────────────────────────────

    def detect_faces(self, b64: str) -> dict:
        """Detect face bounding boxes. Frontend uses this to validate 1 face before capture."""
        self._load_models()
        boxes, _ = self._mtcnn.detect(self._b64_to_pil(b64))
        if boxes is None:
            return {"face_count": 0, "boxes": []}
        return {"face_count": len(boxes), "boxes": boxes.tolist()}

    def enroll_faces(self, user_id: str, images_b64: list[str], db: Session) -> int:
        """
        Enroll face images for a user.
        - Processes each image; skips frames with no face detected.
        - Appends to any existing embeddings (allows top-up enrollment).
        - Raises ValueError if total embeddings after combining < 3.
        - Stores pickle blob on User.face_embedding.
        - Sets face_registered=True, face_samples_count.
        Returns: total embeddings stored.
        """
        usr = db.scalar(
            select(User).where(User.id == uuid.UUID(user_id), User.deleted_at == None)
        )
        if not usr:
            raise ValueError(f"User {user_id} not found")

        new_embs: list[np.ndarray] = []
        for i, b64 in enumerate(images_b64):
            emb = self._get_embedding(b64)
            if emb is None:
                logger.warning("enroll: no face in image %d for %s", i, user_id)
                continue
            new_embs.append(emb)

        existing: list[np.ndarray] = pickle.loads(usr.face_embedding) if usr.face_embedding else []
        all_embs = existing + new_embs

        if len(all_embs) < 3:
            raise ValueError(
                f"Need ≥3 valid face images, got {len(all_embs)} "
                f"({len(existing)} existing + {len(new_embs)} new)"
            )

        usr.face_embedding = pickle.dumps(all_embs)
        usr.face_registered = True
        usr.face_samples_count = len(all_embs)
        db.commit()
        logger.info("Enrolled %d embeddings for %s (%s)", len(all_embs), user_id, usr.email)
        return len(all_embs)

    def remove_enrollment(self, user_id: str, db: Session) -> None:
        """Clear face enrollment. Call retrain_classifier() as BackgroundTask after this."""
        usr = db.scalar(
            select(User).where(User.id == uuid.UUID(user_id), User.deleted_at == None)
        )
        if not usr:
            raise ValueError(f"User {user_id} not found")
        usr.face_embedding = None
        usr.face_registered = False
        usr.face_samples_count = 0
        db.commit()
        logger.info("Removed face enrollment for %s", user_id)

    def recognize_face(self, b64: str) -> tuple[Optional[str], float]:
        """
        Identify who is in the image.
        Returns (email, distance). Returns (None, distance) if no match
        or distance > settings.face_distance_threshold.
        Lower distance = better match.
        """
        emb = self._get_embedding(b64)
        if emb is None:
            return None, 9999.0

        clf = self._load_classifier()
        if clf is None:
            logger.warning("recognize_face: no classifier — no one enrolled yet")
            return None, 9999.0

        emb_2d = emb.reshape(1, -1)
        label: str = clf.predict(emb_2d)[0]
        distance: float = float(clf.kneighbors(emb_2d, n_neighbors=1)[0][0][0])

        if distance > settings.face_distance_threshold:
            logger.info("recognize_face: distance %.4f > threshold — no match", distance)
            return None, distance

        logger.info("recognize_face: matched %s (distance %.4f)", label, distance)
        return label, distance

    def retrain_classifier(self) -> None:
        """
        Rebuild KNN from all enrolled, non-deleted users.
        Opens its own DB session — safe to use as a FastAPI BackgroundTask.
        """
        db = SessionLocal()
        try:
            users = db.scalars(
                select(User).where(
                    User.face_embedding != None,  # noqa: E711
                    User.deleted_at == None,
                )
            ).all()

            if not users:
                logger.warning("retrain_classifier: no enrolled users — skipping")
                return

            X, y = [], []
            for usr in users:
                for emb in pickle.loads(usr.face_embedding):
                    X.append(emb)
                    y.append(usr.email)

            k = min(3, len(set(y)))
            clf = KNeighborsClassifier(n_neighbors=k, metric="euclidean")
            clf.fit(np.array(X), y)
            joblib.dump(clf, str(self._classifier_path()))
            logger.info("retrain_classifier: %d embeddings, %d users", len(X), len(set(y)))
        finally:
            db.close()


# Module-level singleton
face_service = FaceRecognitionService()