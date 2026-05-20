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
        WSAStartup.restype = wintypes.INT

        wsa_data = WSA_DATA()
        result = WSAStartup(0x0202, wsa_data)
        print(f"WSAStartup result: {result} (0 = success)")

        if result == 0:
            print(f"Winsock version: {wsa_data.wVersion}")
            print(f"Max sockets: {wsa_data.iMaxSockets}")

            socket_func = ws2_32.socket
            socket_func.argtypes = [c_int, c_int, c_int]
            socket_func.restype = c_int

            s = socket_func(c_int(2), c_int(1), c_int(6))
            print(f"Raw socket() result: {s}")
            if s == -1:
                error = ws2_32.WSAGetLastError()
                print(f"WSAGetLastError: {error}")

                if error == 10038:
                    print("Error 10038: An operation was attempted on something that is not a socket")
                    print("This indicates a system-level issue with socket support")
            else:
                print("Socket created successfully!")
                closesocket = ws2_32.closesocket
                closesocket.argtypes = [c_int]
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

print("\n\nChecking system info:")
import platform
print(f"OS: {platform.platform()}")
print(f"Python: {platform.python_version()}")
print(f"Architecture: {platform.architecture()}")
