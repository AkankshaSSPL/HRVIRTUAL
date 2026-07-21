from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def main() -> None:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", data={"username": settings.admin_email, "password": settings.admin_password})
    print("login", login.status_code)
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    registry = client.get("/api/v1/agents/registry", headers=headers)
    print("registry", registry.status_code, len(registry.json()))

    inspect_run = client.post(
        "/api/v1/agents/command",
        headers=headers,
        json={"command": "Inspect attendance anomalies for this week"},
    )
    print("inspect", inspect_run.status_code, inspect_run.json()["workflow_status"], inspect_run.json()["current_agent"])

    approval_run = client.post(
        "/api/v1/agents/command",
        headers=headers,
        json={"command": "Update Rahul salary to 90000"},
    )
    approval_data = approval_run.json()
    print(
        "approval",
        approval_run.status_code,
        approval_data["workflow_status"],
        approval_data["approval_request_id"] is not None,
    )

    events = client.get(f"/api/v1/agents/workflows/{approval_data['workflow_id']}/events", headers=headers)
    print("events", events.status_code, len(events.json()))


if __name__ == "__main__":
    main()

