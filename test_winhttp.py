import ctypes
from ctypes import wintypes

# WinHTTP constants
WINHTTP_ACCESS_TYPE_DEFAULT_PROXY = 0
WINHTTP_FLAG_SECURE = 0x00800000
INTERNET_OPEN_TYPE_DIRECT = 1

# WinHTTP function signatures
winhttp = ctypes.WinDLL("winhttp")

WinHttpOpen = winhttp.WinHttpOpen
WinHttpOpen.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
WinHttpOpen.restype = wintypes.HINTERNET

WinHttpConnect = winhttp.WinHttpConnect
WinHttpConnect.argtypes = [wintypes.HINTERNET, wintypes.LPCWSTR, wintypes.INTERNET_PORT, wintypes.DWORD]
WinHttpConnect.restype = wintypes.HINTERNET

WinHttpOpenRequest = winhttp.WinHttpOpenRequest
WinHttpOpenRequest.argtypes = [wintypes.HINTERNET, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
WinHttpOpenRequest.restype = wintypes.HINTERNET

WinHttpSendRequest = winhttp.WinHttpSendRequest
WinHttpSendRequest.argtypes = [wintypes.HINTERNET, wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD_PTR]
WinHttpSendRequest.restype = wintypes.BOOL

WinHttpReceiveResponse = winhttp.WinHttpReceiveResponse
WinHttpReceiveResponse.argtypes = [wintypes.HINTERNET, wintypes.LPVOID]
WinHttpReceiveResponse.restype = wintypes.BOOL

WinHttpQueryHeaders = winhttp.WinHttpQueryHeaders
WinHttpQueryHeaders.argtypes = [wintypes.HINTERNET, wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPVOID, wintypes.LPDWORD, wintypes.LPDWORD]
WinHttpQueryHeaders.restype = wintypes.BOOL

WinHttpReadData = winhttp.WinHttpReadData
WinHttpReadData.argtypes = [wintypes.HINTERNET, wintypes.LPVOID, wintypes.DWORD, wintypes.LPDWORD]
WinHttpReadData.restype = wintypes.BOOL

WinHttpCloseHandle = winhttp.WinHttpCloseHandle
WinHttpCloseHandle.argtypes = [wintypes.HINTERNET]
WinHttpCloseHandle.restype = wintypes.BOOL

# Test WinHTTP
print("Testing WinHTTP...")
session = WinHttpOpen("PythonTest/1.0", INTERNET_OPEN_TYPE_DIRECT, None, None, 0)
if not session:
    print(f"WinHttpOpen failed: {ctypes.get_last_error()}")
else:
    print(f"WinHttpOpen OK: {session}")

    connect = WinHttpConnect(session, "httpbin.org", 443, 0)
    if not connect:
        print(f"WinHttpConnect failed: {ctypes.get_last_error()}")
    else:
        print(f"WinHttpConnect OK: {connect}")

        request = WinHttpOpenRequest(connect, "GET", "/get", None, None, None, WINHTTP_FLAG_SECURE)
        if not request:
            print(f"WinHttpOpenRequest failed: {ctypes.get_last_error()}")
        else:
            print(f"WinHttpOpenRequest OK: {request}")

            if WinHttpSendRequest(request, None, 0, None, 0, 0, 0):
                print("WinHttpSendRequest OK")
                if WinHttpReceiveResponse(request, None):
                    print("WinHttpReceiveResponse OK")
                    buffer = ctypes.create_string_buffer(4096)
                    bytes_read = wintypes.DWORD(4096)
                    if WinHttpQueryHeaders(request, 19, None, buffer, bytes_read, None):
                        print(f"Status: {buffer.value}")
                    else:
                        print(f"QueryHeaders failed: {ctypes.get_last_error()}")
                else:
                    print(f"ReceiveResponse failed: {ctypes.get_last_error()}")
            else:
                print(f"SendRequest failed: {ctypes.get_last_error()}")

            WinHttpCloseHandle(request)
        WinHttpCloseHandle(connect)
    WinHttpCloseHandle(session)

print("WinHTTP test complete")
