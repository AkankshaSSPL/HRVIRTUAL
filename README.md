Agentic HRMS Foundation
Enterprise-grade foundation for a true multi-agent HRMS platform.
Backend
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
.\\.venv\\Scripts\\Activate.ps1


c:\VirtualHR\venv\Scripts\activate.bat
"C:\VirtualHR - Copy\venv\Scripts\activate.bat"
pip install -r requirements.txt
alembic upgrade head
python scripts/seed_auth.py
uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Health: `http://127.0.0.1:8000/api/v1/health`
Frontend
```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```
App: `http://127.0.0.1:5173`
Docker
```powershell
docker compose -f infrastructure/docker-compose.yml up --build
```