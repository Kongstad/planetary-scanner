import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  Globe,
  Viewer,
} from 'cesium'
import { useEffect, useRef, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const LUNA_ELLIPSOID = new Ellipsoid(1_737_400, 1_737_400, 1_737_400)
const LUNA_GLOBAL_VIEW_HEIGHT_METERS = 6_000_000

type LunaViewerProps = {
  onCameraAltitudeChange: (altitude: string) => void
}

function formatCameraAltitude(heightMeters: number): string {
  if (heightMeters < 1_000) {
    return `${Math.round(heightMeters)} M`
  }
  return `${(heightMeters / 1_000).toFixed(heightMeters < 10_000 ? 1 : 0)} KM`
}

function getLunaCameraAltitude(viewer: Viewer): number {
  const cartographicPosition = LUNA_ELLIPSOID.cartesianToCartographic(
    viewer.camera.positionWC,
  )
  if (!cartographicPosition) {
    throw new Error('Unable to determine the Luna camera altitude')
  }
  return cartographicPosition.height
}

function LunaViewer({ onCameraAltitudeChange }: LunaViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const [cameraAltitude, setCameraAltitude] = useState(LUNA_GLOBAL_VIEW_HEIGHT_METERS)

  useEffect(() => {
    const container = viewerContainerRef.current
    if (!container) {
      return
    }

    const viewer = new Viewer(container, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      globe: new Globe(LUNA_ELLIPSOID),
      homeButton: false,
      infoBox: false,
      mapProjection: new GeographicProjection(LUNA_ELLIPSOID),
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: LUNA_ELLIPSOID }),
      timeline: false,
    })
    viewer.scene.backgroundColor = Color.BLACK
    viewer.scene.globe.baseColor = Color.fromCssColorString('#89909a')
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false
    }
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 0, LUNA_GLOBAL_VIEW_HEIGHT_METERS, LUNA_ELLIPSOID),
    })

    const updateViewerTelemetry = () => {
      const altitude = getLunaCameraAltitude(viewer)
      setCameraAltitude(altitude)
      onCameraAltitudeChange(formatCameraAltitude(altitude))
    }

    viewer.camera.percentageChanged = 0.01
    const removeCameraChangedListener = viewer.camera.changed.addEventListener(
      updateViewerTelemetry,
    )
    const removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(
      updateViewerTelemetry,
    )
    updateViewerTelemetry()

    return () => {
      removeCameraChangedListener()
      removeCameraMoveEndListener()
      viewer.destroy()
    }
  }, [onCameraAltitudeChange])

  return (
    <div className="luna-viewer">
      <div ref={viewerContainerRef} className="luna-viewer__canvas" />
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>LUNAR VIEWER SCAFFOLD</span>
        <span>IMAGERY AND RELIEF SOURCES PENDING</span>
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
      <div className="hud hud--left">
        LIVE SELENOCENTRIC LUNA GLOBE
        <br />
        <span>DRAG TO NAVIGATE · SCROLL TO ZOOM</span>
      </div>
      <div className="imagery-provenance">
        <span>GLOBAL LUNAR BASE · CONTENT PENDING</span>
        <span>IMAGERY / RELIEF SOURCE SELECTION PENDING</span>
      </div>
    </div>
  )
}

export default LunaViewer
