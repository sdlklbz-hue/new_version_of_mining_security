import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")
sys.path.insert(0, os.getcwd())

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="Mining Risk Agent", version="1.0.0")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}

@app.get("/")
async def root():
    return {"message": "Mining Risk Agent API"}

if __name__ == "__main__":
    from wsgiref.simple_server import make_server
    
    def app_wrapper(environ, start_response):
        import uvicorn
        from uvicorn.protocols.wsgi import WSGIMiddleware
        wsgi_app = WSGIMiddleware(app)
        return wsgi_app(environ, start_response)
    
    server = make_server('0.0.0.0', 8000, app_wrapper)
    print("Serving on http://0.0.0.0:8000")
    server.serve_forever()
