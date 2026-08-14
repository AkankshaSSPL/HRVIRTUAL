import asyncio
from app.db.session import SessionLocal
from app.agents.employee_agent.service import EmployeeAgent
import uuid

def test():
    db = SessionLocal()
    agent = EmployeeAgent(db)
    command = "update Nikita's email to nikita.b@example.com"
    response = agent.execute(
        action="update",
        command=command,
        user_id=uuid.uuid4(),
        workflow_id="test-workflow-123"
    )
    print(response)

if __name__ == "__main__":
    test()
