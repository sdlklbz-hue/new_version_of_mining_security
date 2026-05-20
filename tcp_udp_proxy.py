import socket
import threading
import json
import time

# TCP-to-UDP 代理
class TCPtoUDPProxy:
    def __init__(self, tcp_port=8001, udp_host='127.0.0.1', udp_port=8000):
        self.tcp_port = tcp_port
        self.udp_host = udp_host
        self.udp_port = udp_port
        
    def handle_tcp_client(self, tcp_socket, client_addr):
        try:
            # 创建 UDP socket 用于转发
            udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            udp_socket.settimeout(5)
            
            # 接收 TCP 数据
            data = b''
            while True:
                chunk = tcp_socket.recv(4096)
                if not chunk:
                    break
                data += chunk
                if b'\r\n\r\n' in data:
                    break
            
            # 解析 HTTP 请求
            if data:
                lines = data.decode('utf-8', errors='ignore').split('\n')
                method, path, _ = lines[0].split() if len(lines) > 0 else ('GET', '/', '')
                
                # 构建 UDP 请求
                udp_request = json.dumps({
                    'endpoint': path.strip('/'),
                    'method': method,
                    'body': data.decode('utf-8', errors='ignore') if len(data) > 100 else ''
                })
                
                # 转发到 UDP 后端
                udp_socket.sendto(udp_request.encode('utf-8'), (self.udp_host, self.udp_port))
                
                # 接收 UDP 响应
                try:
                    udp_response, _ = udp_socket.recvfrom(4096)
                    response_data = json.loads(udp_response.decode('utf-8'))
                    
                    # 构建 HTTP 响应
                    http_response = f"""HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: {len(json.dumps(response_data))}

{json.dumps(response_data)}
"""
                    tcp_socket.send(http_response.encode('utf-8'))
                except socket.timeout:
                    tcp_socket.send(b'HTTP/1.1 504 Gateway Timeout\r\n\r\n{"error": "UDP timeout"}')
            
        except Exception as e:
            print(f'Proxy error: {e}')
        finally:
            tcp_socket.close()
            
    def start(self):
        # 创建 UDP socket 先测试一下
        test_udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        test_udp.bind(('127.0.0.1', 0))
        print(f'UDP socket test OK, bound to port {test_udp.getsockname()[1]}')
        test_udp.close()
        
        # 这里故意不创建 TCP socket，因为 TCP 会失败
        print('TCP-to-UDP Proxy: TCP socket creation skipped (LSP blocked)')
        print('Use UDP directly instead')

if __name__ == '__main__':
    proxy = TCPtoUDPProxy()
    proxy.start()