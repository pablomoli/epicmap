from flask import Flask, render_template, request, jsonify, redirect
import requests
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from dotenv import load_dotenv
import os
from shapely.geometry import Point
import geopandas as gpd
from flask_migrate import Migrate

# Load environment variables
load_dotenv()

# Flask app setup
app = Flask(__name__)
db_path = os.getenv("DATABASE_URL", "sqlite:///jobs.db")
app.config['SQLALCHEMY_DATABASE_URI'] = db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Load county polygons
geojson_path = os.path.join("static", "data", "florida_counties.geojson")
counties_gdf = gpd.read_file(geojson_path).to_crs(epsg=4326)

# Job model
class Job(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    job_number = db.Column(db.String(100), nullable=False, unique=True)
    crew = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), nullable=False)
    client = db.Column(db.String(100), nullable=False)
    date = db.Column(db.Date, nullable=False)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    county = db.Column(db.String(100), nullable=True)
    property_link = db.Column(db.String(300), nullable=True)

    def to_dict(self):
        return {
            "JobNumber": self.job_number,
            "Crew": self.crew,
            "Address": self.address,
            "Client": self.client,
            "Date": self.date.isoformat(),
            "Latitude": self.latitude,
            "Longitude": self.longitude,
            "County": self.county,
            "PropertyLink": self.property_link
        }

# County from coordinates
def get_county_from_coords(lat, lon):
    pt = Point(lon, lat)
    match = counties_gdf[counties_gdf.contains(pt)]
    if not match.empty:
        return match.iloc[0]["NAME"]
    return None

# Brevard property lookup
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

# Form route
@app.route("/", methods=["GET", "POST"])
def form():
    if request.method == "POST":
        job_number = request.form["job_number"].strip()
        existing = Job.query.filter_by(job_number=job_number).first()
        if existing:
            return render_template("form.html", error="Job number already exists.")
        crew = request.form["crew"]
        raw_address = request.form["address"]
        client = request.form["client"]
        date = request.form["date"]

        api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
        latitude = longitude = None
        formatted_address = raw_address

        if api_key:
            geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {"address": raw_address, "key": api_key}
            try:
                res = requests.get(geo_url, params=params)
                if res.status_code == 200:
                    geo_data = res.json()
                    if geo_data.get("status") == "OK" and geo_data["results"]:
                        result = geo_data["results"][0]
                        location = result["geometry"]["location"]
                        latitude = location["lat"]
                        longitude = location["lng"]
                        formatted_address = result["formatted_address"]
            except Exception as e:
                print("Geocoding failed:", e)

        county = get_county_from_coords(latitude, longitude) if latitude and longitude else None
        property_link = get_brevard_property_link(formatted_address) if county and county.upper() == "BREVARD" else None

        new_job = Job(
            job_number=job_number,
            crew=crew,
            address=formatted_address,
            client=client,
            date=datetime.strptime(date, '%Y-%m-%d'),
            latitude=latitude,
            longitude=longitude,
            county=county,
            property_link=property_link
        )
        db.session.add(new_job)
        db.session.commit()
        return redirect("/")
    return render_template("form.html")

# Map route
@app.route("/map")
def map_view():
    return render_template("map.html")

# Jobs API (filtered)
@app.route("/jobs")
def jobs():
    query = Job.query
    crew = request.args.get("crew")
    client = request.args.get("client")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    if crew:
        query = query.filter(Job.crew.ilike(f"%{crew}%"))
    if client:
        query = query.filter(Job.client.ilike(f"%{client}%"))
    if start_date:
        query = query.filter(Job.date >= datetime.strptime(start_date, '%Y-%m-%d'))
    if end_date:
        query = query.filter(Job.date <= datetime.strptime(end_date, '%Y-%m-%d'))

    jobs = query.all()
    return jsonify([job.to_dict() for job in jobs])

@app.route("/jobs/<job_number>", methods=["PUT"])
def update_job(job_number):
    data = request.get_json()
    job = Job.query.filter_by(job_number=job_number).first_or_404()

    new_job_number = data.get("job_number", job.job_number).strip()
    if new_job_number != job.job_number:
        conflict = Job.query.filter_by(job_number=new_job_number).first()
        if conflict:
            return jsonify({"error": "Job number already exists."}), 409
        job.job_number = new_job_number

    job.crew = data.get("crew", job.crew)
    job.client = data.get("client", job.client)

    new_address = data.get("address", job.address)
    if new_address != job.address:
        api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
        geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
        res = requests.get(geo_url, params={"address": new_address, "key": api_key})
        geo_data = res.json()
        if geo_data.get("status") == "OK" and geo_data["results"]:
            result = geo_data["results"][0]
            loc = result["geometry"]["location"]
            job.latitude = loc["lat"]
            job.longitude = loc["lng"]
            job.address = result["formatted_address"]
            job.county = get_county_from_coords(loc["lat"], loc["lng"])
            job.property_link = get_brevard_property_link(job.address) if job.county == "BREVARD" else None

    job.date = datetime.strptime(data["date"], "%Y-%m-%d")
    db.session.commit()
    return jsonify({"success": True})


# Geocode endpoint
@app.route("/geocode")
def geocode():
    address = request.args.get("address")
    if not address:
        return jsonify({"error": "No address provided"}), 400

    api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {"address": address, "key": api_key}
    response = requests.get(url, params=params)

    if response.status_code != 200:
        return jsonify({"error": "Geocoding request failed"}), 500

    data = response.json()
    if not data.get("results"):
        return jsonify({"error": "Address not found"}), 404

    result = data["results"][0]
    return jsonify({
        "lat": result["geometry"]["location"]["lat"],
        "lon": result["geometry"]["location"]["lng"],
        "formatted_address": result["formatted_address"]
    })

# Run the app
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)

