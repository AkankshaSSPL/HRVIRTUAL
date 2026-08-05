import sys
sys.path.append('.')
from app.db.session import SessionLocal
from app.services.payroll_computation import compute_payroll_run

db = SessionLocal()
line_items, skipped = compute_payroll_run(db, 8, 2026)
print(f"Processed: {len(line_items)}, Skipped: {skipped}")
for item in line_items:
    bd = item.get("breakdown_json", {})
    print(f"  Employee: {item['employee_id']}")
    print(f"    Gross: {item['gross_salary']}")
    print(f"    Earnings: {bd.get('earnings', {})}")
    print(f"    Deductions: {bd.get('statutory_deductions', {})}")
    print(f"    Net: {item['net_salary']}")
