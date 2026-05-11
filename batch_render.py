"""Batch render all High FBX previews under Building directory"""
import subprocess
import json
import os
import sys

# Force UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

BLENDER = r"D:\Program Files\Blender Foundation\Blender 4.3\blender.exe"
RENDER_SCRIPT = os.path.join(os.path.dirname(__file__), "tools", "blender_asset_renderer.py")
BASE_DIR = r"D:\Trunk_Projects\Main\Assets\Art\MapSources\Architecture\Common\Building"

# Scan all High FBX
fbx_list = []
for root, dirs, files in os.walk(BASE_DIR):
    if os.path.basename(root) != "High":
        continue
    for f in files:
        if f.lower().endswith(".fbx"):
            fbx_list.append(os.path.join(root, f))

fbx_list.sort()
print(f"Found {len(fbx_list)} High FBX files\n")

success = 0
failed = 0

for i, fbx_path in enumerate(fbx_list, 1):
    asset_name = os.path.splitext(os.path.basename(fbx_path))[0]
    asset_dir = os.path.dirname(os.path.dirname(fbx_path))
    preview_dir = os.path.join(asset_dir, ".previews")

    print(f"[{i}/{len(fbx_list)}] Rendering: {asset_name}")

    result = subprocess.run(
        [BLENDER, "--background", "--python", RENDER_SCRIPT, "--", fbx_path, preview_dir],
        capture_output=True, timeout=180
    )

    stdout = result.stdout.decode('utf-8', errors='replace')
    stderr = result.stderr.decode('utf-8', errors='replace')

    # Find JSON line: a line that starts with '{'
    data = None
    for line in stdout.split('\n'):
        line = line.strip()
        if line.startswith('{') and line.endswith('}'):
            try:
                data = json.loads(line)
                break
            except json.JSONDecodeError:
                continue

    if data and data.get("success"):
        print(f"  OK: {data['total_rendered']} previews")
        success += 1
    elif data:
        print(f"  FAIL: {data.get('error', 'unknown')}")
        failed += 1
    else:
        err_lines = stderr.strip().split("\n")[-3:] if stderr else []
        print(f"  FAIL: No JSON in output")
        if err_lines:
            for l in err_lines:
                print(f"    {l}")
        failed += 1

print(f"\n{'='*60}")
print(f"Done: {success} OK, {failed} FAIL, {len(fbx_list)} total")
