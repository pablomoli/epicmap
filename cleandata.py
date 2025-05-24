#!/usr/bin/env python3
import pandas as pd
from pathlib import Path

# — locate files next to this script
script_folder   = Path(__file__).parent
input_path      = script_folder / "data.xlsx"
valid_out_path  = script_folder / "invoices_valid.xlsx"
review_out_path = script_folder / "invoices_review.xlsx"

# — 1) load
df = pd.read_excel(input_path, engine="openpyxl")

# — 2) build your mask
mask_valid = (df["Type"] == "Invoice") & (df["AddressValid"] == True)

# — 3) split into two DataFrames
df_valid   = df.loc[mask_valid].copy()
df_review  = df.loc[~mask_valid].copy()

# — 4) write them out
df_valid.to_excel(valid_out_path, index=False, engine="openpyxl")
df_review.to_excel(review_out_path, index=False, engine="openpyxl")

# — 5) report
print(f"✅ {len(df_valid)} rows wrote to {valid_out_path.name} (Invoice & AddressValid)")
print(f"✅ {len(df_review)} rows wrote to {review_out_path.name} (others for review)")
