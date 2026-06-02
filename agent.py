import sys, os
_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_root, "backend"))
sys.path.insert(0, os.path.join(_root, "packages"))
sys.path.insert(0, _root)
from agent_main import *

if __name__ == "__main__":
    main()
