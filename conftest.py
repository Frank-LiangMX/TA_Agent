import sys
import os

_root = os.path.dirname(os.path.abspath(__file__))
# Match the path setup from agent.py
sys.path.insert(0, os.path.join(_root, "backend"))
sys.path.insert(0, os.path.join(_root, "packages"))
sys.path.insert(0, _root)
