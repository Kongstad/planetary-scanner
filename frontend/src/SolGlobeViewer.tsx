import {
  Cartesian3,
  Math as CesiumMath,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  Globe,
  SingleTileImageryProvider,
  SkyBox,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import { stabilizeGlobeZoom } from './globeCamera.ts'
import { solarGlobeMap } from './solarGlobeMap.ts'

const SOL_RADIUS = 695_700_000
const SOL_ELLIPSOID = new Ellipsoid(SOL_RADIUS, SOL_RADIUS, SOL_RADIUS)
const GLOBAL_VIEW_HEIGHT = SOL_RADIUS * 3.25
const INITIAL_LONGITUDE = 180

async function createSolarMapProvider() {
  return await SingleTileImageryProvider.fromUrl(solarGlobeMap.imageUrl, {
    ellipsoid: SOL_ELLIPSOID,
    credit: solarGlobeMap.credit,
  })
}

function SolGlobeViewer({
  onCameraAltitudeChange,
}: {
  onCameraAltitudeChange: (altitude: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const creditsContainer = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [viewpoint, setViewpoint] = useState({
    longitude: INITIAL_LONGITUDE,
    latitude: 0,
  })

  const reset = () =>
    viewerRef.current?.camera.setView({
      destination: Cartesian3.fromDegrees(
        INITIAL_LONGITUDE,
        0,
        GLOBAL_VIEW_HEIGHT,
        SOL_ELLIPSOID,
      ),
    })
  const rotate = (direction: 'left' | 'right' | 'up' | 'down') => {
    const camera = viewerRef.current?.camera
    if (!camera) return
    const angle = CesiumMath.toRadians(25)
    if (direction === 'left') camera.rotateLeft(angle)
    if (direction === 'right') camera.rotateRight(angle)
    if (direction === 'up') camera.rotateUp(angle)
    if (direction === 'down') camera.rotateDown(angle)
  }
  const zoom = (factor: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    const height =
      SOL_ELLIPSOID.cartesianToCartographic(viewer.camera.positionWC)?.height ??
      GLOBAL_VIEW_HEIGHT
    const target = Math.min(
      SOL_RADIUS * 12,
      Math.max(SOL_RADIUS * 0.01, height * factor),
    )
    viewer.camera.zoomIn(height - target)
  }

  useEffect(() => {
    if (!container.current || !creditsContainer.current) return
    const viewer = new Viewer(container.current, {
      ellipsoid: SOL_ELLIPSOID,
      globe: new Globe(SOL_ELLIPSOID),
      terrainProvider: new EllipsoidTerrainProvider({
        ellipsoid: SOL_ELLIPSOID,
      }),
      mapProjection: new GeographicProjection(SOL_ELLIPSOID),
      creditContainer: creditsContainer.current,
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      skyBox: false,
      skyAtmosphere: false,
    })
    viewerRef.current = viewer
    // Add the shared stars without Cesium's Earth-centered Sun/Moon objects.
    stabilizeGlobeZoom(viewer)
    viewer.scene.skyBox = SkyBox.createEarthSkyBox()
    viewer.scene.backgroundColor = Color.BLACK
    viewer.scene.globe.baseColor = Color.fromCssColorString('#3c2705')
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.showGroundAtmosphere = false
    const controller = viewer.scene.screenSpaceCameraController
    controller.enableCollisionDetection = false
    controller.minimumZoomDistance = SOL_RADIUS * 0.01
    controller.maximumZoomDistance = SOL_RADIUS * 12
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        INITIAL_LONGITUDE,
        0,
        GLOBAL_VIEW_HEIGHT,
        SOL_ELLIPSOID,
      ),
    })

    const reportView = () => {
      const position = SOL_ELLIPSOID.cartesianToCartographic(
        viewer.camera.positionWC,
      )
      if (!position) return
      onCameraAltitudeChange(
        `${Math.round(position.height / 1000).toLocaleString('en-US')} KM`,
      )
      setViewpoint({
        longitude: CesiumMath.toDegrees(position.longitude),
        latitude: CesiumMath.toDegrees(position.latitude),
      })
    }
    viewer.camera.percentageChanged = 0.005
    const removeChange = viewer.camera.changed.addEventListener(reportView)
    const removeEnd = viewer.camera.moveEnd.addEventListener(reportView)
    reportView()
    let disposed = false
    void createSolarMapProvider()
      .then((provider) => {
        if (disposed) return
        viewer.imageryLayers.addImageryProvider(provider)
        setLoadStatus('ready')
      })
      .catch(() => {
        if (!disposed) setLoadStatus('error')
      })
    return () => {
      disposed = true
      removeChange()
      removeEnd()
      viewerRef.current = null
      viewer.destroy()
    }
  }, [onCameraAltitudeChange])

  return (
    <div
      className="sol-globe-viewer"
      role="region"
      aria-label="Solar globe. Drag to rotate, scroll to zoom, or use the controls."
      tabIndex={0}
      onKeyDown={(event) => {
        const directions = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
        } as const
        if (event.key in directions) {
          event.preventDefault()
          rotate(directions[event.key as keyof typeof directions])
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          zoom(0.8)
        }
        if (event.key === '-') {
          event.preventDefault()
          zoom(1.25)
        }
        if (event.key === '0') {
          event.preventDefault()
          reset()
        }
      }}
    >
      <div ref={container} className="sol-globe-viewer__canvas" />
      <div ref={creditsContainer} className="sol-globe-viewer__credits" />
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>
          {solarGlobeMap.wavelength} · CR {solarGlobeMap.carringtonRotation}
        </span>
        <span>{solarGlobeMap.period}</span>
        <span>ROTATION COMPOSITE · FALSE COLOR</span>
      </div>
      {loadStatus !== 'ready' && (
        <div className="sol-viewer__status" role="status">
          {loadStatus === 'loading'
            ? 'LOADING SOLAR GLOBE'
            : 'SOLAR MAP UNAVAILABLE · REOPEN GLOBE TO RETRY'}
        </div>
      )}
      <div className="hud hud--left sol-globe-viewer__position">
        SOLAR GLOBE · SYNOPTIC MAP
        <br />
        <span>DRAG TO ROTATE · SCROLL TO ZOOM</span>
        <br />
        <span>
          {viewpoint.longitude.toFixed(1)}° LON ·{' '}
          {viewpoint.latitude.toFixed(1)}° LAT
        </span>
      </div>
      <div className="sol-viewer__controls">
        <button
          type="button"
          aria-label="Rotate globe left"
          onClick={() => rotate('left')}
        >
          ←
        </button>
        <button
          type="button"
          aria-label="Rotate globe right"
          onClick={() => rotate('right')}
        >
          →
        </button>
        <button
          type="button"
          aria-label="Zoom globe in"
          onClick={() => zoom(0.8)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom globe out"
          onClick={() => zoom(1.25)}
        >
          −
        </button>
        <button type="button" onClick={reset}>
          RESET
        </button>
      </div>
      <div className="sol-viewer__credit">
        NASA / SDO · AIA 171 Å · FALSE COLOR · SYNOPTIC MAP DISPLAY
      </div>
    </div>
  )
}

export default SolGlobeViewer
