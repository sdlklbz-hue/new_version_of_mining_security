import ctypes
from ctypes import wintypes

WSASYSNOT_STATUS = 10038
WSA_INVALID_HANDLE = 6

def check_winsock():
    try:
        from ctypes import wintypes
        ws2_32 = ctypes.WinDLL('ws2_32')

        WSAStartup = ws2_32.WSAStartup
        WSAStartup.argtypes = [wintypes.WORD, ctypes.POINTER(wintypes.WSA_DATA)]
        WSAStartup.restype = wintypes.WORD

        wsa_data = wintypes.WSA_DATA()
        result = WSAStartup(0x0202, wsa_data)
        print(f"WSAStartup result: {result}")

        if result == 0:
            print(f"Winsock version: {wsa_data.wVersion}")

            socket_func = ws2_32.socket
            socket_func.argtypes = [c_int, c_int, c_int]
            socket_func.restype = wintypes.SOCKET

            s = socket_func(ctypes.c_int(2), ctypes.c_int(1), ctypes.c_int(6))
            print(f"Raw socket() result: {s}")
            if s == wintypes.SOCKET(-1):
                error = ws2_32.WSAGetLastError()
                print(f"WSAGetLastError: {error}")
            else:
                closesocket = ws2_32.closesocket
                closesocket.argtypes = [wintypes.SOCKET]
                closesocket.restype = ctypes.c_int
                closesocket(s)

            ws2_32.WSACleanup()
        else:
            print(f"WSAStartup failed with error: {result}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

from ctypes import c_int
check_winsock()
