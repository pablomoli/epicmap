# import_counties.py
import geopandas as gpd
import sqlalchemy
import os
from dotenv import load_dotenv

load_dotenv()

# Load your Supabase database URL from .env or paste directly for now
db_url = os.getenv("DATABASE_URL") 
# Load and prep the GeoJSON
gdf = gpd.read_file("static/data/florida_counties.geojson").to_crs(epsg=4326)
gdf = gdf.rename(columns={"NAME": "name"})[["name", "geometry"]]

# Upload to Supabase
engine = sqlalchemy.create_engine(db_url)
gdf.to_postgis("counties", engine, if_exists="replace", index=False)
print("✅ Counties uploaded to Supabase!")

