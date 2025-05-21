from flask import Flask, render_template, request, jsonify, redirect, session, redirect
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import os
import requests
from auth_utils import hash_password, check_password, login_required

from models import db, Job, FieldWork, Tag, User
from utils import get_county_from_coords, get_brevard_property_link

from admin import admin_bp

# Load environment variables
load_dotenv()

app = Flask(__name__)
db_path = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_DATABASE_URI'] = db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

app.secret_key = os.getenv("SESSION_KEY")
app.permanent_session_lifetime = timedelta(days=30)

app.register_blueprint(admin_bp)

# Initialize extensions
db.init_app(app)
migrate = Migrate(app, db)

@app.route("/", methods=["GET", "POST"])
@login_required
def form():
    if request.method == "POST":
        job_number = request.form["job_number"].strip()
        existing = Job.query.filter_by(job_number=job_number).first()
        if existing:
            return render_template("form.html", error="Job number already exists.")

        raw_address = request.form["address"]
        client = request.form["client"]
        status = request.form.get("status", None)

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
            address=formatted_address,
            client=client,
            lat=latitude,
            long=longitude,
            county=county,
            prop_appr_link=property_link,
            status=status,
            created_at=datetime.now(tz=timezone.utc),
            visited=0,
            total_time_spent=0.0,
            tags=[]
        )
        db.session.add(new_job)
        db.session.commit()
        return redirect("/")
    return render_template("form.html")

@app.route("/map")
@login_required
def map_view():
    return render_template("map.html")

@app.route("/jobs")
@login_required
def jobs():
    query = Job.query

    job_number = request.args.get("job_number")
    if job_number:
        query = query.filter(Job.job_number.ilike(f"%{job_number}%"))

    client = request.args.get("client")
    if client:
        query = query.filter(Job.client.ilike(f"%{client}%"))
    status = request.args.get("status")
    if status:
        query = query.filter(Job.status == status)

    jobs = query.all()
    return jsonify([job.to_dict() for job in jobs])

# Utility route for geocoding
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
    location = result["geometry"]["location"]
    lat = location["lat"]
    lon = location["lng"]
    county = get_county_from_coords(lat, lon)

    return jsonify({
        "lat": lat,
        "lon": lon,
        "county": county,
        "formatted_address": result["formatted_address"]
    })

@app.route("/jobs/<job_number>", methods=["PUT"])
@login_required
def update_job(job_number):
    job = Job.query.filter_by(job_number=job_number).first_or_404()
    data = request.json

    for field in ["client", "address", "status"]:
        value = data.get(field)
        if value:
            setattr(job, field, value)

    if "latitude" in data and data["latitude"]:
        job.lat = data["latitude"]
    if "longitude" in data and data["longitude"]:
        job.long = data["longitude"]
    if "county" in data and data["county"]:
        job.county = data["county"]

    db.session.commit()
    return jsonify(job.to_dict())

@app.route("/jobs/<job_number>/fieldwork", methods=["POST"])
@login_required
def add_fieldwork(job_number):
    job = Job.query.filter_by(job_number=job_number).first()
    if not job:
        return jsonify({"error": "Job not found"}), 404

    data = request.get_json()

    try:
        work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
        start_time = datetime.strptime(data["start_time"], "%H:%M").time()
        end_time = datetime.strptime(data["end_time"], "%H:%M").time()
        delta = datetime.combine(datetime.min, end_time) - datetime.combine(datetime.min, start_time)
        total_time = round(delta.total_seconds() / 3600, 2)

        crew = data.get("crew")
        drone_card = data.get("drone_card")
    except (KeyError, ValueError) as e:
        return jsonify({"error": f"Invalid or missing data: {e}"}), 400

    fieldwork = FieldWork(
        job_id=job.id,
        work_date=work_date,
        start_time=start_time,
        end_time=end_time,
        crew=crew,
        drone_card=drone_card,
        total_time=total_time
    )

    db.session.add(fieldwork)

    # Update job aggregate stats
    job.visited += 1
    job.total_time_spent += fieldwork.total_time
    db.session.commit()

    return jsonify({"message": "Field work added", "total_time": fieldwork.total_time})

@app.route("/jobs/<job_number>/fieldwork", methods=["GET"])
@login_required
def get_fieldwork_for_job(job_number):
    job = Job.query.filter_by(job_number=job_number).first_or_404()
    entries = FieldWork.query.filter_by(job_id=job.id).order_by(FieldWork.work_date.desc()).all()
    return jsonify([entry.to_dict() for entry in entries])

@app.route("/fieldwork/<int:entry_id>", methods=["PUT"])
@login_required
def update_fieldwork(entry_id):
    fw = FieldWork.query.get_or_404(entry_id)
    data = request.get_json()

    if "work_date" in data:
        fw.work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
    if "start_time" in data:
        fw.start_time = datetime.strptime(data["start_time"], "%H:%M").time()
    if "end_time" in data:
        fw.end_time = datetime.strptime(data["end_time"], "%H:%M").time()
    if "crew" in data:
        fw.crew = data["crew"]
    if "drone_card" in data:
        fw.drone_card = data["drone_card"]
    if fw.start_time and fw.end_time:
        delta = datetime.combine(datetime.min, fw.end_time) - datetime.combine(datetime.min, fw.start_time)
        fw.total_time = round(delta.total_seconds() / 3600, 2)

    job = Job.query.get(fw.job_id)
    all_entries = FieldWork.query.filter_by(job_id=job.id).all()
    job.total_time_spent = sum(entry.total_time for entry in all_entries)


    db.session.commit()
    return jsonify(fw.to_dict())


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()

        if user and check_password(password, user.password):
            session.permanent = user.role == 'admin'
            session['user_id'] = user.id
            session['role'] = user.role
            user.last_login = datetime.now(tz=timezone.utc)
            user.last_ip = request.remote_addr
            db.session.commit()
            return redirect('/')
        return render_template('login.html', error="Invalid credentials")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/login')


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=False)

