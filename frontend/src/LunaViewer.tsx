import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  SkyBox,
  Viewer,
  WebMapServiceImageryProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import { stabilizeGlobeZoom } from './globeCamera.ts'

const LUNA_ELLIPSOID = new Ellipsoid(1_737_400, 1_737_400, 1_737_400)
const LUNA_GLOBAL_VIEW_HEIGHT_METERS = 6_000_000

const USGS_LUNA_WMS_URL =
  'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/earth/moon_simp_cyl.map'

export type LunaViewerMode = 'imagery' | 'relief'

const lunarLayers = {
  imagery: {
    layer: 'LROC_WAC',
    title: 'LROC WAC GLOBAL MOSAIC',
    detail: '100 M SOURCE PRODUCT · NASA / ASU · USGS WMS',
    credit: 'NASA / ASU LROC WAC global mosaic, served by USGS Astrogeology',
  },
  relief: {
    layer: 'LOLA_color',
    title: 'LOLA COLOUR SHADED RELIEF',
    detail: '256 PIXELS / DEGREE · DISPLAY-ONLY RELIEF · USGS WMS',
    credit: 'NASA / GSFC LOLA elevation, shaded relief by USGS Astrogeology',
  },
}

function createLunaImageryProvider(mode: LunaViewerMode) {
  const source = lunarLayers[mode]
  return new WebMapServiceImageryProvider({
    url: USGS_LUNA_WMS_URL,
    layers: source.layer,
    parameters: {
      format: 'image/jpeg',
      styles: '',
      transparent: false,
      version: '1.1.1',
    },
    tilingScheme: new GeographicTilingScheme({ ellipsoid: LUNA_ELLIPSOID }),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel: 8,
    enablePickFeatures: false,
    credit: source.credit,
  })
}

type LunaViewerProps = {
  mode: LunaViewerMode
  onCoverageChange: (coverage: string) => void
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

function LunaViewer({
  mode,
  onCameraAltitudeChange,
  onCoverageChange,
}: LunaViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<LunaViewerMode>(mode)
  const setViewerModeRef = useRef<((mode: LunaViewerMode) => void) | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [imageryError, setImageryError] = useState(false)
  const [cameraAltitude, setCameraAltitude] = useState(
    LUNA_GLOBAL_VIEW_HEIGHT_METERS,
  )

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
      skyBox: SkyBox.createEarthSkyBox(),
      terrainProvider: new EllipsoidTerrainProvider({
        ellipsoid: LUNA_ELLIPSOID,
      }),
      timeline: false,
    })
    stabilizeGlobeZoom(viewer)
    viewer.scene.backgroundColor = Color.BLACK
    viewer.scene.globe.baseColor = Color.fromCssColorString('#89909a')
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false
    }
    let baseLayer = viewer.imageryLayers.addImageryProvider(
      createLunaImageryProvider(modeRef.current),
    )
    const reportImageryError = () => {
      setImageryError(true)
      onCoverageChange('LUNAR IMAGERY UNAVAILABLE')
    }
    let removeImageryErrorListener =
      baseLayer.imageryProvider.errorEvent.addEventListener(reportImageryError)
    const removeTileProgressListener =
      viewer.scene.globe.tileLoadProgressEvent.addEventListener(
        (remaining: number) => setIsLoading(remaining > 0),
      )
    setViewerModeRef.current = (nextMode) => {
      if (modeRef.current === nextMode) return
      modeRef.current = nextMode
      removeImageryErrorListener()
      viewer.imageryLayers.remove(baseLayer, true)
      setImageryError(false)
      setIsLoading(true)
      baseLayer = viewer.imageryLayers.addImageryProvider(
        createLunaImageryProvider(nextMode),
      )
      removeImageryErrorListener =
        baseLayer.imageryProvider.errorEvent.addEventListener(
          reportImageryError,
        )
      onCoverageChange(`${lunarLayers[nextMode].title} · VISIBLE TILES`)
    }
    onCoverageChange(`${lunarLayers[modeRef.current].title} · VISIBLE TILES`)
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        0,
        0,
        LUNA_GLOBAL_VIEW_HEIGHT_METERS,
        LUNA_ELLIPSOID,
      ),
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
      setViewerModeRef.current = null
      removeImageryErrorListener()
      removeTileProgressListener()
      removeCameraChangedListener()
      removeCameraMoveEndListener()
      viewer.destroy()
    }
  }, [onCameraAltitudeChange, onCoverageChange])

  useEffect(() => {
    setViewerModeRef.current?.(mode)
  }, [mode])

  const source = lunarLayers[mode]

  return (
    <div className="luna-viewer" tabIndex={0}>
      <div ref={viewerContainerRef} className="luna-viewer__canvas" />
      {isLoading && !imageryError && (
        <div className="viewer-tile-loading" role="status">
          <div className="viewer-tile-loading__spinner" />
          <strong>LOADING LUNAR TILES</strong>
        </div>
      )}
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>{source.title}</span>
        <span>{source.detail}</span>
        {imageryError && (
          <span role="alert">IMAGERY UNAVAILABLE · SWITCH LAYER TO RETRY</span>
        )}
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
      <div className="hud hud--left">
        LIVE SELENOCENTRIC LUNA GLOBE
        <br />
        <span>DRAG TO NAVIGATE · SCROLL TO ZOOM</span>
      </div>
      <div className="imagery-provenance">
        <span>{source.title} · USGS ASTROGEOLOGY</span>
        <span>{source.detail}</span>
      </div>
    </div>
  )
}

export default LunaViewer
