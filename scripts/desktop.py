"""Entry point for the Windows bundle. No external Python or Node required."""
import multiprocessing
import os
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.request
import json
import webbrowser


def main():
    import uvicorn
    from app.main import create_app
    folder = Path(sys.executable).parent / 'runtime'
    os.environ.setdefault('GEOCHECK_HOME', str(folder))
    port = int(os.getenv('GEOCHECK_PORT', '8000'))
    url = f'http://127.0.0.1:{port}'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with socket.socket() as probe:
        occupied = probe.connect_ex(('127.0.0.1', port)) == 0
    if occupied:
        try:
            with opener.open(url+'/api/health', timeout=2) as response:
                if json.load(response).get('module') != 'well-log-qc':
                    raise ValueError('Port is occupied by another application.')
            if not os.getenv('GEOCHECK_NO_BROWSER'):
                webbrowser.open(url)
            print('GeoCheck is already running: '+url)
            return
        except Exception:
            raise RuntimeError(f'Port {port} is occupied. Close the other application and retry.')
    def open_when_ready():
        for _ in range(120):
            try:
                with opener.open(url+'/api/health', timeout=1):
                    if not os.getenv('GEOCHECK_NO_BROWSER'):
                        webbrowser.open(url)
                    return
            except OSError:
                time.sleep(0.5)
    threading.Thread(target=open_when_ready, daemon=True).start()
    print('GeoCheck AI: '+url+'\nKeep this window open. Stop: Ctrl+C.', flush=True)
    uvicorn.run(create_app(seed=False), host='127.0.0.1', port=port, log_level='info')


if __name__ == '__main__':
    multiprocessing.freeze_support()
    try:
        main()
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print('STARTUP ERROR: '+str(exc), flush=True)
        if not os.getenv('GEOCHECK_NO_BROWSER'):
            input('Press Enter to close...')
        raise SystemExit(1)
