from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def main() -> None:
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", data={"username": settings.admin_email, "password": settings.admin_password})
    print("login", login.status_code)
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    for command in ("Show employee list", "Update employee salary to 90000", "Generate May payroll"):
        response = client.post("/api/v1/agent-command/send", headers=headers, json={"user_message": command})
        data = response.json()
        print(command, response.status_code, data["status"], data["active_agent"], bool(data["approval_request_id"]))

    workflows = client.get("/api/v1/agent-command/workflows", headers=headers)
    print("workflows", workflows.status_code, len(workflows.json()))


if __name__ == "__main__":
    main()

