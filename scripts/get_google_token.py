"""
Private-ops helper for obtaining a Google OAuth2 refresh token.

This script opens a browser authorization flow and prints a refresh token.
Run it only in a trusted local environment. Never paste the printed token into
issues, pull requests, logs, or committed files.

Required local .env values:
    GOOGLE_CLIENT_ID=<google-client-id>
    GOOGLE_CLIENT_SECRET=<google-client-secret>

Usage:
    python3 scripts/get_google_token.py
"""

import os
from google_auth_oauthlib.flow import InstalledAppFlow
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")

if not CLIENT_ID or not CLIENT_SECRET:
    raise ValueError(
        "Missing environment variables: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. "
        "Define them in a local .env file before running this script."
    )

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
    }
}

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
creds = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

print("\n" + "=" * 60)
print("REFRESH TOKEN (copy to your local .env as GOOGLE_REFRESH_TOKEN; do not commit):")
print("=" * 60)
print(creds.refresh_token)
print("=" * 60 + "\n")
