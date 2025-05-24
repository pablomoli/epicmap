#!/usr/bin/env python3
"""
Separate rows with valid addresses into a new Excel file.

Reads:
    invoices_review.xlsx

Writes:
    invoices_valid_addresses.xlsx  (all rows where AddressValid == True)
"""

import pandas as pd


def main():
    # 1) Load the data
    df = pd.read_excel("invoices_review.xlsx", engine="openpyxl")

    # 2) Filter only the valid addresses
    df_valid = df[df["AddressValid"] == True]

    # 3) Write them out
    df_valid.to_excel("invoices_valid_addresses.xlsx", index=False, engine="openpyxl")
    print(
        f"✅ {len(df_valid)} valid-address rows written to invoices_valid_addresses.xlsx"
    )


if __name__ == "__main__":
    main()
