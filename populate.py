#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

# 1) import your real app
from app import app

# 2) path to your spreadsheet
EXCEL_PATH = Path(__file__).parent / "invoices_valid.xlsx"

# 3) admin credentials
ADMIN_USER = "pablo"
ADMIN_PASS = "123"


def main():
    # load the sheet into a list of dicts
    df = pd.read_excel(EXCEL_PATH, engine="openpyxl")
    rows = df.to_dict(orient="records")

    # 4) use Flask's test_client
    with app.test_client() as client:
        # 4a) log in
        login_resp = client.post(
            "/login",
            data={"username": ADMIN_USER, "password": ADMIN_PASS},
            follow_redirects=True,
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.status_code}"

        print(f"✅ Logged in as {ADMIN_USER}. Now creating jobs…")

        # 4b) hit your JSON API
        for i, row in enumerate(rows, start=1):
            payload = {
                "job_number": str(row["Num"]),
                "client": row["Client"],
                "address": row["Address"],
                "status": "Invoiced",
            }
            resp = client.post("/admin/api/jobs", json=payload)
            if resp.status_code in (200, 201):
                print(f"[{i:3d}] ✔️ Created {row['Num']}")
            else:
                print(
                    f"[{i:3d}] ❌ Failed {row['Num']}: "
                    f"{resp.status_code} {resp.get_data(as_text=True)[:100]}"
                )

    print(f"\nDone. Attempted {len(rows)} jobs via admin API.")


if __name__ == "__main__":
    main()
