import ctypes
import sys

_ov = ctypes.CDLL(r"D:\Python\DLLs\_overlapped.pyd")
class OVERLAPPED(ctypes.Structure): pass
_ov.OVERLAPPED = OVERLAPPED
sys.modules["_overlapped"] = _ov
print("[OK] _overlapped patched")

import socket
print(f"socket module: {socket}")

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    print(f"[OK] socket created: {s}")
    s.close()
except Exception as e:
    print(f"[FAIL] socket error: {e}")

import requests
try:
    r = requests.get("https://httpbin.org/get", timeout=5)
    print(f"[OK] requests works: {r.status_code}")
except Exception as e:
    print(f"[FAIL] requests error: {e}")

try:
    import httpx
    r = httpx.get("https://httpbin.org/get", timeout=5)
    print(f"[OK] httpx works: {r.status_code}")
except Exception as e:
    print(f"[FAIL] httpx error: {e}")

try:
    import urllib.request
    r = urllib.request.urlopen("https://httpbin.org/get", timeout=5)
    print(f"[OK] urllib works: {r.status}")
except Exception as e:
    print(f"[FAIL] urllib error: {e}")
