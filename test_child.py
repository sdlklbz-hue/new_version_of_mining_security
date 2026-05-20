import subprocess
import sys

code = """
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    print('CHILD_OK')
    s.close()
except Exception as e:
    print(f'CHILD_FAIL: {e}')
"""

p = subprocess.run(
    [sys.executable, "-c", code],
    capture_output=True, text=True
)
print(f"stdout: {p.stdout}")
print(f"stderr: {p.stderr[:200]}")
