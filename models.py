from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid

db = SQLAlchemy()

class Session(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_agent = db.Column(db.Text, nullable=True)
    ip_address = db.Column(db.String(45), nullable=False)  
    start_time = db.Column(db.DateTime, default=datetime.utcnow)
    current_stage = db.Column(db.String(50), default='landing')
    status = db.Column(db.String(20), default='active')
    is_banned = db.Column(db.Boolean, default=False)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
 
    banned_ip = db.relationship('BannedIP', backref='session', uselist=False)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_agent': self.user_agent,
            'ip': self.ip_address,
            'start_time': self.start_time.isoformat(),
            'stage': self.current_stage,
            'status': self.status,
            'is_banned': self.is_banned
        }

class BannedIP(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False, unique=True)
    ban_time = db.Column(db.DateTime, default=datetime.utcnow)
    reason = db.Column(db.String(255), nullable=True)
    session_id = db.Column(db.String(36), db.ForeignKey('session.id'), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'ip_address': self.ip_address,
            'ban_time': self.ban_time.isoformat(),
            'reason': self.reason,
            'session_id': self.session_id
        }