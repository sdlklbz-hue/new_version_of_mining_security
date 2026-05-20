import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")
sys.path.insert(0, os.getcwd())

import asyncio
asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn
from api.main import app

uvicorn.run(app, host='0.0.0.0', port=8000)
