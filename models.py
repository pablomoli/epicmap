from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime, timezone

db = SQLAlchemy()

class Job(db.Model):
    __tablename__ = 'jobs'
    id = db.Column(db.Integer, primary_key=True)
    job_number = db.Column(db.String(100), unique=True, nullable=False)
    client = db.Column(db.String(200), nullable=False)
    address = db.Column(db.String(200), nullable=False)
    lat = db.Column(db.String(100))
    long = db.Column(db.String(100))
    county = db.Column(db.String(100))
    prop_appr_link = db.Column(db.String(300))
    status = db.Column(db.String(100))
    visited = db.Column(db.Integer, default=0)
    total_time_spent = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    tags = db.Column(ARRAY(db.Integer), default=[])
    
    def to_dict(self):
        return {
            "JobNumber": self.job_number,
            "Client": self.client,
            "Address": self.address,
            "County": self.county,
            "Latitude": self.lat,
            "Longitude": self.long,
            "PropertyLink": self.prop_appr_link,
            "Status": self.status,
            "Visited": self.visited,
            "TotalTimeSpent": self.total_time_spent,
            "Tags": self.tags,
            "CreatedAt": self.created_at.isoformat() if self.created_at else None,
        }



    field_work = db.relationship('FieldWork', backref='job', lazy=True)

class FieldWork(db.Model):
    __tablename__ = 'field_work'
    id = db.Column(db.Integer, primary_key=True)
    job_number = db.Column(db.String(100), db.ForeignKey('jobs.job_number'), nullable=False)
    work_date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    crew = db.Column(db.String(100))
    drone_card = db.Column(db.String(100))
    total_time = db.Column(db.Float, default=0.0)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.compute_total_time()

    def compute_total_time(self):
        if self.start_time and self.end_time:
            start = datetime.combine(self.work_date, self.start_time)
            end = datetime.combine(self.work_date, self.end_time)
            delta = end - start
            self.total_time = round(delta.total_seconds() / 3600, 2)

    def to_dict(self):
        return {
        "id": self.id,
        "job_number": self.job_number,
        "work_date": self.work_date.isoformat() if self.work_date else None,
        "start_time": self.start_time.strftime("%H:%M") if self.start_time else None,
        "end_time": self.end_time.strftime("%H:%M") if self.end_time else None,
        "crew": self.crew,
        "drone_card": self.drone_card,
        "total_time": self.total_time,
        }


class Tag(db.Model):
    __tablename__ = 'tags'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), unique=True, nullable=False)
