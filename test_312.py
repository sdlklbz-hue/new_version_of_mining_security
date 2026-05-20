import socket
print(f"socket file: {socket.__file__}")
print(f"socket module location: {socket}")

import _socket
print(f"_socket file: {_socket.__file__}")

import sys
print(f"sys.path: {sys.path[:5]}")
