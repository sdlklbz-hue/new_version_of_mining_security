import sys
import os
import ctypes

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")

_overlapped_dll = ctypes.CDLL(r"D:\Python\DLLs\_overlapped.pyd")

class OVERLAPPED(ctypes.Structure):
    pass

_overlapped_dll.OVERLAPPED = OVERLAPPED

sys.modules["_overlapped"] = _overlapped_dll

print("Fake _overlapped installed, starting server...")

import uvicorn
from api.main import app
uvicorn.run(app, host='0.0.0.0', port=8000)
