import socket
import json
import threading
import time

# 创建 UDP socket（这个能工作！）
server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
server.bind(('127.0.0.1', 8000))
print('UDP Server started on 127.0.0.1:8000')

def handle_request(data, addr):
    try:
        request = json.loads(data.decode('utf-8'))
        print(f'Received from {addr}: {request}')
        
        # 模拟 API 响应
        response = {
            'status': 'success',
            'data': {
                'message': 'Hello from UDP API!',
                'endpoint': request.get('endpoint', 'unknown'),
                'timestamp': time.time()
            }
        }
        server.sendto(json.dumps(response).encode('utf-8'), addr)
    except Exception as e:
        error_response = {'status': 'error', 'message': str(e)}
        server.sendto(json.dumps(error_response).encode('utf-8'), addr)

def server_loop():
    while True:
        try:
            data, addr = server.recvfrom(4096)
            handle_request(data, addr)
        except Exception as e:
            print(f'Server error: {e}')

# 启动服务器
server_thread = threading.Thread(target=server_loop, daemon=True)
server_thread.start()

# 保持运行
while True:
    time.sleep(1)