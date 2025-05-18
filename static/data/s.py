import geopandas as gpd

# Load full FL counties shapefile (adjust path as needed)
print("📂 Loading Florida counties shapefile...")
gdf = gpd.read_file("cntbnd_sep15.shp").to_crs(epsg=4326)
print(f"✅ Loaded {len(gdf)} counties.")

# Define your counties of interest
selected_counties = [
    "BREVARD", "CITRUS", "DUVAL", "LAKE", "LEVY", "MARION", "ORANGE",
    "OSCEOLA", "PINELLAS", "POLK", "PUTNAM", "SEMINOLE", "SUMTER", "VOLUSIA"
]

print("🔍 Filtering counties...")
filtered = gdf[gdf["NAME"].str.upper().isin(selected_counties)]
print(f"✅ Found {len(filtered)} matching counties.")

print("💾 Exporting to GeoJSON...")
filtered.to_file("florida_counties.geojson", driver="GeoJSON")
print("✅ Done: 'florida_counties.geojson' created.")
