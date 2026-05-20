import ctypes
import os

dll_path = r"D:\Python\DLLs\_overlapped.pyd"

try:
    dll = ctypes.CDLL(dll_path)
    print(f"Successfully loaded {dll_path}")
    print(f"DLL attributes: {dir(dll)}")
except Exception as e:
    print(f"Failed to load DLL: {e}")
    import traceback
    traceback.print_exc()
