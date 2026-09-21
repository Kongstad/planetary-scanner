import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  Viewer,
  WebMapServiceImageryProvider,
} from 'cesium'
import { useEffect, useRef, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MARS_ELLIPSOID = new Ellipsoid(3_396_190, 3_396_190, 3_376_200)
const MARS_GLOBAL_VIEW_HEIGHT_METERS = 11_000_000
const USGS_MARS_WMS_URL = 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map'

export type MarsViewerMode = 'imagery' | 'infrared' | 'relief'

type MarsViewerProps = {
  mode: MarsViewerMode
  onCameraAltitudeChange: (altitude: string) => void
  onCoverageChange: (coverage: string) => void
}

function formatCameraAltitude(heightMeters: number): string {
  if (heightMeters < 1_000) {
    return `${Math.round(heightMeters)} M`
  }
  return `${(heightMeters / 1_000).toFixed(heightMeters < 10_000 ? 1 : 0)} KM`
}

function getMarsCameraAltitude(viewer: Viewer): number {
  const cartographicPosition = MARS_ELLIPSOID.cartesianToCartographic(
    viewer.camera.positionWC,
  )
  if (!cartographicPosition) {
    throw new Error('Unable to determine the Mars camera altitude')
  }
  return cartographicPosition.height
}

function createMarsWmsProvider(
  layer: string,
  maximumLevel: number,
  credit: string,
) {
  return new WebMapServiceImageryProvider({
    url: USGS_MARS_WMS_URL,
    layers: layer,
    parameters: {
      format: 'image/jpeg',
      styles: '',
      transparent: false,
      version: '1.1.1',
    },
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MARS_ELLIPSOID }),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel,
    enablePickFeatures: false,
    credit,
  })
}

function createBaseImageryProvider(mode: MarsViewerMode) {
  if (mode === 'imagery') {
    return createMarsWmsProvider(
      'MDIM21_color',
      9,
      'USGS Astrogeology: MDIM 2.1 color mosaic WMS',
    )
  }
  if (mode === 'infrared') {
    return createMarsWmsProvider(
      'THEMIS',
      10,
      'USGS Astrogeology: THEMIS global mosaic WMS',
    )
  }
  return createMarsWmsProvider(
      'MOLA_color',
      8,
      'USGS Astrogeology: MOLA color relief WMS',
  )
}

function MarsViewer({ mode, onCameraAltitudeChange, onCoverageChange }: MarsViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const setViewerModeRef = useRef<((mode: MarsViewerMode) => void) | null>(null)
  const modeRef = useRef<MarsViewerMode>(mode)
  const [cameraAltitude, setCameraAltitude] = useState(MARS_GLOBAL_VIEW_HEIGHT_METERS)

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
      globe: new Globe(MARS_ELLIPSOID),
      homeButton: false,
      infoBox: false,
      mapProjection: new GeographicProjection(MARS_ELLIPSOID),
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: MARS_ELLIPSOID }),
      timeline: false,
    })
    viewer.scene.backgroundColor = Color.BLACK
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false
    }
    let baseLayer = viewer.imageryLayers.addImageryProvider(
      createBaseImageryProvider(modeRef.current),
    )
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 10, MARS_GLOBAL_VIEW_HEIGHT_METERS, MARS_ELLIPSOID),
    })
    const updateViewerTelemetry = () => {
      const altitude = getMarsCameraAltitude(viewer)
      setCameraAltitude(altitude)
      onCameraAltitudeChange(formatCameraAltitude(altitude))
      onCoverageChange(
        modeRef.current === 'imagery'
          ? 'MDIM 2.1 COLOUR · VISIBLE TILES'
          : modeRef.current === 'infrared'
            ? 'THEMIS IR · VISIBLE TILES'
            : 'MOLA COLOR RELIEF · VISIBLE TILES',
      )
    }
    const updateViewerMode = (nextMode: MarsViewerMode) => {
      if (modeRef.current === nextMode) {
        return
      }
      modeRef.current = nextMode
      viewer.imageryLayers.remove(baseLayer, true)
      baseLayer = viewer.imageryLayers.addImageryProvider(createBaseImageryProvider(nextMode))
      updateViewerTelemetry()
    }

    setViewerModeRef.current = updateViewerMode
    viewer.camera.percentageChanged = 0.01
    const removeCameraChangedListener = viewer.camera.changed.addEventListener(
      updateViewerTelemetry,
    )
    const removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(
      updateViewerTelemetry,
    )
    updateViewerTelemetry()

    return () => {
      setViewerModeRef.current = null
      removeCameraChangedListener()
      removeCameraMoveEndListener()
      viewer.destroy()
    }
  }, [onCameraAltitudeChange, onCoverageChange])

  useEffect(() => {
    setViewerModeRef.current?.(mode)
  }, [mode])

  const sourceText = mode === 'imagery'
    ? 'MDIM 2.1 COLOUR MOSAIC · 231 M SOURCE PRODUCT'
    : mode === 'infrared'
      ? 'THEMIS INFRARED MOSAIC · ~100 M SOURCE PRODUCT'
      : 'MOLA COLOUR RELIEF · 463 M GRID PRODUCT'
  const sourceDetail = mode === 'imagery'
    ? 'USGS ASTROGEOLOGY · MDIM 2.1 WMS'
    : mode === 'infrared'
      ? 'USGS ASTROGEOLOGY · THEMIS IR WMS'
      : 'USGS ASTROGEOLOGY · MOLA ELEVATION VISUALIZATION'
  const provenance = mode === 'imagery'
    ? 'GLOBAL IMAGERY · MDIM 2.1 COLOUR MOSAIC · USGS'
    : mode === 'infrared'
      ? 'GLOBAL INFRARED · THEMIS MOSAIC · USGS'
      : 'GLOBAL RELIEF · MOLA COLOR · USGS'
  const resolution = mode === 'imagery'
    ? 'RESOLUTION · 231 M · MDIM 2.1 COLOR MOSAIC'
    : mode === 'infrared'
      ? 'RESOLUTION · ~100 M · THEMIS INFRARED MOSAIC'
      : 'GRID SPACING · ~463 M · DISPLAY-ONLY RELIEF'

  return (
    <div className="mars-viewer">
      <div ref={viewerContainerRef} className="mars-viewer__canvas" />
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>{sourceText}</span>
        <span>{sourceDetail}</span>
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
      <div className="hud hud--left">
        LIVE PLANETOCENTRIC MARS GLOBE
        <br />
        <span>DRAG TO NAVIGATE · SCROLL TO ZOOM</span>
      </div>
      <div className="imagery-provenance">
        <span>{provenance}</span>
        <span>{sourceDetail}</span>
        <span>{resolution}</span>
      </div>
    </div>
  )
}

export default MarsViewer
