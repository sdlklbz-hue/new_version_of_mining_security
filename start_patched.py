import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")
sys.path.insert(0, os.getcwd())

import ctypes
from ctypes import wintypes

kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

WSASYSNOT_STATUS = 10038

def patch_socket():
    import socket
    original_socket = socket.socket

    class PatchedSocket(original_socket):
        def __init__(self, family=-1, type=-1, proto=-1, fileno=None):
            try:
                super().__init__(family, type, proto, fileno)
            except OSError as e:
                if e.winerror == WSASYSNOT_STATUS:
                    print(f"Warning: Socket error {e.winerror} - attempting to work around")
                    if fileno is None:
                        super().__init__(family, type, proto)
                else:
                    raise

    socket.socket = PatchedSocket
    print("Socket patch applied")

patch_socket()

print("Attempting to start server...")
import uvicorn
from api.main import app
uvicorn.run(app, host='0.0.0.0', port=8000)
