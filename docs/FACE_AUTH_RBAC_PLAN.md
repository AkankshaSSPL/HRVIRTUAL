# Face Authentication Integration Plan — HRVIRTUAL

**Source of face auth code:** `agentichrms-rolebased_demochatbot` (branch: `facerecognition`)
**Target repo:** HRVIRTUAL
**Implementation branch:** `feat/face-auth`
**Stack:** MTCNN + InceptionResnetV1 (facenet_pytorch) + sklearn KNN

---

## What This Covers

1. Face enrollment during / after employee creation (HR-gated)
2. Employee self-enrollment from their own profile
3. Face login as an alternative to email + password
4. Face login audit logging (every attempt, pass or fail)
5. Face removal (self-service and HR/Admin)
6. KNN classifier auto-retrain after every enroll/remove
7. Three new RBAC permissions wired into the existing DB-backed permission system

---

## HRVIRTUAL — What Already Exists (Do Not Touch)

| What | Where |
|---|---|
| JWT auth — `create_access_token`, `issue_tokens`, `TokenResponse` | `app/core/security.py`, `app/services/auth_service.py` |
| RBAC — 5 roles, 21 permissions, `require_permissions()` dep, DB-backed | `app/api/deps.py`, `app/services/auth_service.py` |
| Seed script — `seed_auth_data()` | `scripts/seed_auth.py` |
| Employee model — UUID PK, `user_id` FK, `official_email` | `app/models/employee/models.py` |
| User model — linked 1:1 to Employee | `app/models/auth/models.py` |
| `BaseModel` — UUID id, tenant_id, created_at, updated_at, deleted_at | `app/models/base.py` |

All existing endpoints, agents, payroll, attendance, leave — **untouched**.

---

## Key Adaptation Points (agentichrms → HRVIRTUAL)

| agentichrms | HRVIRTUAL |
|---|---|
| Integer primary keys | UUID primary keys (`Mapped[uuid.UUID]`, `UUID(as_uuid=True)`) |
| `Column(Integer, ...)` style | `mapped_column(...)` with `Mapped[type]` (SQLAlchemy 2.0) |
| `from backend.core.config import settings` | `from app.core.config import settings` |
| `from backend.db.session import SessionLocal` | `from app.db.session import SessionLocal` |
| `employee.email` as KNN label | `employee.official_email` as KNN label |
| `FaceLoginAttempt` with Integer FKs | `FaceLoginAttempt` with UUID FKs |

---

## Step 0 — Create Branch

```bash
cd D:\gunesh_dev\dev\temp\WorkingHRMS\HRVIRTUAL
git checkout main && git pull origin main
git checkout -b feat/face-auth
```

---

## Step 1 — Python Requirements

**File:** `backend/requirements.txt` — append:

```
facenet-pytorch>=2.5.3
torch>=2.0.0
torchvision>=0.15.0
joblib>=1.3.0
scikit-learn>=1.4.0
numpy>=1.26.0
Pillow>=10.2.0
```

Verify after install:
```bash
python -c "from facenet_pytorch import MTCNN, InceptionResnetV1; print('OK')"
```

---

## Step 2 — Config Settings

**File:** `backend/app/core/config.py`

Add inside `Settings` class after the `email_enabled` field:

```python
# Face authentication
face_models_dir: str = Field(default="data/face_models", validation_alias="FACE_MODELS_DIR")
face_distance_threshold: float = Field(default=1.2, validation_alias="FACE_DISTANCE_THRESHOLD")
```

The `data/face_models/` directory is created automatically by the face service on first enrollment.

---

## Step 3 — Database Model Changes

### 3a. Add face columns to Employee

**File:** `backend/app/models/employee/models.py`

Add `LargeBinary` to the sqlalchemy imports line.

Add these columns inside `class Employee(BaseModel)`:

```python
# Face biometric
face_embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
face_registered: Mapped[bool] = mapped_column(
    Boolean, default=False, nullable=False, server_default="false"
)
face_samples_count: Mapped[int] = mapped_column(
    Integer, default=0, nullable=False, server_default="0"
)
face_login_attempts: Mapped[list["FaceLoginAttempt"]] = relationship(
    "FaceLoginAttempt", back_populates="employee", cascade="all, delete-orphan"
)
```

`"FaceLoginAttempt"` is a forward ref — resolves because both files are imported
by `app/db/base.py` before Alembic or SQLAlchemy resolves relationships.

### 3b. Add FaceLoginAttempt model

**File:** `backend/app/models/auth/models.py`

Add `Float` to the sqlalchemy imports. Add this class at the bottom of the file,
after `RefreshToken`:

```python
class FaceLoginAttempt(BaseModel):
    """One row per face login attempt — pass or fail."""

    __tablename__ = "face_login_attempts"
    __table_args__ = (
        Index("ix_face_login_attempts_employee_id", "employee_id"),
        Index("ix_face_login_attempts_success", "success"),
    )

    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
    )
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    employee: Mapped["Employee | None"] = relationship(
        "Employee", back_populates="face_login_attempts"
    )
```

### 3c. Register model for Alembic

**File:** `backend/app/db/base.py`

Add one line at the bottom of the imports block:

```python
from app.models.auth.models import FaceLoginAttempt  # noqa: F401
```

### 3d. Generate and run migration

```bash
cd backend
alembic revision --autogenerate -m "add_face_auth_columns_and_table"
# Review the generated file — confirm it adds:
#   employees: face_embedding (LargeBinary nullable)
#              face_registered (Boolean not null, server_default false)
#              face_samples_count (Integer not null, server_default 0)
#   table: face_login_attempts (all columns above)
alembic upgrade head
```

Verify in psql:
```sql
\d employees           -- see face_embedding, face_registered, face_samples_count
\d face_login_attempts -- see the new table
```

---

## Step 4 — Face Service

**File:** `backend/app/services/face_service.py` (new file)

Full content:

```python
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
from app.models.employee.models import Employee

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

    def enroll_faces(self, employee_id: str, images_b64: list[str], db: Session) -> int:
        """
        Enroll face images for an employee.
        - Processes each image; skips frames with no face detected.
        - Appends to any existing embeddings (allows top-up enrollment).
        - Raises ValueError if total embeddings after combining < 3.
        - Stores pickle blob on Employee.face_embedding.
        - Sets face_registered=True, face_samples_count.
        Returns: total embeddings stored.
        """
        emp = db.scalar(
            select(Employee).where(Employee.id == uuid.UUID(employee_id), Employee.deleted_at == None)
        )
        if not emp:
            raise ValueError(f"Employee {employee_id} not found")

        new_embs: list[np.ndarray] = []
        for i, b64 in enumerate(images_b64):
            emb = self._get_embedding(b64)
            if emb is None:
                logger.warning("enroll: no face in image %d for %s", i, employee_id)
                continue
            new_embs.append(emb)

        existing: list[np.ndarray] = pickle.loads(emp.face_embedding) if emp.face_embedding else []
        all_embs = existing + new_embs

        if len(all_embs) < 3:
            raise ValueError(
                f"Need ≥3 valid face images, got {len(all_embs)} "
                f"({len(existing)} existing + {len(new_embs)} new)"
            )

        emp.face_embedding = pickle.dumps(all_embs)
        emp.face_registered = True
        emp.face_samples_count = len(all_embs)
        db.commit()
        logger.info("Enrolled %d embeddings for %s (%s)", len(all_embs), employee_id, emp.official_email)
        return len(all_embs)

    def remove_enrollment(self, employee_id: str, db: Session) -> None:
        """Clear face enrollment. Call retrain_classifier() as BackgroundTask after this."""
        emp = db.scalar(
            select(Employee).where(Employee.id == uuid.UUID(employee_id), Employee.deleted_at == None)
        )
        if not emp:
            raise ValueError(f"Employee {employee_id} not found")
        emp.face_embedding = None
        emp.face_registered = False
        emp.face_samples_count = 0
        db.commit()
        logger.info("Removed face enrollment for %s", employee_id)

    def recognize_face(self, b64: str) -> tuple[Optional[str], float]:
        """
        Identify who is in the image.
        Returns (official_email, distance). Returns (None, distance) if no match
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
        Rebuild KNN from all enrolled, non-deleted employees.
        Opens its own DB session — safe to use as a FastAPI BackgroundTask.
        """
        db = SessionLocal()
        try:
            employees = db.scalars(
                select(Employee).where(
                    Employee.face_embedding != None,  # noqa: E711
                    Employee.deleted_at == None,
                )
            ).all()

            if not employees:
                logger.warning("retrain_classifier: no enrolled employees — skipping")
                return

            X, y = [], []
            for emp in employees:
                for emb in pickle.loads(emp.face_embedding):
                    X.append(emb)
                    y.append(emp.official_email)

            k = min(3, len(set(y)))
            clf = KNeighborsClassifier(n_neighbors=k, metric="euclidean")
            clf.fit(np.array(X), y)
            joblib.dump(clf, str(self._classifier_path()))
            logger.info("retrain_classifier: %d embeddings, %d employees", len(X), len(set(y)))
        finally:
            db.close()


# Module-level singleton
face_service = FaceRecognitionService()
```

---

## Step 5 — Add Face Permissions to RBAC

**File:** `backend/app/services/auth_service.py`

### 5a. Add to `PERMISSIONS` dict (3 new entries)

```python
"face:enroll": "Enroll and remove employee face biometrics",
"face:view_logs": "View face login attempt audit log",
"face:retrain": "Trigger face KNN classifier retrain",
```

### 5b. Update `ROLE_PERMISSION_CODES`

- `"Super Admin"` — already `list(PERMISSIONS)`, gets all three automatically
- `"HR Admin"` — add `"face:enroll"`, `"face:view_logs"`
- `"HR Executive"` — add `"face:enroll"`, `"face:view_logs"`
- `"Manager"` — no change
- `"Employee"` — no change

### 5c. Re-seed

```bash
cd backend && python -m scripts.seed_auth
```

`seed_auth_data()` replaces `role.permissions` on each run, so the new permissions
apply automatically. Verify:

```sql
SELECT r.name, p.code FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE p.code LIKE 'face:%'
  ORDER BY r.name;
```

---

## Step 6 — Backend Endpoints

### 6a. Public face auth — `face_auth.py` (new)

**File:** `backend/app/api/v1/endpoints/face_auth.py`

**Endpoints:**

```
POST /api/v1/face-auth/login
  No auth required. Body: { image_base64: str }
  Flow:
    1. face_service.recognize_face(image) → (official_email, distance)
    2. Write FaceLoginAttempt(success=False, ...) + raise 401 if no match
    3. Lookup Employee by official_email (not soft-deleted)
    4. Lookup User via Employee.user_id — raise 401 if missing or inactive
    5. Write FaceLoginAttempt(success=True, employee_id, confidence_score)
    6. AuthService(db).issue_tokens(user) → return TokenResponse
  Returns: TokenResponse — same schema as POST /api/v1/auth/login

POST /api/v1/face-auth/detect
  No auth required. Body: { image_base64: str }
  Returns: { face_count: int, boxes: list[list[float]] }
  Frontend uses this to validate exactly 1 face before every capture.
```

Log `request.client.host` and `request.headers.get("user-agent")` on every attempt.

### 6b. Self-service — `face_self.py` (new)

**File:** `backend/app/api/v1/endpoints/face_self.py`

**Endpoints:**

```
POST /api/v1/face-auth/me/enroll
  Auth: any valid JWT (get_current_user)
  Body: { images_base64: list[str] }  — validator: len >= 3
  Flow:
    1. Lookup Employee WHERE user_id == current_user.id AND deleted_at IS NULL
    2. face_service.enroll_faces(str(employee.id), images, db)
    3. BackgroundTasks.add_task(face_service.retrain_classifier)
  Returns: { success: true, embeddings_stored: int, message: str }

DELETE /api/v1/face-auth/me/face
  Auth: any valid JWT
  Flow:
    1. Lookup Employee via user_id
    2. Raise 400 if not face_registered
    3. face_service.remove_enrollment(str(employee.id), db)
    4. BackgroundTasks.add_task(face_service.retrain_classifier)
  Returns: { success: true, message: str }
```

### 6c. Admin/HR management — `face_admin.py` (new)

**File:** `backend/app/api/v1/endpoints/face_admin.py`

**Endpoints:**

```
POST /api/v1/face-auth/employees/{employee_id}/enroll
  Auth: require_permissions("face:enroll")  [HR Admin, HR Executive, Super Admin]
  Body: { images_base64: list[str] }  — validator: len >= 3
  Path: employee_id (UUID)
  Flow:
    1. Lookup Employee by UUID → 404 if not found/deleted
    2. face_service.enroll_faces(str(employee_id), images, db)
    3. BackgroundTasks.add_task(face_service.retrain_classifier)
  Returns: { success, employee_id, employee_name, embeddings_stored }

DELETE /api/v1/face-auth/employees/{employee_id}/face
  Auth: require_permissions("face:enroll")
  Flow:
    1. Lookup Employee → 404 if not found
    2. Raise 400 if not face_registered
    3. face_service.remove_enrollment(str(employee_id), db)
    4. BackgroundTasks.add_task(face_service.retrain_classifier)
  Returns: { success, message }

GET /api/v1/face-auth/attempts
  Auth: require_permissions("face:view_logs")  [HR Admin, HR Executive, Super Admin]
  Query params: employee_id (UUID, optional), success (bool, optional), limit (int, default=100)
  Returns: list of { id, employee_id, employee_name, success, confidence_score,
                     ip_address, failure_reason, attempted_at }
  Sorted: newest first. Excludes soft-deleted attempts.

POST /api/v1/face-auth/retrain
  Auth: require_permissions("face:retrain")  [Super Admin only]
  BackgroundTasks.add_task(face_service.retrain_classifier)
  Returns: { message: "Classifier retrain scheduled" }
```

### 6d. Wire into router

**File:** `backend/app/api/v1/router.py`

```python
from app.api.v1.endpoints import face_auth, face_admin, face_self

api_router.include_router(face_auth.router, prefix="/face-auth", tags=["face-auth"])
api_router.include_router(face_self.router, prefix="/face-auth", tags=["face-auth"])
api_router.include_router(face_admin.router, prefix="/face-auth", tags=["face-auth-admin"])
```

**All final endpoint paths:**
- `POST /api/v1/face-auth/login` — public
- `POST /api/v1/face-auth/detect` — public
- `POST /api/v1/face-auth/me/enroll` — any authenticated user
- `DELETE /api/v1/face-auth/me/face` — any authenticated user
- `POST /api/v1/face-auth/employees/{id}/enroll` — face:enroll
- `DELETE /api/v1/face-auth/employees/{id}/face` — face:enroll
- `GET /api/v1/face-auth/attempts` — face:view_logs
- `POST /api/v1/face-auth/retrain` — face:retrain

---

## Step 7 — Frontend Service Layer

**File:** `frontend/src/services/faceAuth.ts` (new file)

```typescript
import { useAuthStore } from "@/stores/authStore";
import type { TokenResponse } from "@/types/auth";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001/api/v1";

/** Convert HTMLCanvasElement to base64 JPEG string (no data: prefix) */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
}

export async function detectFaces(
  imageBase64: string
): Promise<{ face_count: number; boxes: number[][] }> {
  const res = await fetch(`${API_BASE_URL}/face-auth/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  if (!res.ok) throw new Error("Face detection failed");
  return res.json();
}

export async function faceLoginRequest(imageBase64: string): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE_URL}/face-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Face not recognized");
  }
  return res.json();
}

export async function selfEnroll(imagesBase64: string[]): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE_URL}/face-auth/me/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ images_base64: imagesBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Enrollment failed");
  }
}

export async function selfRemoveFace(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE_URL}/face-auth/me/face`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Removal failed");
  }
}

export async function adminEnrollFace(
  employeeId: string,
  imagesBase64: string[]
): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE_URL}/face-auth/employees/${employeeId}/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ images_base64: imagesBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Enrollment failed");
  }
}

export async function adminRemoveFace(employeeId: string): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_BASE_URL}/face-auth/employees/${employeeId}/face`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Removal failed");
  }
}

export type FaceAttempt = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  success: boolean;
  confidence_score: number | null;
  ip_address: string | null;
  failure_reason: string | null;
  attempted_at: string;
};

export async function getFaceAttempts(params?: {
  employee_id?: string;
  success?: boolean;
  limit?: number;
}): Promise<FaceAttempt[]> {
  const token = useAuthStore.getState().accessToken;
  const qs = new URLSearchParams();
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.success !== undefined) qs.set("success", String(params.success));
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE_URL}/face-auth/attempts?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load face attempts");
  return res.json();
}
```

---

## Step 8 — Shared FaceCaptureModal Component

**File:** `frontend/src/components/FaceCaptureModal.tsx` (new)

Reusable modal for self-enrollment and HR/Admin enrollment.

**Props:**
```typescript
type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (images: string[]) => Promise<void>;  // throws on error
  targetCount?: number;   // default 5
  title?: string;
  description?: string;
};
```

**Behaviour:**
1. On `open=true` → `getUserMedia({ video: { facingMode: "user" } })` → render in `<video>`
2. "Capture Photo" button → draw current frame to hidden `<canvas>` → call `detectFaces(b64)`
   - If `face_count !== 1` → show inline error, do not add frame
   - If `face_count === 1` → append to `frames[]`, clear error
3. Progress dots (N filled dots out of targetCount)
4. When `frames.length >= targetCount` → show "Submit Enrollment" button
5. Submit → call `onCapture(frames)` → parent handles success/error/close
6. "Cancel" stops stream and calls `onClose()`

Tech: `navigator.mediaDevices.getUserMedia` only — no external camera library.
Uses existing `Dialog`, `Button` from `@/components/ui`.

---

## Step 9 — LoginPage: Face Login Tab

**File:** `frontend/src/pages/LoginPage.tsx`

Add a "Password | Face Login" toggle at the top of the login card form.

**New state:**
```tsx
const [loginMode, setLoginMode] = useState<"password" | "face">("password");
const [faceError, setFaceError] = useState<string | null>(null);
const [faceCapturing, setFaceCapturing] = useState(false);
const videoRef = useRef<HTMLVideoElement>(null);
const canvasRef = useRef<HTMLCanvasElement>(null);
const streamRef = useRef<MediaStream | null>(null);
```

**Webcam lifecycle (useEffect on `loginMode`):**
- `loginMode === "face"` → call `getUserMedia` → assign to `videoRef.current.srcObject`
- On cleanup or switch to "password" → stop all tracks

**Face login handler:**
```
1. Draw videoRef frame to canvasRef
2. canvasToBase64(canvas) → b64
3. detectFaces(b64) → if face_count !== 1, setFaceError, return
4. faceLoginRequest(b64) → TokenResponse
5. sessionStorage.setItem("agentic_hrms_refresh_token", tokens.refresh_token)
6. meRequest(tokens.access_token) → user
7. useAuthStore.setState({ accessToken, refreshToken, user, status: "authenticated" })
8. navigate(from, { replace: true })
```

**UI structure inside login card:**
```
┌─────────────────────────────────────┐
│  [ Password ]  [ Face Login ]       │  ← toggle buttons
│                                     │
│  -- Password mode (existing form) --│
│  Email: [_________________]         │
│  Password: [_____________]          │
│  [Sign In]                          │
│                                     │
│  -- Face mode --                    │
│  ┌───────────────────────────────┐  │
│  │        [Camera feed]          │  │
│  └───────────────────────────────┘  │
│  [Login with Face]                  │
│  (error message if any)             │
└─────────────────────────────────────┘
```

---

## Step 10 — EmployeeViewPage: Face Biometric Tab

**File:** `frontend/src/pages/EmployeeViewPage.tsx`

Add `"face"` to `TabKey` type and a `{ key: "face", label: "Face Biometric" }` entry
to the `TABS` array.

When `activeTab === "face"`, render `<FaceBiometricTab employee={employee} />`.

**File:** `frontend/src/components/employees/FaceBiometricTab.tsx` (new)

**Props:** `{ employee: Employee }` where Employee has `id`, `face_registered`,
`face_samples_count`, `user_id`.

**Logic:**
- `canManage = useAuthStore().hasPermission("face:enroll")`
- `isSelf = user?.id === employee.user_id`  (viewing own profile)
- Show either self-service or admin-service calls accordingly

**Layout:**
```
┌─────────────────────────────────────────────┐
│  [Shield icon]  Face Enrolled               │  ← green if enrolled
│                 12 face samples stored      │
├─────────────────────────────────────────────┤
│  [Enroll Face]  [Remove Enrollment]         │  ← only if canManage || isSelf
├─────────────────────────────────────────────┤
│  success/error message                      │
└─────────────────────────────────────────────┘
```

"Enroll Face" → opens `<FaceCaptureModal>` → calls `adminEnrollFace` or `selfEnroll`
depending on `isSelf`.

"Remove Enrollment" → `window.confirm` → calls `adminRemoveFace` or `selfRemoveFace`.

After success → `queryClient.invalidateQueries({ queryKey: ["employee", employee.id] })`
to refresh data.

---

## Step 11 — EmployeesPage: Face Status Column

**File:** `frontend/src/pages/EmployeesPage.tsx`

Add a column to the employee table (after "Status"):

```tsx
{
  header: "Face",
  cell: ({ row }) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      row.original.face_registered
        ? "bg-emerald-100 text-emerald-700"
        : "bg-slate-100 text-slate-500"
    }`}>
      {row.original.face_registered ? "Enrolled" : "None"}
    </span>
  ),
},
```

Also add `face_registered: boolean` and `face_samples_count: number` to the
Employee TypeScript type in `frontend/src/services/employees.ts`.

---

## Step 12 — Employee Response Schema

**File:** `backend/app/schemas/employees.py`

Find the schema used for `GET /api/v1/employees` list responses. Add to the response model:

```python
face_registered: bool = False
face_samples_count: int = 0
```

These fields come directly from the ORM model — they just need to be declared in the
Pydantic response schema for FastAPI to serialize them.

---

## Files Changed Summary

```
NEW — backend
  backend/app/services/face_service.py
  backend/app/api/v1/endpoints/face_auth.py
  backend/app/api/v1/endpoints/face_self.py
  backend/app/api/v1/endpoints/face_admin.py
  backend/alembic/versions/<timestamp>_add_face_auth_columns_and_table.py

MODIFIED — backend
  backend/requirements.txt                    +torch, facenet-pytorch, joblib, scikit-learn, numpy, Pillow
  backend/app/core/config.py                  +face_models_dir, face_distance_threshold
  backend/app/models/employee/models.py       +face columns + relationship on Employee
  backend/app/models/auth/models.py           +FaceLoginAttempt class
  backend/app/db/base.py                      +FaceLoginAttempt import
  backend/app/services/auth_service.py        +face:enroll, face:view_logs, face:retrain
  backend/app/api/v1/router.py               +3 new routers

NEW — frontend
  frontend/src/services/faceAuth.ts
  frontend/src/components/FaceCaptureModal.tsx
  frontend/src/components/employees/FaceBiometricTab.tsx

MODIFIED — frontend
  frontend/src/pages/LoginPage.tsx            +face login tab with webcam
  frontend/src/pages/EmployeeViewPage.tsx     +Face Biometric tab
  frontend/src/pages/EmployeesPage.tsx        +face_registered column
  frontend/src/services/employees.ts          +face_registered, face_samples_count types

UNTOUCHED
  All existing auth endpoints, JWT flow, employee CRUD, RBAC models,
  agents, payroll, attendance, leave, approvals — zero changes.
```

---

## End-to-End Verification Checklist

### Backend

```
[ ] pip install -r requirements.txt — no errors
[ ] python -c "from app.services.face_service import face_service; print('OK')"
[ ] alembic upgrade head — 0 errors
[ ] psql: \d employees — shows face_embedding, face_registered, face_samples_count
[ ] psql: \d face_login_attempts — table exists
[ ] python -m scripts.seed_auth — success
[ ] psql: SELECT code FROM permissions WHERE code LIKE 'face:%';
    → face:enroll, face:view_logs, face:retrain
[ ] uvicorn app.main:app --reload — server starts, no import errors
[ ] GET /api/v1/auth/me (HR Admin token) → permissions includes "face:enroll"
[ ] POST /api/v1/face-auth/detect (base64 image) → { face_count, boxes }
[ ] POST /api/v1/face-auth/employees/{id}/enroll (HR Admin, 5 images) → 200
    → psql: SELECT face_registered FROM employees WHERE id = '...' → true
    → data/face_models/face_classifier.pkl created
[ ] POST /api/v1/face-auth/employees/{id}/enroll (Employee token) → 403
[ ] POST /api/v1/face-auth/login (enrolled employee image) → 200, TokenResponse
[ ] POST /api/v1/face-auth/login (unknown face image) → 401
    → psql: SELECT * FROM face_login_attempts; → 2 rows (1 success, 1 fail)
[ ] GET /api/v1/face-auth/attempts (HR Admin) → returns both rows
[ ] POST /api/v1/face-auth/me/enroll (employee token, 5 images) → 200
[ ] DELETE /api/v1/face-auth/me/face → 200, face_registered = false
[ ] DELETE /api/v1/face-auth/employees/{id}/face (HR Admin) → 200
```

### Frontend

```
[ ] LoginPage shows "Password | Face Login" toggle
[ ] Switch to Face Login → webcam opens
[ ] Click "Login with Face" → captures → sends → redirects to /dashboard on success
[ ] EmployeesPage table shows "Face" column (Enrolled / None badge)
[ ] EmployeeViewPage → "Face Biometric" tab renders
[ ] Face Biometric tab shows enrolled status and sample count correctly
[ ] "Enroll Face" button → FaceCaptureModal opens → camera active
[ ] Capture with 0 faces → error "No face detected"
[ ] Capture with 2 faces → error "Multiple faces"
[ ] 5 valid captures → "Submit Enrollment" enabled
[ ] Submit → employee shows "Face Enrolled", sample count updated
[ ] "Remove Enrollment" → confirm → employee shows "Not Enrolled"
```
