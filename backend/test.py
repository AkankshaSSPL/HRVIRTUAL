import sys
sys.path.append('.')
from app.agents.attendance_agent.llm import llm_extract_attendance
from dotenv import load_dotenv

load_dotenv()

cases = [
    "please mark absent for Gunesh today",
    "mark Gunesh absent",
    "Gunesh took a half day yesterday",
    "show attendance for Nikita this month"
]

for c in cases:
    print(f"Query: {c}")
    try:
        extracted = llm_extract_attendance(c)
        print(f"Extracted: {extracted}")
    except Exception as e:
        print(f"Error: {e}")
    print("-" * 20)
