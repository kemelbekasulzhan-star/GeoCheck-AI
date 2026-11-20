"""Portable local launcher; does not rely on the original developer's paths."""
import argparse
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:8000'


def health():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + '/api/health', timeout=1) as response:
            data = json.load(response)
        return data.get('status') == 'ok' and data.get('module') == 'well-log-qc'
    except (OSError, ValueError, urllib.error.URLError):
        return False


def check():
    missing = [name for name in ('uvicorn', 'fastapi', 'sqlalchemy', 'pandas', 'numpy', 'sklearn', 'lasio', 'multipart')
               if importlib.util.find_spec(name) is None]
    if missing:
        print('Missing Python packages: ' + ', '.join(missing))
    if not (ROOT / 'frontend/dist/index.html').is_file():
        print('The frontend is not built yet. GitHub contains source files, not an installed application.')
        missing.append('frontend build')
    if missing:
        print('Run Install-GeoCheck.cmd first. See README.md for manual setup.')
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not check():
        return 1
    if args.check:
        print('PASS: Python packages and frontend build are available.')
        return 0
    if health():
        print('GeoCheck AI is already running: ' + URL)
        if not args.no_browser:
            webbrowser.open(URL)
        return 0
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 8000)) == 0:
            print('Port 8000 is occupied by another service. Close that service before starting GeoCheck.')
            return 1
    print('Starting GeoCheck AI. Keep this window open. Stop with Ctrl+C.', flush=True)
    process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend',
                                '--host', '127.0.0.1', '--port', '8000'], cwd=ROOT)
    try:
        for _ in range(120):
            if process.poll() is not None:
                print('Server startup failed. See the error above.')
                return process.returncode or 1
            if health():
                print('Ready: ' + URL, flush=True)
                if not args.no_browser:
                    webbrowser.open(URL)
                return process.wait()
            time.sleep(0.5)
        print('Startup timed out. See the server messages above.')
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    raise SystemExit(main())
