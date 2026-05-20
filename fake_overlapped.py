import ctypes
import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")

_overlapped = ctypes.CDLL(r"D:\Python\DLLs\_overlapped.pyd")

class OVERLAPPED(ctypes.Structure):
    pass

_overlapped.OVERLAPPED = OVERLAPPED

sys.modules["_overlapped"] = _overlapped

print("Fake _overlapped module installed")
