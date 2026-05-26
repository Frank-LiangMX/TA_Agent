import React, { useRef, useEffect, useCallback, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { RotateCcw, Grid3x3, Box, Orbit } from 'lucide-react'

interface ModelStats {
  fileName: string
  vertices: number
  triangles: number
  meshes: number
  materials: number
}

interface FbxViewerProps {
  fbxFile?: File | null
  textureFiles?: Map<string, string> // filename -> blob URL
  className?: string
}

export function FbxViewer({ fbxFile, textureFiles, className }: FbxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const originalMatsRef = useRef(new Map<string, THREE.Material>())
  const lightsRef = useRef<{
    ambient: THREE.AmbientLight
    hemi: THREE.HemisphereLight
    dir1: THREE.DirectionalLight
    dir2: THREE.DirectionalLight
    dir3: THREE.DirectionalLight
  } | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const axesRef = useRef<THREE.AxesHelper | null>(null)
  const animFrameRef = useRef<number>(0)

  const [stats, setStats] = useState<ModelStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [showGrid, setShowGrid] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [fps, setFps] = useState(0)

  // --- Init Three.js scene ---
  useEffect(() => {
    if (!canvasRef.current) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    canvasRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    camera.position.set(100, 100, 100)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.25
    controls.rotateSpeed = 1.2
    controlsRef.current = controls

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 1.5)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2)
    hemi.position.set(0, 500, 0)
    scene.add(hemi)
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.5)
    dir1.position.set(200, 300, 200)
    scene.add(dir1); scene.add(dir1.target)
    const dir2 = new THREE.DirectionalLight(0x8888ff, 0.8)
    dir2.position.set(-200, 100, -200)
    scene.add(dir2); scene.add(dir2.target)
    const dir3 = new THREE.DirectionalLight(0xffffff, 0.6)
    dir3.position.set(0, -100, 200)
    scene.add(dir3); scene.add(dir3.target)
    lightsRef.current = { ambient, hemi, dir1, dir2, dir3 }

    // Grid
    const grid = new THREE.GridHelper(1000, 50, 0x333355, 0x222244)
    grid.visible = false
    scene.add(grid)
    gridRef.current = grid
    const axes = new THREE.AxesHelper(200)
    axes.visible = false
    scene.add(axes)
    axesRef.current = axes

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      if (!canvasRef.current || !containerRef.current) return
      const { clientWidth: w, clientHeight: h } = containerRef.current
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(containerRef.current!)

    // Initial size
    const { clientWidth: w, clientHeight: h } = containerRef.current!
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()

    // Animation loop
    let frameCount = 0
    let lastFpsTime = performance.now()
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      frameCount++
      const now = performance.now()
      if (now - lastFpsTime >= 1000) {
        setFps(frameCount)
        frameCount = 0
        lastFpsTime = now
      }
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (canvasRef.current && renderer.domElement.parentNode === canvasRef.current) {
        canvasRef.current.removeChild(renderer.domElement)
      }
    }
  }, [])

  // --- Load FBX file ---
  useEffect(() => {
    if (!fbxFile || !sceneRef.current) return

    const scene = sceneRef.current
    setLoading(true)
    setLoadProgress(0)
    setStats(null)

    // Clear old model
    if (modelRef.current) {
      scene.remove(modelRef.current)
      modelRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.geometry?.dispose()
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mats.forEach((m) => m.dispose())
        }
      })
      modelRef.current = null
      originalMatsRef.current.clear()
    }

    // Setup manager with texture resolver
    const manager = new THREE.LoadingManager()
    manager.addHandler(/\.tga$/i, new TGALoader())
    if (textureFiles && textureFiles.size > 0) {
      manager.setURLModifier((url) => {
        const filename = url.split(/[/\\]/).pop()!
        if (textureFiles.has(filename)) return textureFiles.get(filename)!
        return url
      })
    }

    const loader = new FBXLoader(manager)
    const blobUrl = URL.createObjectURL(fbxFile)

    loader.load(
      blobUrl,
      (object) => {
        URL.revokeObjectURL(blobUrl)
        modelRef.current = object

        // Fix materials
        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            if (!mesh.geometry.attributes.normal) {
              mesh.geometry.computeVertexNormals()
            }
            const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const newMats = oldMats.map((mat) => {
              const hasTexture = (mat as THREE.MeshStandardMaterial).map != null
              if (mat instanceof THREE.MeshBasicMaterial && !hasTexture) {
                const m = new THREE.MeshStandardMaterial({
                  color: mat.color || 0x888888, roughness: 0.7, metalness: 0.1, side: mat.side,
                })
                m.name = mat.name; mat.dispose(); return m
              }
              if (mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshLambertMaterial) {
                const m = new THREE.MeshStandardMaterial({
                  color: mat.color || 0x888888,
                  map: (mat as THREE.MeshPhongMaterial).map || null,
                  normalMap: (mat as THREE.MeshPhongMaterial).normalMap || null,
                  roughness: 0.7, metalness: 0.1, side: mat.side,
                })
                m.name = mat.name; mat.dispose(); return m
              }
              if (hasTexture) return mat
              if (mat instanceof THREE.MeshStandardMaterial && mat.color) {
                const b = (mat.color.r + mat.color.g + mat.color.b) / 3
                if (b < 0.15) mat.color.setRGB(0.5, 0.5, 0.5)
              }
              return mat
            })
            mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0]
            originalMatsRef.current.set(mesh.uuid, mesh.material as THREE.Material)
          }
        })

        scene.add(object)
        fitCamera(object)

        // Compute stats
        let verts = 0, tris = 0, meshCount = 0
        const matNames = new Set<string>()
        object.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            meshCount++
            const mesh = child as THREE.Mesh
            const geo = mesh.geometry
            if (geo.attributes.position) verts += geo.attributes.position.count
            if (geo.index) tris += geo.index.count / 3
            else if (geo.attributes.position) tris += geo.attributes.position.count / 3
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            mats.forEach((m) => matNames.add(m.name || '(unnamed)'))
          }
        })
        setStats({
          fileName: fbxFile.name,
          vertices: verts,
          triangles: Math.round(tris),
          meshes: meshCount,
          materials: matNames.size,
        })
        setLoading(false)
      },
      (xhr) => {
        if (xhr.total > 0) setLoadProgress(Math.round((xhr.loaded / xhr.total) * 100))
      },
      (err) => {
        URL.revokeObjectURL(blobUrl)
        console.error('[FbxViewer] load error:', err)
        setLoading(false)
      }
    )
  }, [fbxFile, textureFiles])

  // --- Fit camera to model ---
  const fitCamera = useCallback((obj: THREE.Object3D) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const lights = lightsRef.current
    const grid = gridRef.current
    const axes = axesRef.current
    if (!camera || !controls || !lights) return

    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = camera.fov * (Math.PI / 180)
    let dist = maxDim / (2 * Math.tan(fov / 2))
    dist *= 1.5

    controls.target.copy(center)
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.5, center.z + dist * 0.6)
    camera.near = dist * 0.001
    camera.far = dist * 100
    camera.updateProjectionMatrix()
    controls.update()

    lights.dir1.position.set(center.x + maxDim, center.y + maxDim * 1.5, center.z + maxDim)
    lights.dir1.target.position.copy(center)
    lights.dir2.position.set(center.x - maxDim, center.y + maxDim * 0.5, center.z - maxDim)
    lights.dir2.target.position.copy(center)
    lights.dir3.position.set(center.x, center.y - maxDim * 0.5, center.z + maxDim)
    lights.dir3.target.position.copy(center)
    lights.hemi.position.set(center.x, center.y + maxDim * 2, center.z)

    if (grid) grid.scale.set(maxDim / 1000, 1, maxDim / 1000)
    if (axes) axes.scale.setScalar(maxDim / 500)
  }, [])

  // --- Toggle handlers ---
  const handleResetCamera = useCallback(() => {
    if (modelRef.current) fitCamera(modelRef.current)
  }, [fitCamera])

  const handleToggleGrid = useCallback(() => {
    setShowGrid((v) => {
      const next = !v
      if (gridRef.current) gridRef.current.visible = next
      if (axesRef.current) axesRef.current.visible = next
      return next
    })
  }, [])

  const handleToggleWireframe = useCallback(() => {
    if (!modelRef.current) return
    setWireframe((v) => {
      const next = !v
      modelRef.current!.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return
        const mesh = child as THREE.Mesh
        if (next) {
          mesh.material = new THREE.MeshBasicMaterial({
            color: 0x7c8aff, wireframe: true, transparent: true, opacity: 0.6,
          })
        } else {
          const orig = originalMatsRef.current.get(mesh.uuid)
          if (orig) mesh.material = orig
        }
      })
      return next
    })
  }, [])

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((v) => {
      const next = !v
      if (controlsRef.current) controlsRef.current.autoRotate = next
      return next
    })
  }, [])

  return (
    <div ref={containerRef} className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar */}
      <div className="h-10 flex items-center gap-1 px-3 border-b border-border/50 shrink-0 bg-background/80">
        <ToolBtn icon={<RotateCcw size={14} />} label="重置视角" onClick={handleResetCamera} />
        <ToolBtn icon={<Grid3x3 size={14} />} label="网格" active={showGrid} onClick={handleToggleGrid} />
        <ToolBtn icon={<Box size={14} />} label="线框" active={wireframe} onClick={handleToggleWireframe} />
        <ToolBtn icon={<Orbit size={14} />} label="自动旋转" active={autoRotate} onClick={handleToggleAutoRotate} />
        {stats && (
          <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{stats.vertices.toLocaleString()} 顶点</span>
            <span>{stats.triangles.toLocaleString()} 面</span>
            <span>{stats.meshes} 网格</span>
            <span>{stats.materials} 材质</span>
            <span>{fps} FPS</span>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative min-h-0" />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="mt-3 text-xs text-muted-foreground">
            加载模型中{loadProgress > 0 ? ` ${loadProgress}%` : ''}...
          </span>
        </div>
      )}

      {/* Empty state */}
      {!fbxFile && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <Box size={48} className="opacity-20 mb-3" />
          <p className="text-sm">请选择 FBX 文件</p>
        </div>
      )}
    </div>
  )
}

function ToolBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        active
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
