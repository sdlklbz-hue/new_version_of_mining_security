import win32pipe
import win32file
import win32api
import pywintypes
import threading
import json
import time

# 基于命名管道的 API 服务器
class NamedPipeAPI:
    def __init__(self, pipe_name=r'\\.\pipe\mining_risk_agent'):
        self.pipe_name = pipe_name
        
    def handle_client(self, pipe):
        try:
            # 读取请求
            buffer = win32file.ReadFile(pipe, 4096)
            request_data = buffer[1].decode('utf-8').strip('\x00')
            
            if request_data:
                try:
                    request = json.loads(request_data)
                except:
                    request = {'endpoint': 'unknown', 'data': request_data}
                
                print(f'Received request: {request}')
                
                # 模拟响应
                response = {
                    'status': 'success',
                    'endpoint': request.get('endpoint', 'unknown'),
                    'data': {
                        'message': 'Hello from Named Pipe API!',
                        'timestamp': time.time()
                    }
                }
                
                response_data = json.dumps(response) + '\x00'
                win32file.WriteFile(pipe, response_data.encode('utf-8'))
        except Exception as e:
            print(f'Client error: {e}')
        finally:
            win32file.CloseHandle(pipe)
            
    def start(self):
        print(f'Starting Named Pipe API on {self.pipe_name}')
        
        while True:
            try:
                # 创建命名管道
                pipe = win32pipe.CreateNamedPipe(
                    self.pipe_name,
                    win32pipe.PIPE_ACCESS_DUPLEX,
                    win32pipe.PIPE_TYPE_MESSAGE | win32pipe.PIPE_READMODE_MESSAGE | win32pipe.PIPE_WAIT,
                    win32pipe.PIPE_UNLIMITED_INSTANCES,
                    4096,
                    4096,
                    0,
                    None
                )
                
                # 等待客户端连接
                win32pipe.ConnectNamedPipe(pipe, None)
                print('Client connected')
                
                # 处理请求
                client_thread = threading.Thread(target=self.handle_client, args=(pipe,))
                client_thread.start()
                
            except pywintypes.error as e:
                print(f'Pipe error: {e}')
                time.sleep(1)

if __name__ == '__main__':
    api = NamedPipeAPI()
    api.start()