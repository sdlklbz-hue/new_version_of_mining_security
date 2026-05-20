import socket
import json
import threading
import time
import random

# 模拟数据
mock_data = {
    'risk_level': ['低风险', '中风险', '高风险', '极高风险'],
    'equipment': ['破碎机', '传送带', '水泵', '风机', '电机'],
    'areas': ['采矿区', '加工区', '仓储区', '办公区', '设备区'],
    'status': ['正常', '预警', '报警', '停机']
}

def generate_risk_data():
    """生成模拟风险数据"""
    return {
        'id': random.randint(1000, 9999),
        'equipment': random.choice(mock_data['equipment']),
        'area': random.choice(mock_data['areas']),
        'risk_level': random.choice(mock_data['risk_level']),
        'probability': round(random.uniform(0.1, 0.99), 2),
        'timestamp': int(time.time()),
        'status': random.choice(mock_data['status'])
    }

def handle_request(data, addr, server):
    """处理UDP请求"""
    try:
        request = json.loads(data.decode('utf-8'))
        endpoint = request.get('endpoint', 'unknown')
        
        # 路由到不同的处理函数
        if endpoint == 'health':
            response = {'status': 'success', 'data': {'status': 'healthy', 'version': '1.0.0'}}
        
        elif endpoint == 'risk/predict':
            response = {'status': 'success', 'data': generate_risk_data()}
        
        elif endpoint == 'risk/list':
            response = {'status': 'success', 'data': [generate_risk_data() for _ in range(5)]}
        
        elif endpoint == 'data/statistics':
            response = {
                'status': 'success', 
                'data': {
                    'total_records': 1256,
                    'risk_count': {
                        '低风险': 452,
                        '中风险': 328,
                        '高风险': 189,
                        '极高风险': 87
                    },
                    'last_update': int(time.time())
                }
            }
        
        elif endpoint == 'knowledge/search':
            query = request.get('query', '')
            response = {
                'status': 'success',
                'data': {
                    'query': query,
                    'results': [
                        {'title': '工业物理常识', 'score': 0.95},
                        {'title': '类似事故处理案例', 'score': 0.87},
                        {'title': '部门分级审核SOP', 'score': 0.73}
                    ]
                }
            }
        
        else:
            response = {'status': 'success', 'data': {'message': f'Unknown endpoint: {endpoint}', 'available': ['health', 'risk/predict', 'risk/list', 'data/statistics', 'knowledge/search']}}
        
        server.sendto(json.dumps(response).encode('utf-8'), addr)
        
    except Exception as e:
        error_response = {'status': 'error', 'message': str(e)}
        server.sendto(json.dumps(error_response).encode('utf-8'), addr)

def server_loop():
    """UDP服务器主循环"""
    server = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server.bind(('127.0.0.1', 8000))
    print('UDP API Server started on 127.0.0.1:8000')
    print('Available endpoints: health, risk/predict, risk/list, data/statistics, knowledge/search')
    
    while True:
        try:
            data, addr = server.recvfrom(4096)
            handle_request(data, addr, server)
        except Exception as e:
            print(f'Server error: {e}')

if __name__ == '__main__':
    server_loop()