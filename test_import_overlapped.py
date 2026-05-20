import sys
import os
import ctypes

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")

dll_path = r"D:\Python\DLLs\_overlapped.pyd"
dll = ctypes.CDLL(dll_path)

from importlib.machinery import ExtensionFileLoader
import importlib.util

spec = importlib.util.spec_from_file_location("_overlapped", dll_path)
if spec:
    module = importlib.util.module_from_spec(spec)
    sys.modules["_overlapped"] = module
    try:
        spec.loader.exec_module(module)
        print("Successfully loaded _overlapped module")
    except Exception as e:
        print(f"Failed to exec module: {e}")
else:
    print("Failed to create spec")

import _overlapped
print(f"_overlapped module: {_overlapped}")
