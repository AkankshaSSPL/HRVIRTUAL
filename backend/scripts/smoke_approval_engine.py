from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def main() -> None:
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    print("login", login.status_code)
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    create = client.post(
        "/api/v1/approvals/create",
        headers=headers,
        json={
            "module_name": "employee",
            "action_name": "update",
            "payload_json": {"employee": "Rahul", "salary": 90000},
            "approval_reason": "Salary change is a critical action",
        },
    )
    print("create", create.status_code)
    item = create.json()
    print(item["status"], item["execution_status"])

    pending = client.get("/api/v1/approvals/pending", headers=headers)
    print("pending", pending.status_code, len(pending.json()))

    approve = client.post(
        f"/api/v1/approvals/{item['id']}/approve",
        headers=headers,
        json={"comment": "Approved by HR"},
    )
    print("approve", approve.status_code, approve.json()["status"])

    resume = client.post(f"/api/v1/approvals/{item['id']}/resume-workflow", headers=headers)
    resumed = resume.json()
    print("resume", resume.status_code, resumed["status"], resumed["execution_status"], len(resumed["events"]))


if __name__ == "__main__":
    main()

