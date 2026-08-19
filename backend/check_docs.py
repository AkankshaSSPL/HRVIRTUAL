import psycopg
conn = psycopg.connect('postgresql://hrms:hrmssecret@localhost:5432/hrms')
cur = conn.cursor()
cur.execute("SELECT id, first_name, last_name FROM employees WHERE first_name = 'Ashish' AND last_name = 'Shrivastav'")
ashish_id = cur.fetchone()[0]
print(f"Ashish ID: {ashish_id}")
cur.execute("SELECT id, document_type, created_at, status FROM employee_documents WHERE employee_id = %s", (ashish_id,))
for row in cur.fetchall():
    print(row)
