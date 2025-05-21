from flask import render_template, session, redirect, request, flash, url_for
from datetime import datetime
import os
from admin import admin_bp
from models import User, db, Job, FieldWork
from auth_utils import login_required, hash_password
import requests
from os import getenv

@admin_bp.route('/')
@login_required
def admin_dashboard():
    if session.get('role') != 'admin':
        return redirect('/')
    
    users = User.query.all()
    return render_template('admin.html', users=users)


@admin_bp.route('/create_user', methods=['POST'])
@login_required
def create_user():
    if session.get('role') != 'admin':
        return redirect('/')

    username = request.form['username'].strip()
    password = request.form['password'].strip()
    role = request.form['role']

    if not username or not password or role not in ['admin', 'user']:
        flash("Invalid input.")
        return redirect(url_for('admin.admin_dashboard'))

    # Check for duplicate
    if User.query.filter_by(username=username).first():
        flash("User already exists.")
        return redirect(url_for('admin.admin_dashboard'))

    new_user = User(
        username=username,
        password=hash_password(password),
        role=role
    )
    db.session.add(new_user)
    db.session.commit()
    flash("User created successfully.")
    return redirect(url_for('admin.admin_dashboard'))

@admin_bp.route('/reset_password/<int:user_id>', methods=['POST'])
@login_required
def reset_password(user_id):
    if session.get('role') != 'admin':
        return redirect('/')

    new_password = request.form['new_password'].strip()
    if not new_password:
        flash("New password cannot be empty.")
        return redirect(url_for('admin.admin_dashboard'))

    user = User.query.get_or_404(user_id)
    user.password = hash_password(new_password)
    db.session.commit()
    flash(f"Password reset for {user.username}")
    return redirect(url_for('admin.admin_dashboard'))


@admin_bp.route('/delete_user/<int:user_id>', methods=['POST'])
@login_required
def delete_user(user_id):
    if session.get('role') != 'admin':
        return redirect('/')
    
    user = User.query.get_or_404(user_id)

    if user.username == 'admin':
        flash("Cannot delete the primary admin.")
        return redirect(url_for('admin.admin_dashboard'))

    db.session.delete(user)
    db.session.commit()
    flash(f"User '{user.username}' deleted.")
    return redirect(url_for('admin.admin_dashboard'))


@admin_bp.route('/toggle_role/<int:user_id>', methods=['POST'])
@login_required
def toggle_role(user_id):
    if session.get('role') != 'admin':
        return redirect('/')

    user = User.query.get_or_404(user_id)

    user.role = 'admin' if user.role == 'user' else 'user'
    db.session.commit()
    flash(f"{user.username}'s role changed to {user.role}.")
    return redirect(url_for('admin.admin_dashboard'))

@admin_bp.route('/jobs')
@login_required
def admin_jobs():
    if session.get('role') != 'admin':
        return redirect('/')

    # Filters
    job_number = request.args.get('job_number')
    client = request.args.get('client')
    status = request.args.get('status')
    address = request.args.get('address')

    query = Job.query
    if job_number:
        query = query.filter(Job.job_number.ilike(f"%{job_number}%"))
    if client:
        query = query.filter(Job.client.ilike(f"%{client}%"))
    if status:
        query = query.filter(Job.status == status)
    if address:
        query = query.filter(Job.address.ilike(f"%{address}%"))


    jobs = query.order_by(Job.job_number.desc()).all()

    fieldwork = FieldWork.query.order_by(FieldWork.work_date.desc()).all()
    fw_by_job = {}
    for entry in fieldwork:
        fw_by_job.setdefault(entry.job_number, []).append(entry)

    return render_template("admin_jobs.html", jobs=jobs, fieldwork=fw_by_job)

# update jobs

@admin_bp.route('/update_job/<int:job_id>', methods=['POST'])
@login_required
def update_job(job_id):
    if session.get('role') != 'admin':
        return redirect('/')

    job = Job.query.get_or_404(job_id)

    new_address = request.form['address'].strip()
    job_changed = False

    # Update basic fields
    for field in ['client', 'status', 'lat', 'long', 'county']:
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
            except Exception as e:
                flash("Geocoding failed.")

    if job_changed:
        db.session.commit()
        flash(f"Job {job.job_number} updated.")
    return redirect(url_for('admin.admin_jobs'))

#delete job
@admin_bp.route('/delete_job/<int:job_id>')
@login_required
def delete_job(job_id):
    if session.get('role') != 'admin':
        return redirect('/')

    job = Job.query.get_or_404(job_id)
    db.session.delete(job)
    db.session.commit()
    flash(f"Deleted job {job.job_number}")
    return redirect(url_for('admin.admin_jobs'))

#update fieldwork
@admin_bp.route('/update_fieldwork/<int:entry_id>', methods=['POST'])
@login_required
def update_fieldwork(entry_id):
    if session.get('role') != 'admin':
        return redirect('/')

    fw = FieldWork.query.get_or_404(entry_id)

    try:
        fw.work_date = datetime.strptime(request.form['work_date'], "%Y-%m-%d").date()
        fw.start_time = datetime.strptime(request.form['start_time'], "%H:%M").time()
        fw.end_time = datetime.strptime(request.form['end_time'], "%H:%M").time()
        fw.crew = request.form.get('crew')
        fw.drone_card = request.form.get('drone_card')

        delta = datetime.combine(datetime.min, fw.end_time) - datetime.combine(datetime.min, fw.start_time)
        fw.total_time = round(delta.total_seconds() / 3600, 2)

        # Recalculate aggregate job stats
        job = Job.query.filter_by(job_number=fw.job_number).first()
        if job:
            all_entries = FieldWork.query.filter_by(job_number=fw.job_number).all()
            job.total_time_spent = sum(entry.total_time for entry in all_entries)

        db.session.commit()
        flash("Fieldwork updated.")
    except Exception as e:
        flash(f"Failed to update fieldwork: {e}")
    return redirect(url_for('admin.admin_jobs'))

#delete fieldwork
@admin_bp.route('/delete_fieldwork/<int:entry_id>')
@login_required
def delete_fieldwork(entry_id):
    if session.get('role') != 'admin':
        return redirect('/')

    fw = FieldWork.query.get_or_404(entry_id)
    job_number = fw.job_number

    db.session.delete(fw)

    # Recalculate aggregate stats
    job = Job.query.filter_by(job_number=job_number).first()
    if job:
        all_entries = FieldWork.query.filter_by(job_number=job_number).all()
        job.total_time_spent = sum(entry.total_time for entry in all_entries)

    db.session.commit()
    flash("Fieldwork entry deleted.")
    return redirect(url_for('admin.admin_jobs'))

#create job
@admin_bp.route('/create_job', methods=['POST'])
@login_required
def create_job():
    if session.get('role') != 'admin':
        return redirect('/')

    job_number = request.form.get('job_number').strip()
    address = request.form.get('address').strip()
    client = request.form.get('client').strip()
    status = request.form.get('status').strip()

    if not job_number or not address:
        flash("Job number and address are required.")
        return redirect(url_for('admin.admin_jobs'))

    existing = Job.query.filter_by(job_number=job_number).first()
    if existing:
        flash("Job number already exists.")
        return redirect(url_for('admin.admin_jobs'))

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
        except Exception as e:
            flash("Geocoding failed.")

    new_job = Job(
        job_number=job_number,
        address=formatted_address,
        client=client,
        lat=lat,
        long=long,
        county=get_county_from_coords(lat, long) if lat and long else None,
        prop_appr_link=get_brevard_property_link(formatted_address),
        status=status,
        created_at=datetime.utcnow(),
        visited=0,
        total_time_spent=0.0,
        tags=[]
    )

    db.session.add(new_job)
    db.session.commit()
    flash("Job created.")
    return redirect(url_for('admin.admin_jobs'))

#create fieldwork
@admin_bp.route('/create_fieldwork/<job_number>', methods=['POST'])
@login_required
def create_fieldwork(job_number):
    if session.get('role') != 'admin':
        return redirect('/')

    job = Job.query.filter_by(job_number=job_number).first_or_404()
    data = request.form

    try:
        work_date = datetime.strptime(data["work_date"], "%Y-%m-%d").date()
        start_time = datetime.strptime(data["start_time"], "%H:%M").time()
        end_time = datetime.strptime(data["end_time"], "%H:%M").time()
        crew = data.get("crew")
        drone_card = data.get("drone_card")

        delta = datetime.combine(datetime.min, end_time) - datetime.combine(datetime.min, start_time)
        total_time = round(delta.total_seconds() / 3600, 2)

        fw = FieldWork(
            job_number=job_number,
            work_date=work_date,
            start_time=start_time,
            end_time=end_time,
            crew=crew,
            drone_card=drone_card,
            total_time=total_time
        )

        db.session.add(fw)
        job.visited += 1
        job.total_time_spent += total_time
        db.session.commit()
        flash("Fieldwork entry added.")
    except Exception as e:
        flash(f"Error: {e}")

    return redirect(url_for('admin.admin_jobs'))


