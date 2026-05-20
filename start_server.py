import sys
import os

os.chdir(r"c:\Users\sdlkl\Desktop\程序\mining_risk_agent-master")
sys.path.insert(0, os.getcwd())

import uvicorn
from api.main import app

uvicorn.run(app, host='0.0.0.0', port=8000)
