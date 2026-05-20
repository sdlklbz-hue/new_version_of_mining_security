import multiprocessing
import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")

def run_server():
    import sys
    sys.path.insert(0, os.getcwd())
    import uvicorn
    from api.main import app
    uvicorn.run(app, host='0.0.0.0', port=8000)

if __name__ == '__main__':
    p = multiprocessing.Process(target=run_server)
    p.start()
    p.join()
