import subprocess, os

blender = r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe"
script = r"F:\ta_agent\tools\blender_asset_renderer.py"
fbx_dir = r"D:\Trunk_Projects\Main\Assets\Art\MapSources\Architecture\Common\Building\Common_Building_A\FBX\High"
out = os.path.join(fbx_dir, ".previews")

os.makedirs(out, exist_ok=True)

# 找到所有 FBX 文件
fbx_files = [f for f in os.listdir(fbx_dir) if f.lower().endswith('.fbx')]
print(f"Found {len(fbx_files)} FBX files: {fbx_files}")

for fbx_file in fbx_files:
    fbx_path = os.path.join(fbx_dir, fbx_file)
    print(f"\n=== Rendering: {fbx_file} ===")
    result = subprocess.run(
        [blender, "--background", "--python", script, "--", fbx_path, out, "front", "side", "three_quarter"],
        capture_output=True, text=True, timeout=300,
        encoding='utf-8', errors='replace'
    )
    # 只输出最后的关键信息
    lines = result.stdout.strip().split('\n')
    for line in lines[-10:]:
        print(line)
    if result.returncode != 0:
        print(f"ERROR (code {result.returncode})")
        if result.stderr:
            print(result.stderr[-500:])
    else:
        print("OK")

# 列出生成的文件
print(f"\n=== Generated files in {out} ===")
for f in sorted(os.listdir(out)):
    size = os.path.getsize(os.path.join(out, f))
    print(f"  {f} ({size//1024}KB)")
