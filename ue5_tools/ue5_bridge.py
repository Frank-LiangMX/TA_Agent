"""
UE5 TAAssetBridge - Agent端桥接模块
通过文件IPC与UE5插件通信
"""

import json
import time
from pathlib import Path
from typing import Dict, Optional, Any


class UE5Bridge:
    """UE5资产导入桥接器"""
    
    def __init__(self, project_path: str):
        """
        初始化桥接器
        
        Args:
            project_path: UE5项目根目录（包含.uproject的目录）
        """
        self.project_path = Path(project_path)
        self.ipc_dir = self.project_path / "Saved" / "TAAssetBridge"
        self.ipc_dir.mkdir(parents=True, exist_ok=True)
        
        self.commands_file = self.ipc_dir / "commands.jsonl"
        self.results_file = self.ipc_dir / "results.jsonl"
        
        # 默认超时时间（秒）
        self.default_timeout = 30
    
    def send_command(self, cmd_dict: Dict[str, Any], timeout: Optional[float] = None) -> Dict[str, Any]:
        """
        发送命令到UE5并等待结果
        
        Args:
            cmd_dict: 命令字典
            timeout: 超时时间（秒），None使用默认值
            
        Returns:
            结果字典
        """
        request_id = cmd_dict.get("request_id", f"req_{int(time.time() * 1000)}")
        cmd_dict["request_id"] = request_id
        
        timeout = timeout or self.default_timeout
        
        # 清空旧结果文件
        if self.results_file.exists():
            try:
                self.results_file.unlink()
            except:
                pass
        
        # 写入命令
        with open(self.commands_file, 'w', encoding='utf-8') as f:
            f.write(json.dumps(cmd_dict, ensure_ascii=False) + '\n')
        
        # 等待结果
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self.results_file.exists():
                try:
                    with open(self.results_file, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                result = json.loads(line)
                                if result.get("request_id") == request_id:
                                    return result
                            except json.JSONDecodeError:
                                continue
                except Exception:
                    pass
            time.sleep(0.1)
        
        return {
            "status": "timeout",
            "request_id": request_id,
            "message": f"Command timed out after {timeout} seconds"
        }
    
    def ping(self) -> Dict[str, Any]:
        """测试与UE5的连接"""
        return self.send_command({
            "cmd": "ping",
            "request_id": "ping_test"
        }, timeout=5)
    
    def import_asset(
        self,
        source_path: str,
        dest_path: str,
        asset_type: str = "static_mesh",
        request_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        导入资产到UE5
        
        Args:
            source_path: 源文件路径（Windows路径，如 D:/Assets/hero.fbx）
            dest_path: 目标路径（UE5路径，如 /Game/Characters/Hero）
            asset_type: 资产类型（static_mesh, skeletal_mesh, texture等）
            request_id: 可选的请求ID
            
        Returns:
            结果字典，包含status, asset_path等字段
        """
        # 确保路径使用正斜杠
        source_path = source_path.replace("\\", "/")
        
        return self.send_command({
            "cmd": "import_asset",
            "request_id": request_id or f"import_{int(time.time() * 1000)}",
            "asset_type": asset_type,
            "source_path": source_path,
            "dest_path": dest_path
        }, timeout=60)  # 导入资产可能需要较长时间
    
    def is_connected(self) -> bool:
        """检查是否与UE5连接"""
        result = self.ping()
        return result.get("status") == "pong"


# 便捷函数
_bridge_instance = None

def get_bridge(project_path: str = None) -> UE5Bridge:
    """获取全局桥接实例"""
    global _bridge_instance
    if _bridge_instance is None:
        if project_path is None:
            # 尝试自动检测项目路径
            project_path = Path(__file__).parent
        _bridge_instance = UE5Bridge(str(project_path))
    return _bridge_instance


if __name__ == "__main__":
    # 测试代码
    bridge = UE5Bridge(r"F:\ta_agent")
    
    print("Testing connection...")
    result = bridge.ping()
    print(f"Ping result: {result}")
    
    if result.get("status") == "pong":
        print("✅ UE5 is connected!")
    else:
        print("❌ UE5 is not responding")
