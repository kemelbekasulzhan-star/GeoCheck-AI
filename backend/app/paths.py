import sys
from pathlib import Path

BUNDLE_ROOT = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path(__file__).resolve().parents[2]
WORK_ROOT = Path(sys.executable).parent if getattr(sys, 'frozen', False) else BUNDLE_ROOT
