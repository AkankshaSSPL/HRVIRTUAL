# Payroll Revamp — Plain-English Summary (for review)

Hi Akanksha 👋 — please read this and tell me if the **flow** matches how payroll
should actually work. No code here, just the story. If anything is wrong or missing,
mark it and we'll fix the plan before building.

---

## The problem in one line

Right now the system only knows **two kinds of people** — "Full-time employee" and
"Consultant" — and their salary rules are baked into the code. To add a new kind
(intern, contractor, etc.) or change a rule, a developer has to edit code. We want to
make it so **you can add types and change rules yourself from the screen.**

## The big idea: "Pay Types"

Think of a **Pay Type** as a *template for how someone gets paid*. Each Pay Type has:

- **A basis** — either "built from salary parts" (like a full-time employee) or "a flat
  monthly fee" (like a consultant).
- **A list of rules** — the earnings and deductions that make up the salary, in order.
- **Leave behaviour** — how many days count as a full month, and which parts shrink when
  someone takes unpaid leave.

Today's two behaviours become just **two saved Pay Types** ("Full Time" and
"Consultant"). Adding "Intern" or "Contractor" is then just **creating another Pay
Type** — no developer needed.

## How a salary is built (the flow)

```
1. Each employee is tagged with a Pay Type (Full Time / Consultant / Intern / …)
2. Payroll run starts for a month
3. For each person, the system loads THEIR Pay Type's rules
4. It adds up the earnings  → GROSS
5. It reduces pay for unpaid leave / absences (from the Leave & Attendance data)
6. It subtracts the deductions (PF, Professional Tax, TDS, etc.)   → NET
7. NET goes onto the bank sheet
```

Everything the system needs — the person's leave record, whether they're an employee or
consultant, and the pay rules — is read automatically. Nothing is typed in by hand
during the run.

## What the "parts" and "slabs" mean (plain words)

- **Salary parts (components):** Basic, HRA (house rent), Conveyance, Medical, Special
  Allowance. Added together = the gross salary. Some are a fixed amount, some are a
  percentage of Basic — all editable.
- **PF (EPF / Provident Fund):** a retirement saving — a fixed % of Basic is set aside.
  Full-time only.
- **Professional Tax (PT):** a small state tax based on income **slabs**. A "slab" is
  just a table: *earn between X and Y → pay this fixed amount*. Tiny amounts (a couple
  hundred rupees a month). Fully editable.
- **TDS:** income tax held back. For employees it's a monthly figure your CA provides;
  for consultants it's a flat percentage (e.g. 10%). Editable.

None of these numbers are fixed in code — they live in a **Settings** screen you can
change any time.

## Leaves and pay

- **Paid leave** (casual/paid) → salary is **not** reduced.
- **Unpaid leave / absent days** → those days are treated as "loss of pay" and the
  salary shrinks for those days.
- You can set the **yearly leave allowance** (e.g. 24 days a year) per leave type in the
  masters screen — for employees **and** consultants.
- Before approving payroll, you'll get a **"Review leaves & LOP"** view showing, per
  person: days worked, paid vs unpaid leave, and how much was deducted — so you can
  check it **before** the bank sheet is generated.

## Where you'll edit things (the screens)

- **Payroll → Settings tab (new):**
  - **Pay Types** — add/edit types and their rules.
  - **Statutory Config** — PF %, PT slabs, TDS %, working days.
  - **Assign salary structure to an employee** — pick their structure + CTC.
- **Masters page:** leave types + yearly allowance (already there).
- **Agent command:** you can also do the same things by typing, e.g. *"create a pay type
  Intern, flat fee, no PF, 5% TDS"* — it does exactly what the screen does.

## Payroll approval flow (unchanged, just clearer)

```
DRAFT  →  PENDING APPROVAL  →  APPROVED  →  BANK SHEET GENERATED  →  COMPLETED
```

The **bank sheet only unlocks after approval** — same as now. The new LOP review sits at
the DRAFT stage so you can verify before approving.

## Worked example

**Priya — Full Time, CTC ₹50,000/month, took 2 unpaid leave days in a 26-working-day
month.**
- Earnings built from her parts (Basic + HRA + …) = ₹50,000 gross.
- 2 unpaid days → pay shrinks by 2/26.
- PF (12% of Basic), Professional Tax (from the slab), TDS (from her CA figure)
  subtracted.
- Result → her **Net**, which lands on the bank sheet and the employee sheet.

**Rahul — Consultant, fee ₹40,000/month, base 20 working days, worked 18.**
- Fee ₹40,000, minus 2 days leave deduction (2/20 of the fee).
- Minus flat 10% TDS.
- Result → his **Net**, on the bank sheet and the consultant sheet.

**New: "Intern" pay type** — you create it in Settings (flat fee, no PF/PT, 5% TDS),
tag an intern with it, and payroll handles them automatically. No developer involved.

---

## What we're NOT changing
- The bank sheet, employee sheet, consultant sheet, and TDS sheet stay the same format.
- The approval flow stays the same.
- Existing Full Time / Consultant results stay **identical** after the change (we seed
  their rules to match today exactly, then verify the numbers match before/after).

## Please confirm
1. Is the **flow** (build gross → cut for unpaid leave → subtract deductions → net →
   bank sheet) correct?
2. Are **PF / PT slabs / TDS** described the way they should actually behave?
3. Is the **yearly leave allowance** editable-per-type (employee + consultant) what you
   want?
4. Anything missing for a "complete, proper" payroll run?
