import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from './FBXLoader.js'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { Maximize2, Loader2 } from 'lucide-react'
import { localApiFetch } from '@/lib/api'

interface FbxViewerInlineProps {
  assetId: string
  filePath?: string
  onExpand?: () => void
}

export function FbxViewerInline({ assetId, filePath, onExpand }: FbxViewerInlineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const animFrameRef = useRef<number>(0)
  const needsRenderRef = useRef(true)
  const [loading, setLoading] = useState(false)

  // Init Three.js
  useEffect(() => {
    if (!containerRef.current) return

    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    containerRef.current.appendChild(canvas)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x505050)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    camera.position.set(100, 100, 100)
    cameraRef.current = camera

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.25
    controls.rotateSpeed = 1.2
    controls.enableZoom = true
    controls.enablePan = false
    controlsRef.current = controls

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 8.0))
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 6.0)
    hemi.position.set(0, 500, 0)
    scene.add(hemi)
    const dir1 = new THREE.DirectionalLight(0xffffff, 8.0)
    dir1.position.set(200, 300, 200)
    scene.add(dir1); scene.add(dir1.target)
    const dir2 = new THREE.DirectionalLight(0xffffff, 4.0)
    dir2.position.set(-200, 100, -200)
    scene.add(dir2); scene.add(dir2.target)

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return
      const { clientWidth: w, clientHeight: h } = containerRef.current
      if (w > 0 && h > 0) {
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        needsRenderRef.current = true
      }
    })
    resizeObserver.observe(containerRef.current)

    const initSize = () => {
      if (!containerRef.current) return
      const { clientWidth: w, clientHeight: h } = containerRef.current
      if (w > 0 && h > 0) {
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      } else {
        requestAnimationFrame(initSize)
      }
    }
    requestAnimationFrame(initSize)

    // On-demand render
    needsRenderRef.current = true
    controls.addEventListener('change', () => { needsRenderRef.current = true })

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      const didUpdate = controls.update()
      if (needsRenderRef.current || didUpdate || controls.autoRotate) {
        renderer.render(scene, camera)
        needsRenderRef.current = false
      }
    }
    animate()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (containerRef.current && canvas.parentNode === containerRef.current) {
        containerRef.current.removeChild(canvas)
      }
    }
  }, [])

  // Load FBX
  useEffect(() => {
    if (!assetId || !filePath?.toLowerCase().endsWith('.fbx') || !sceneRef.current) return

    const scene = sceneRef.current
    let cancelled = false
    setLoading(true)

    const fetchAndLoad = async () => {
      try {
        // Wait for container size
        await new Promise<void>((resolve) => {
          const check = () => {
            if (cancelled) return
            if (containerRef.current && containerRef.current.clientWidth > 0) resolve()
            else requestAnimationFrame(check)
          }
          check()
        })

        const res = await localApiFetch(`/api/assets/${assetId}/file`)
        if (!res.ok || cancelled) return
        const blob = await res.blob()
        const fileName = filePath.split(/[/\\]/).pop() || 'model.fbx'
        const file = new File([blob], fileName, { type: 'application/octet-stream' })

        // Clear old model
        if (modelRef.current) {
          scene.remove(modelRef.current)
          modelRef.current.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh
              mesh.geometry?.dispose()
              const mats: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              mats.forEach((m) => m.dispose())
            }
          })
          modelRef.current = null
        }

        const manager = new THREE.LoadingManager()
        manager.addHandler(/\.tga$/i, new TGALoader())
        const loader = new FBXLoader(manager)
        const blobUrl = URL.createObjectURL(file)

        loader.load(blobUrl, (object: THREE.Group) => {
          URL.revokeObjectURL(blobUrl)
          if (cancelled) return
          modelRef.current = object

          // Fix materials
          object.traverse((child: THREE.Object3D) => {
            if (!(child as THREE.Mesh).isMesh) return
            const mesh = child as THREE.Mesh
            if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals()

            const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const newMats = oldMats.map((mat: any) => {
              const srcMat = mat as THREE.MeshStandardMaterial
              const baseColor = srcMat.color ? srcMat.color.clone() : new THREE.Color(0x888888)
              const brightness = (baseColor.r + baseColor.g + baseColor.b) / 3
              if (brightness < 0.4) baseColor.setRGB(0.6, 0.6, 0.6)
              const m = new THREE.MeshStandardMaterial({
                color: baseColor,
                map: srcMat.map || null,
                roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide,
              })
              m.name = mat.name; mat.dispose(); return m
            })
            mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0]
          })

          scene.add(object)

          // Fit camera
          if (containerRef.current && rendererRef.current && cameraRef.current) {
            const { clientWidth: w, clientHeight: h } = containerRef.current
            if (w > 0 && h > 0) {
              rendererRef.current.setSize(w, h)
              cameraRef.current.aspect = w / h
              cameraRef.current.updateProjectionMatrix()
            }
          }

          const camera = cameraRef.current!
          const controls = controlsRef.current!
          const box = new THREE.Box3().setFromObject(object)
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

          // Camera light
          const camLight = new THREE.PointLight(0xffffff, 5.0, dist * 5)
          camLight.position.copy(camera.position)
          camLight.name = 'camLight'
          scene.add(camLight)

          needsRenderRef.current = true
          setLoading(false)
        }, undefined, () => { setLoading(false) })
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    fetchAndLoad()

    return () => { cancelled = true }
  }, [assetId, filePath])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="aspect-square bg-muted rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      )}
      <button
        onClick={onExpand}
        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded text-white/70 hover:text-white transition-colors"
        title="放大查看"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  )
}
