import sys
import os
import ctypes

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")

print("Before patch:")
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    print("socket.socket() works!")
    s.close()
except Exception as e:
    print(f"socket.socket() failed: {e}")

print("\nChecking _socket.socket.__init__:")
print(socket.socket.__init__)

print("\nChecking if _socket.socket is patched:")
import _socket
print(_socket.socket.__init__)
