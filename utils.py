import requests
from sqlalchemy import text
from flask import current_app as app
from models import db

def get_county_from_coords(lat, lon):
    sql = text("""
        SELECT name FROM counties
        WHERE ST_Contains(
            geometry,
            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)
        )
        LIMIT 1;
    """)
    with db.engine.connect() as conn:
        result = conn.execute(sql, {"lon": lon, "lat": lat}).fetchone()
        return result[0] if result else None

def get_brevard_property_link(address):
    try:
        url = "https://www.bcpao.us/api/records"
        res = requests.get(url, params={"address": address})
        res.raise_for_status()
        data = res.json()
        if data:
            return f"https://www.bcpao.us/propertysearch/#/account/{data[0]['account']}"
    except:
        pass
    return None
