import ctypes
import sys

ws2_32 = ctypes.WinDLL("ws2_32")
WSAStartup = ws2_32.WSAStartup
WSAStartup.argtypes = [ctypes.c_ushort, ctypes.POINTER(ctypes.c_uint8 * 400)]
WSAStartup.restype = ctypes.c_int

wsa_data = (ctypes.c_uint8 * 400)()
result = WSAStartup(0x0202, wsa_data)
print(f"WSA: {result}")

import subprocess
p = subprocess.run(
    [sys.executable, "-m", "pip", "install", "--version"],
    capture_output=True, text=True
)
print(f"pip version stdout: {p.stdout[:200]}")
print(f"pip version stderr: {p.stderr[:200]}")
