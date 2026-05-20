import ctypes
from ctypes import wintypes, c_int, POINTER, Structure

WSADESCRIPTION_LEN = 256
WSASYS_STATUS_LEN = 128

class WSA_DATA(Structure):
    _fields_ = [
        ("wVersion", wintypes.WORD),
        ("wHighVersion", wintypes.WORD),
        ("szDescription", wintypes.CHAR * (WSADESCRIPTION_LEN + 1)),
        ("szSystemStatus", wintypes.CHAR * (WSASYS_STATUS_LEN + 1)),
        ("iMaxSockets", wintypes.USHORT),
        ("iMaxUdpDg", wintypes.USHORT),
        ("lpVendorInfo", wintypes.LPSTR),
    ]

def check_winsock():
    try:
        ws2_32 = ctypes.WinDLL('ws2_32')

        WSAStartup = ws2_32.WSAStartup
        WSAStartup.argtypes = [wintypes.WORD, POINTER(WSA_DATA)]
        WSAStartup.restype = wintypes.WORD

        wsa_data = WSA_DATA()
        result = WSAStartup(0x0202, wsa_data)
        print(f"WSAStartup result: {result}")

        if result == 0:
            print(f"Winsock version: {wsa_data.wVersion}")

            socket_func = ws2_32.socket
            socket_func.argtypes = [c_int, c_int, c_int]
            socket_func.restype = wintypes.SOCKET

            s = socket_func(c_int(2), c_int(1), c_int(6))
            print(f"Raw socket() result: {s}")
            if s == wintypes.SOCKET(-1):
                error = ws2_32.WSAGetLastError()
                print(f"WSAGetLastError: {error}")
            else:
                closesocket = ws2_32.closesocket
                closesocket.argtypes = [wintypes.SOCKET]
                closesocket.restype = c_int
                closesocket(s)

            ws2_32.WSACleanup()
        else:
            print(f"WSAStartup failed with error: {result}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

check_winsock()
