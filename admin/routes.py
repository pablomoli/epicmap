import os
from datetime import datetime, timezone

import requests
from flask import flash, redirect, render_template, request, session, url_for, jsonify

from admin import admin_bp
from auth_utils import hash_password, login_required
from models import FieldWork, Job, User, db
from utils import get_brevard_property_link, get_county_from_coords


@admin_bp.route("/")
@login_required
def admin_dashboard():
    """Main admin route - now redirects to SPA"""
    if session.get("role") != "admin":
        return redirect("/")

    # Redirect to SPA version
    return render_template("admin_spa.html")


@admin_bp.route("/users")
@login_required
def admin_users():
    if session.get("role") != "admin":
        return redirect("/")

    users = User.query.all()
    return render_template("admin.html", users=users)


@admin_bp.route("/users/create", methods=["POST"])
@login_required
def create_user():
    if session.get("role") != "admin":
        return redirect("/")

    username = request.form["username"].strip()
    name = request.form["name"].strip()
    password = request.form["password"].strip()
    role = request.form["role"]

    if not username or not password or role not in ["admin", "user"]:
        flash("Invalid input.")
        return redirect(url_for("admin.admin_dashboard"))

    # Check for duplicate
    if User.query.filter_by(username=username).first():
        flash("User already exists.")
        return redirect(url_for("admin.admin_users"))

    new_user = User(
        username=username, name=name, password=hash_password(password), role=role
    )
    db.session.add(new_user)
    db.session.commit()
    flash("User created successfully.")
    return redirect(url_for("admin.admin_users"))


@admin_bp.route("/users/<int:user_id>/reset_password", methods=["POST"])
@login_required
def reset_password(user_id):
    if session.get("role") != "admin":
        return redirect("/")

    new_password = request.form["new_password"].strip()
    if not new_password:
        flash("New password cannot be empty.")
        return redirect(url_for("admin.admin_users"))

    user = User.query.get_or_404(user_id)
    user.password = hash_password(new_password)
    db.session.commit()
    flash(f"Password reset for {user.name}")
    return redirect(url_for("admin.admin_users"))


@admin_bp.route("/users/<int:user_id>/delete", methods=["POST"])
@login_required
def delete_user(user_id):
    if session.get("role") != "admin":
        return redirect("/")

    user = User.query.get_or_404(user_id)

    if user.username == "admin":
        flash("Cannot delete admin-level user.")
        return redirect(url_for("admin.admin_users"))

    db.session.delete(user)
    db.session.commit()
    flash(f"User '{user.name}' deleted.")
    return redirect(url_for("admin.admin_users"))


@admin_bp.route("/users/<int:user_id>/toggle_role", methods=["POST"])
@login_required
def toggle_role(user_id):
    if session.get("role") != "admin":
        return redirect("/")

    user = User.query.get_or_404(user_id)

    user.role = "admin" if user.role == "user" else "user"
    db.session.commit()
    flash(f"{user.name}'s role changed to {user.role}.")
    return redirect(url_for("admin.admin_users"))


@admin_bp.route("/jobs")
@login_required
def admin_jobs():
    if session.get("role") != "admin":
        return redirect("/")

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    # Filters
    job_number = request.args.get("job_number")
    client = request.args.get("client")
    status = request.args.get("status")
    address = request.args.get("address")

    query = Job.active()
    if job_number:
        query = query.filter(Job.job_number.ilike(f"%{job_number}%"))
    if client:
        query = query.filter(Job.client.ilike(f"%{client}%"))
    if status:
        query = query.filter(Job.status == status)
    if address:
        query = query.filter(Job.address.ilike(f"%{address}%"))

    query = query.order_by(Job.job_number.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    jobs = pagination.items

    job_ids = [job.id for job in jobs]
    fieldwork_entries = (
        FieldWork.query.filter(FieldWork.job_id.in_(job_ids))
        .order_by(FieldWork.work_date.desc())
        .all()
    )

    fw_by_job = {}
    for entry in fieldwork_entries:
        fw_by_job.setdefault(entry.job_id, []).append(entry)

    status_options = [
        "On Hold/Pending",
        "Needs Fieldwork",
        "Fieldwork Complete/Needs Office Work",
        "To Be Printed/Packaged",
        "Survey Complete/Invoice Sent/Unpaid",
        "Set/Flag Pins",
        "Completed/To Be Filed",
        "Ongoing Site Plan",
    ]

    return render_template(
        "admin_jobs.html",
        jobs=jobs,
        fieldwork=fw_by_job,
        status_options=status_options,
        pagination=pagination,
    )


# update jobs


@admin_bp.route("/update_job/<int:job_id>", methods=["POST"])
@login_required
def update_job(job_id):
    if session.get("role") != "admin":
        return redirect("/")

    job = Job.query.get_or_404(job_id)

    new_address = request.form["address"].strip()
    job_changed = False

    # Update basic fields
    for field in ["client", "status", "lat", "long", "county"]:
        new_value = request.form.get(field)
        if new_value and getattr(job, field) != new_value:
            setattr(job, field, new_value)
            job_changed = True

    # Re-geocode if address was changed
    if new_address != job.address:
        job.address = new_address
        job_changed = True

        api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")
        if api_key:
            try:
                geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
                params = {"address": new_address, "key": api_key}
                res = requests.get(geo_url, params=params)
                if res.status_code == 200:
                    geo_data = res.json()
                    if geo_data.get("status") == "OK" and geo_data["results"]:
                        result = geo_data["results"][0]
                        location = result["geometry"]["location"]
                        job.lat = location["lat"]
                        job.long = location["lng"]
                        job.address = result["formatted_address"]
                    else:
                        flash(
                            f"Geocoding failed: {geo_data.get('status', 'Unknown error')}"
                        )
                else:
                    flash(f"Geocoding API returned status code: {res.status_code}")
            except Exception as e:
                flash(f"Geocoding failed: {str(e)}")
                print(f"Geocoding error details: {str(e)}")

    if job_changed:
        db.session.commit()
        flash(f"Job {job.job_number} updated.")
    return redirect(url_for("admin.admin_jobs"))


# delete job
@admin_bp.route("/delete_job/<int:job_id>", methods=["POST"])
@login_required
def delete_job(job_id):
    if session.get("role") != "admin":
        return redirect("/")

    job = Job.query.get_or_404(job_id)
    db.session.delete(job)
    db.session.commit()
    flash(f"Deleted job {job.job_number}")
    return redirect(url_for("admin.admin_jobs"))


# update fieldwork
@admin_bp.route("/update_fieldwork/<int:entry_id>", methods=["POST"])
@login_required
def update_fieldwork(entry_id):
    if session.get("role") != "admin":
        return redirect("/")

    fw = FieldWork.query.get_or_404(entry_id)

    try:
        fw.work_date = datetime.strptime(request.form["work_date"], "%Y-%m-%d").date()
        fw.start_time = datetime.strptime(request.form["start_time"], "%H:%M").time()
        fw.end_time = datetime.strptime(request.form["end_time"], "%H:%M").time()
        fw.crew = request.form.get("crew")
        fw.drone_card = request.form.get("drone_card")

        delta = datetime.combine(datetime.min, fw.end_time) - datetime.combine(
            datetime.min, fw.start_time
        )
        fw.total_time = round(delta.total_seconds() / 3600, 2)

        # Recalculate aggregate job stats
        job = fw.job
        if job:
            all_entries = FieldWork.query.filter_by(job_id=job.id).all()
            job.total_time_spent = sum(entry.total_time for entry in all_entries)

        db.session.commit()
        flash("Fieldwork updated.")
    except Exception as e:
        flash(f"Failed to update fieldwork: {e}")
    return redirect(url_for("admin.admin_jobs"))


# delete fieldwork
@admin_bp.route("/delete_fieldwork/<int:entry_id>", methods=["POST"])
@login_required
def delete_fieldwork(entry_id):
    if session.get("role") != "admin":
        return redirect("/")

    fw = FieldWork.query.get_or_404(entry_id)
    job = fw.job

    db.session.delete(fw)

    # Recalculate aggregate stats
    if job:
        all_entries = FieldWork.query.filter_by(job_id=job.id).all()
        job.total_time_spent = sum(entry.total_time for entry in all_entries)

    db.session.commit()
    flash("Fieldwork entry deleted.")
    return redirect(url_for("admin.admin_jobs"))


# create job
@admin_bp.route("/create_job", methods=["POST"])
@login_required
def create_job():
    if session.get("role") != "admin":
        return redirect("/")

    job_number = request.form.get("job_number", "").strip()
    address = request.form.get("address", "").strip()
    client = request.form.get("client", "").strip()
    status = request.form.get("status", "").strip()

    if not job_number:
        flash("Job number is required.")
        return redirect(url_for("admin.admin_jobs"))

    if not address:
        flash("Address is required.")
        return redirect(url_for("admin.admin_jobs"))

    if not client:
        flash("Client is required.")
        return redirect(url_for("admin.admin_jobs"))

    if not job_number.replace("-", "").isalnum():
        flash("Job number should contain only letters, numbers, and hyphens.")
        return redirect(url_for("admin.admin_jobs"))

    existing = Job.active().filter_by(job_number=job_number).first()
    if existing:
        flash("Job number already exists.")
        return redirect(url_for("admin.admin_jobs"))

    lat = long = county = None
    formatted_address = address
    api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")

    if api_key:
        try:
            geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {"address": address, "key": api_key}
            res = requests.get(geo_url, params=params)
            if res.status_code == 200:
                geo_data = res.json()
                if geo_data.get("status") == "OK" and geo_data["results"]:
                    result = geo_data["results"][0]
                    location = result["geometry"]["location"]
                    lat = location["lat"]
                    long = location["lng"]
                    formatted_address = result["formatted_address"]
                else:
                    flash(
                        f"Geocoding failed: {geo_data.get('status', 'Unknown error')}"
                    )
            else:
                flash(f"Geocoding API returned status code: {res.status_code}")
        except Exception as e:
            flash(f"Geocoding failed: {str(e)}")
            print(f"Geocoding error details: {str(e)}")

    new_job = Job(
        job_number=job_number,
        address=formatted_address,
        client=client,
        lat=lat,
        long=long,
        county=get_county_from_coords(lat, long) if lat and long else None,
        prop_appr_link=get_brevard_property_link(formatted_address),
        status=status,
        created_at=datetime.now(timezone.utc),
        visited=0,
        total_time_spent=0.0,
        tags=[],
    )

    db.session.add(new_job)
    db.session.commit()
    flash("Job created.")
    return redirect(url_for("admin.admin_jobs"))


# create fieldwork
@admin_bp.route("/create_fieldwork/<job_id>", methods=["POST"])
@login_required
def create_fieldwork(job_id):
    if session.get("role") != "admin":
        return redirect("/")

    job = Job.active().filter_by(id=job_id).first_or_404()
    data = request.form

    try:
        work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
        start_time = datetime.strptime(data["start_time"], "%H:%M").time()
        end_time = datetime.strptime(data["end_time"], "%H:%M").time()
        crew = data.get("crew")
        drone_card = data.get("drone_card")

        delta = datetime.combine(datetime.min, end_time) - datetime.combine(
            datetime.min, start_time
        )
        total_time = round(delta.total_seconds() / 3600, 2)

        fw = FieldWork(
            job_id=job.id,
            work_date=work_date,
            start_time=start_time,
            end_time=end_time,
            crew=crew,
            drone_card=drone_card,
            total_time=total_time,
        )

        db.session.add(fw)
        job.visited += 1
        job.total_time_spent += total_time
        db.session.commit()
        flash("Fieldwork entry added.")
    except Exception as e:
        flash(f"Error: {e}")

    return redirect(url_for("admin.admin_jobs"))


@admin_bp.route("/api/dashboard")
@login_required
def api_dashboard():
    """API endpoint for dashboard data"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    # Get dashboard metrics (same as existing dashboard route)
    total_jobs = Job.active().count()
    total_users = User.query.count()
    recent_jobs = Job.active().order_by(Job.created_at.desc()).limit(5).all()

    # Jobs by status for quick stats
    status_counts = {}
    for status in [
        "On Hold/Pending",
        "Needs Fieldwork",
        "Fieldwork Complete/Needs Office Work",
        "To Be Printed/Packaged",
        "Survey Complete/Invoice Sent/Unpaid",
        "Set/Flag Pins",
        "Completed/To Be Filed",
        "Ongoing Site Plan",
    ]:
        count = Job.active().filter(Job.status == status).count()
        if count > 0:
            status_counts[status] = count

    return jsonify(
        {
            "total_jobs": total_jobs,
            "total_users": total_users,
            "status_counts": status_counts,
            "recent_jobs": [job.to_dict() for job in recent_jobs],
        }
    )


@admin_bp.route("/api/jobs")
@login_required
def api_jobs():
    """API endpoint for jobs data"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    # Filters
    job_number = request.args.get("job_number")
    client = request.args.get("client")
    status = request.args.get("status")
    address = request.args.get("address")

    query = Job.active()
    if job_number:
        query = query.filter(Job.job_number.ilike(f"%{job_number}%"))
    if client:
        query = query.filter(Job.client.ilike(f"%{client}%"))
    if status:
        query = query.filter(Job.status == status)
    if address:
        query = query.filter(Job.address.ilike(f"%{address}%"))

    query = query.order_by(Job.job_number.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    jobs = pagination.items

    status_options = [
        "On Hold/Pending",
        "Needs Fieldwork",
        "Fieldwork Complete/Needs Office Work",
        "To Be Printed/Packaged",
        "Survey Complete/Invoice Sent/Unpaid",
        "Set/Flag Pins",
        "Completed/To Be Filed",
        "Ongoing Site Plan",
    ]

    return jsonify(
        {
            "jobs": [job.to_dict() for job in jobs],
            "status_options": status_options,
            "current_page": page,
            "total_pages": pagination.pages,
            "total_jobs": pagination.total,
            "has_next": pagination.has_next,
            "has_prev": pagination.has_prev,
        }
    )


@admin_bp.route("/api/users")
@login_required
def api_users():
    """API endpoint for users data"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    users = User.query.all()

    return jsonify({"users": [user.to_dict() for user in users]})


# API endpoints for CRUD operations


@admin_bp.route("/api/users", methods=["POST"])
@login_required
def api_create_user():
    """API endpoint to create a user"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()

    username = data.get("username", "").strip()
    name = data.get("name", "").strip()
    password = data.get("password", "").strip()
    role = data.get("role")

    if not username or not password or role not in ["admin", "user"]:
        return jsonify({"error": "Invalid input"}), 400

    # Check for duplicate
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "User already exists"}), 400

    new_user = User(
        username=username, name=name, password=hash_password(password), role=role
    )
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"success": True, "message": "User created successfully"})


@admin_bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@login_required
def api_delete_user(user_id):
    """API endpoint to delete a user"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    user = User.query.get_or_404(user_id)

    if user.username == "admin":
        return jsonify({"error": "Cannot delete admin user"}), 400

    db.session.delete(user)
    db.session.commit()

    return jsonify({"success": True, "message": f"User '{user.name}' deleted"})


@admin_bp.route("/api/jobs/<int:job_id>", methods=["DELETE"])
@login_required
def api_delete_job(job_id):
    """API endpoint to delete a job"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    job = Job.query.get_or_404(job_id)
    db.session.delete(job)
    db.session.commit()

    return jsonify({"success": True, "message": f"Job {job.job_number} deleted"})


@admin_bp.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@login_required
def api_reset_password(user_id):
    """API endpoint to reset user password"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    new_password = data.get("new_password", "").strip()

    if not new_password:
        return jsonify({"error": "Password cannot be empty"}), 400

    user = User.query.get_or_404(user_id)
    user.password = hash_password(new_password)
    db.session.commit()

    return jsonify({"success": True, "message": f"Password reset for {user.name}"})


@admin_bp.route("/api/users/<int:user_id>/toggle-role", methods=["POST"])
@login_required
def api_toggle_role(user_id):
    """API endpoint to toggle user role"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    user = User.query.get_or_404(user_id)
    user.role = "admin" if user.role == "user" else "user"
    db.session.commit()

    return jsonify(
        {"success": True, "message": f"{user.name}'s role changed to {user.role}"}
    )


# ALSO ADD this route for main navigation link from map to admin:


@admin_bp.route("/spa")
@login_required
def admin_spa():
    """Explicit SPA route for navigation"""
    if session.get("role") != "admin":
        return redirect("/")

    return render_template("admin_spa.html")


# ADD these missing API routes to your routes.py file:


@admin_bp.route("/api/jobs", methods=["POST"])
@login_required
def api_create_job():
    """API endpoint to create a job"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()

    job_number = data.get("job_number", "").strip()
    client = data.get("client", "").strip()
    address = data.get("address", "").strip()
    status = data.get("status", "").strip()

    if not job_number or not client or not address:
        return jsonify({"error": "Job number, client, and address are required"}), 400

    # Check for duplicate job number
    existing = Job.active().filter_by(job_number=job_number).first()
    if existing:
        return jsonify({"error": "Job number already exists"}), 400

    # Geocode the address
    lat = long = county = None
    formatted_address = address
    api_key = os.getenv("GOOGLE_GEOCODING_API_KEY")

    if api_key:
        try:
            geo_url = "https://maps.googleapis.com/maps/api/geocode/json"
            params = {"address": address, "key": api_key}
            res = requests.get(geo_url, params=params)
            if res.status_code == 200:
                geo_data = res.json()
                if geo_data.get("status") == "OK" and geo_data["results"]:
                    result = geo_data["results"][0]
                    location = result["geometry"]["location"]
                    lat = str(location["lat"])  # Store as string per schema
                    long = str(location["lng"])  # Store as string per schema
                    formatted_address = result["formatted_address"]
        except Exception as e:
            print(f"Geocoding error: {e}")

    # Get county from coordinates if available
    if lat and long:
        county = get_county_from_coords(float(lat), float(long))

    new_job = Job(
        job_number=job_number,
        client=client,
        address=formatted_address,
        status=status,
        lat=lat,
        long=long,
        county=county,
        created_at=datetime.now(timezone.utc),
        visited=0,
        total_time_spent=0.0,
        created_by_id=session.get("user_id"),
    )

    db.session.add(new_job)
    db.session.commit()

    return jsonify(
        {
            "success": True,
            "message": "Job created successfully",
            "job": new_job.to_dict(),
        }
    )


@admin_bp.route("/api/jobs/<int:job_id>", methods=["GET"])
@login_required
def api_get_job(job_id):
    """API endpoint to get a single job"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    job = Job.query.get_or_404(job_id)
    return jsonify(job.to_dict())


@admin_bp.route("/api/jobs/<int:job_id>", methods=["PUT"])
@login_required
def api_update_job(job_id):
    """API endpoint to update a job"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    job = Job.query.get_or_404(job_id)
    data = request.get_json()

    # Update fields
    if "client" in data:
        job.client = data["client"]
    if "address" in data:
        job.address = data["address"]
    if "county" in data:
        job.county = data["county"]
    if "status" in data:
        job.status = data["status"]
    if "notes" in data:
        job.notes = data["notes"]
    if "prop_appr_link" in data:
        job.prop_appr_link = data["prop_appr_link"]
    if "plat_link" in data:
        job.plat_link = data["plat_link"]
    if "fema_link" in data:
        job.fema_link = data["fema_link"]
    if "document_url" in data:
        job.document_url = data["document_url"]

    db.session.commit()

    return jsonify(
        {"success": True, "message": "Job updated successfully", "job": job.to_dict()}
    )


@admin_bp.route("/api/fieldwork/<int:fieldwork_id>", methods=["GET"])
@login_required
def api_get_fieldwork(fieldwork_id):
    """API endpoint to get a single fieldwork entry"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    fieldwork = FieldWork.query.get_or_404(fieldwork_id)
    return jsonify(fieldwork.to_dict())


@admin_bp.route("/api/fieldwork/<int:fieldwork_id>", methods=["DELETE"])
@login_required
def api_delete_fieldwork(fieldwork_id):
    """API endpoint to delete a fieldwork entry"""
    if session.get("role") != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    fieldwork = FieldWork.query.get_or_404(fieldwork_id)
    job = fieldwork.job

    db.session.delete(fieldwork)

    # Recalculate job aggregate stats
    if job:
        all_entries = FieldWork.query.filter_by(job_id=job.id).all()
        job.total_time_spent = sum(entry.total_time for entry in all_entries)
        job.visited = len(all_entries)

    db.session.commit()

    return jsonify({"success": True, "message": "Fieldwork entry deleted"})
