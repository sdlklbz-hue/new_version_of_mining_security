import ctypes

ws2_32 = ctypes.WinDLL("ws2_32")

WSAStartup = ws2_32.WSAStartup
WSAStartup.argtypes = [ctypes.c_ushort, ctypes.POINTER(ctypes.c_uint8 * 400)]
WSAStartup.restype = ctypes.c_int

wsa_data = (ctypes.c_uint8 * 400)()
result = WSAStartup(0x0202, wsa_data)
print(f"WSAStartup result: {result}")
version = int.from_bytes(wsa_data[0:2], 'little')
print(f"Winsock version: {version:#06x} (= {version & 0xFF}.{(version >> 8) & 0xFF})")
max_sockets = int.from_bytes(wsa_data[8:10], 'little')
print(f"iMaxSockets: {max_sockets}")

socket_func = ws2_32.socket
socket_func.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
socket_func.restype = ctypes.c_int

s = socket_func(2, 1, 6)
print(f"socket() result: {s}")
if s == -1:
    error = ws2_32.WSAGetLastError()
    print(f"WSAGetLastError: {error}")
    if error == 10038:
        print("10038 = WSAENOTSOCK")
else:
    print("Socket created OK!")
    ws2_32.closesocket(s)

ws2_32.WSACleanup()
