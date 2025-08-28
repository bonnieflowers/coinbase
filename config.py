import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = 'dev-key-change-in-production'
    TELEGRAM_BOT_TOKEN = '8010926424:AAFlcdE_J0BJjB8j86sCHajbjeKriWgo'
    TELEGRAM_CHAT_ID = '7217555825'
    DEFAULT_REDIRECT = 'https://www.google.com'
    
    SQLALCHEMY_DATABASE_URI = 'postgresql://bonnie_user:M3jjcnjJ6Gzfl40ZaMD9Qtgj35RYRLGz@dpg-d2o5b875r7bs73dcheh0-a.oregon-postgres.render.com/bonnie'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
