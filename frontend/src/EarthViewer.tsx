import type { ImageryLayer } from 'cesium'
import {
  Cartesian3,
  Math as CesiumMath,
  Color,
  EllipsoidTerrainProvider,
  Matrix4,
  SkyBox,
  UrlTemplateImageryProvider,
  Viewer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  WebMercatorTilingScheme,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import { DILITHIUM_DEPOSIT } from './dilithiumDeposit.ts'
import { stabilizeGlobeZoom } from './globeCamera.ts'
import { IS_STATIC_DEMO } from './runtime.ts'

const COPENHAGEN_LONGITUDE = 12.5683
const COPENHAGEN_LATITUDE = 55.6761
const GLOBAL_VIEW_HEIGHT_METERS = 20_000_000
const SENTINEL_2_DISPLAY_HEIGHT_METERS = 200_000
const EOX_SENTINEL_2_CLOUDLESS_TILES_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'
const GEBCO_WMS_URL = 'https://wms.gebco.net/mapserv?'
const GIBS_GLOBAL_LAYER_DATE = '2026-09-20'
const GIBS_WMTS_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png'

type Sentinel2Scene = {
  item_id: string
  observed_at?: string
  cloud_cover?: number
  mgrs_tile?: string
  tile_id?: string
  display_min_m?: number
  display_max_m?: number
  display_min_c?: number
  display_max_c?: number
  tile_url: string
}

type ActiveScene = Sentinel2Scene & {
  imageryLoaded: boolean
}

export type ViewerMode =
  'imagery' | 'terrain' | 'relief' | 'biosphere' | 'thermal'

type EarthViewerProps = {
  mode: ViewerMode
  depositFocusRequest: number
  onCoverageChange: (coverage: string) => void
}

function formatCameraAltitude(heightMeters: number): string {
  if (heightMeters < 1_000) {
    return `${Math.round(heightMeters)} M`
  }
  return `${(heightMeters / 1_000).toFixed(heightMeters < 10_000 ? 1 : 0)} KM`
}

function formatElevation(heightMeters: number): string {
  return `${Math.round(heightMeters).toLocaleString()} M`
}

function createGibsImageryProvider(
  layer: string,
  tileMatrixSetId: string,
  maximumLevel: number,
  credit: string,
) {
  return new WebMapTileServiceImageryProvider({
    url: GIBS_WMTS_URL,
    layer,
    style: 'default',
    format: 'image/png',
    tileMatrixSetID: tileMatrixSetId,
    tilingScheme: new WebMercatorTilingScheme(),
    maximumLevel,
    tileMatrixLabels: Array.from({ length: maximumLevel + 1 }, (_, level) =>
      level.toString(),
    ),
    dimensions: { Time: GIBS_GLOBAL_LAYER_DATE },
    credit,
  })
}

function isInsideDilithiumDeposit(
  longitude: number,
  latitude: number,
): boolean {
  let isInside = false
  const points = DILITHIUM_DEPOSIT.polygon
  for (
    let index = 0, previousIndex = points.length - 1;
    index < points.length;
    previousIndex = index++
  ) {
    const [longitudeA, latitudeA] = points[index]
    const [longitudeB, latitudeB] = points[previousIndex]
    const intersects =
      latitudeA > latitude !== latitudeB > latitude &&
      longitude <
        ((longitudeB - longitudeA) * (latitude - latitudeA)) /
          (latitudeB - latitudeA) +
          longitudeA
    if (intersects) {
      isInside = !isInside
    }
  }
  return isInside
}

function getDilithiumDensity(longitude: number, latitude: number): number {
  const { bounds, densitySamples } = DILITHIUM_DEPOSIT
  const normalizedLongitude =
    (longitude - bounds.west) / (bounds.east - bounds.west)
  const normalizedLatitude =
    (latitude - bounds.south) / (bounds.north - bounds.south)
  const sampleDensity = densitySamples.reduce((total, [x, y, density]) => {
    const distanceSquared =
      (normalizedLongitude - x) ** 2 + (normalizedLatitude - y) ** 2
    return total + density * Math.exp(-distanceSquared / 0.008)
  }, 0)
  const distanceFromCenterSquared =
    (normalizedLongitude - 0.5) ** 2 + (normalizedLatitude - 0.5) ** 2
  return Math.min(
    1,
    sampleDensity * Math.exp(-distanceFromCenterSquared / 0.22),
  )
}

function getDilithiumGridColor(density: number): Color {
  const stops = [
    { density: 0, color: [128, 0, 38] },
    { density: 0.25, color: [214, 54, 55] },
    { density: 0.5, color: [249, 142, 82] },
    { density: 0.7, color: [177, 211, 77] },
    { density: 1, color: [0, 104, 55] },
  ]
  const upperIndex = stops.findIndex((stop) => density <= stop.density)
  if (upperIndex <= 0) {
    const [red, green, blue] = stops[0].color
    return Color.fromBytes(red, green, blue, Math.round(35 + density * 180))
  }
  const lower = stops[upperIndex - 1]
  const upper = stops[upperIndex]
  const ratio = (density - lower.density) / (upper.density - lower.density)
  const color = lower.color.map((channel, index) =>
    Math.round(channel + (upper.color[index] - channel) * ratio),
  )
  return Color.fromBytes(
    color[0],
    color[1],
    color[2],
    Math.round(35 + density * 180),
  )
}

function EarthViewer({
  mode,
  depositFocusRequest,
  onCoverageChange,
}: EarthViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const requestSentinel2ScenesRef = useRef<(() => void) | null>(null)
  const setViewerModeRef = useRef<((nextMode: ViewerMode) => void) | null>(null)
  const focusDilithiumDepositRef = useRef<(() => void) | null>(null)
  const resetViewRef = useRef<(() => void) | null>(null)
  const modeRef = useRef<ViewerMode>(mode)
  const [activeScenes, setActiveScenes] = useState<ActiveScene[]>([])
  const [scanAvailable, setScanAvailable] = useState(false)
  const [viewerMode, setViewerMode] = useState<ViewerMode>(mode)
  const [cameraAltitude, setCameraAltitude] = useState(
    GLOBAL_VIEW_HEIGHT_METERS,
  )
  const [isDilithiumDepositVisible, setIsDilithiumDepositVisible] =
    useState(false)
  const [globalTileStatus, setGlobalTileStatus] = useState('READY')
  const [globalTileError, setGlobalTileError] = useState<string | null>(null)
  const [isDetailDiscoveryLoading, setIsDetailDiscoveryLoading] =
    useState(false)
  const terrainDisplayRange = activeScenes.find(
    (
      scene,
    ): scene is ActiveScene & {
      display_min_m: number
      display_max_m: number
    } => scene.display_min_m !== undefined && scene.display_max_m !== undefined,
  )
  const [imageryStatus, setImageryStatus] = useState(
    'GLOBAL IMAGERY · EOX SENTINEL-2 CLOUDLESS',
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
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      timeline: false,
    })
    stabilizeGlobeZoom(viewer)
    viewer.scene.skyBox = SkyBox.createEarthSkyBox()
    viewer.scene.globe.showGroundAtmosphere = true
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(
        COPENHAGEN_LONGITUDE,
        COPENHAGEN_LATITUDE,
        GLOBAL_VIEW_HEIGHT_METERS,
      ),
    })
    const globalSurfaceLayer = viewer.imageryLayers.addImageryProvider(
      new UrlTemplateImageryProvider({
        url: EOX_SENTINEL_2_CLOUDLESS_TILES_URL,
        credit: 'Sentinel-2 cloudless 2024 by EOX IT Services GmbH',
      }),
    )
    globalSurfaceLayer.brightness = 0.88
    globalSurfaceLayer.contrast = 1.04
    globalSurfaceLayer.saturation = 0.78
    const reliefLayer = viewer.imageryLayers.addImageryProvider(
      new WebMapServiceImageryProvider({
        url: GEBCO_WMS_URL,
        layers: 'GEBCO_LATEST',
        parameters: {
          format: 'image/png',
          styles: '',
          transparent: false,
          version: '1.3.0',
        },
        maximumLevel: 8,
        enablePickFeatures: false,
        credit: 'GEBCO_2026 Grid: global relief and bathymetry',
      }),
    )
    reliefLayer.show = false
    const globalBiosphereProvider = createGibsImageryProvider(
      'MODIS_Terra_NDVI_8Day',
      'GoogleMapsCompatible_Level9',
      9,
      `NASA GIBS: MODIS Terra NDVI 8-day · ${GIBS_GLOBAL_LAYER_DATE}`,
    )
    const globalBiosphereLayer = viewer.imageryLayers.addImageryProvider(
      globalBiosphereProvider,
    )
    globalBiosphereLayer.show = false
    globalBiosphereLayer.alpha = 0.82
    const globalThermalProvider = createGibsImageryProvider(
      'MODIS_Terra_Land_Surface_Temp_Day',
      'GoogleMapsCompatible_Level7',
      7,
      `NASA GIBS: MODIS Terra daytime land-surface temperature · ${GIBS_GLOBAL_LAYER_DATE}`,
    )
    const globalThermalLayer = viewer.imageryLayers.addImageryProvider(
      globalThermalProvider,
    )
    globalThermalLayer.show = false
    globalThermalLayer.alpha = 0.82
    const reportGlobalTileError = (message: string) => {
      setGlobalTileError(message.slice(0, 96))
      setGlobalTileStatus('TILE REQUEST FAILED')
    }
    const removeBiosphereErrorListener =
      globalBiosphereProvider.errorEvent.addEventListener((error) =>
        reportGlobalTileError(error.message),
      )
    const removeThermalErrorListener =
      globalThermalProvider.errorEvent.addEventListener((error) =>
        reportGlobalTileError(error.message),
      )
    let isDilithiumDepositRequested = false
    let depositRevealTimer: number | undefined
    const sentinel2Layers = new Map<string, ImageryLayer>()
    let requestSequence = 0
    let disposed = false

    const removeSentinel2Layers = () => {
      for (const layer of sentinel2Layers.values()) {
        viewer.imageryLayers.remove(layer, true)
      }
      sentinel2Layers.clear()
      if (!disposed) {
        setActiveScenes([])
      }
    }

    const refreshDetailLayers = async () => {
      const viewRectangle = viewer.camera.computeViewRectangle()
      if (!viewRectangle || viewRectangle.west >= viewRectangle.east) {
        setImageryStatus('DETAIL · UNAVAILABLE FOR CURRENT VIEW')
        removeSentinel2Layers()
        return
      }
      const query = new URLSearchParams({
        west: CesiumMath.toDegrees(viewRectangle.west).toFixed(1),
        south: CesiumMath.toDegrees(viewRectangle.south).toFixed(1),
        east: CesiumMath.toDegrees(viewRectangle.east).toFixed(1),
        north: CesiumMath.toDegrees(viewRectangle.north).toFixed(1),
      })
      const currentRequestSequence = ++requestSequence
      const activeMode = modeRef.current
      setImageryStatus(
        activeMode === 'terrain'
          ? 'DETAIL · SELECTING COPERNICUS DEM TILES'
          : 'DETAIL · SELECTING LATEST LOW-CLOUD SENTINEL-2 SCENES',
      )
      onCoverageChange('ANALYSING VIEWPORT')
      const endpoint =
        activeMode === 'terrain'
          ? '/imagery/copernicus-dem/scenes'
          : '/imagery/sentinel-2/scenes?mode=imagery'
      const response = await fetch(
        `${endpoint}${activeMode === 'imagery' || activeMode === 'biosphere' ? '&' : '?'}${query}`,
      )
      if (!response.ok) {
        throw new Error(`Sentinel-2 scene API returned ${response.status}`)
      }
      const scenes = (await response.json()) as Sentinel2Scene[]
      if (disposed || currentRequestSequence !== requestSequence) {
        return
      }
      removeSentinel2Layers()
      setActiveScenes(
        scenes.map((scene) => ({ ...scene, imageryLoaded: false })),
      )
      for (const scene of scenes) {
        const imageryProvider = new UrlTemplateImageryProvider({
          url: scene.tile_url,
        })
        const requestImage = imageryProvider.requestImage.bind(imageryProvider)
        imageryProvider.requestImage = (...arguments_) => {
          const image = requestImage(...arguments_)
          if (image) {
            void Promise.resolve(image).then(
              () => {
                if (!disposed && currentRequestSequence === requestSequence) {
                  setActiveScenes((currentScenes) =>
                    currentScenes.map((currentScene) =>
                      currentScene.item_id === scene.item_id
                        ? { ...currentScene, imageryLoaded: true }
                        : currentScene,
                    ),
                  )
                }
              },
              () => undefined,
            )
          }
          return image
        }
        const detailLayer =
          viewer.imageryLayers.addImageryProvider(imageryProvider)
        viewer.imageryLayers.raiseToTop(detailLayer)
        sentinel2Layers.set(scene.item_id, detailLayer)
      }
      setImageryStatus(
        scenes.length === 0
          ? 'DETAIL · NO USABLE SENTINEL-2 SCENES'
          : scenes.length === 1
            ? 'DETAIL · 1 ACTIVE SENTINEL-2 SCENE'
            : `DETAIL · ${scenes.length} ACTIVE SENTINEL-2 SCENE MOSAIC`,
      )
      onCoverageChange(
        scenes.length === 0
          ? 'NO USABLE COVERAGE'
          : `DETAIL MOSAIC · ${scenes.length} ${scenes.length === 1 ? 'TILE' : 'TILES'}`,
      )
    }

    const requestDetailScenes = () => {
      if (IS_STATIC_DEMO) return
      if (modeRef.current !== 'imagery' && modeRef.current !== 'terrain') {
        return
      }
      const isCloseEnoughToScan =
        !IS_STATIC_DEMO &&
        viewer.camera.positionCartographic.height <=
          SENTINEL_2_DISPLAY_HEIGHT_METERS
      setScanAvailable(isCloseEnoughToScan)
      if (!isCloseEnoughToScan) {
        requestSequence += 1
        removeSentinel2Layers()
        setIsDetailDiscoveryLoading(false)
        setImageryStatus('DETAIL · ZOOM BELOW 200 KM TO SCAN')
        onCoverageChange('GLOBAL BASELINE')
        return
      }
      setIsDetailDiscoveryLoading(true)
      void refreshDetailLayers()
        .catch(() => {
          if (!disposed) {
            removeSentinel2Layers()
            setImageryStatus('DETAIL · SCENE DISCOVERY UNAVAILABLE')
            onCoverageChange('DISCOVERY UNAVAILABLE')
          }
        })
        .finally(() => {
          if (!disposed) {
            setIsDetailDiscoveryLoading(false)
          }
        })
    }
    const clearDetailScenesForNavigation = () => {
      requestSequence += 1
      removeSentinel2Layers()
      setIsDetailDiscoveryLoading(false)
      if (
        modeRef.current === 'relief' ||
        modeRef.current === 'biosphere' ||
        modeRef.current === 'thermal'
      ) {
        setCameraAltitude(viewer.camera.positionCartographic.height)
        setScanAvailable(false)
        const globalStatus =
          modeRef.current === 'relief'
            ? 'GEBCO_2026 · GLOBAL RELIEF & BATHYMETRY'
            : modeRef.current === 'biosphere'
              ? `MODIS TERRA NDVI · 8-DAY · ${GIBS_GLOBAL_LAYER_DATE}`
              : `MODIS TERRA DAYTIME LST · DAILY · ${GIBS_GLOBAL_LAYER_DATE}`
        setImageryStatus(globalStatus)
        onCoverageChange(
          modeRef.current === 'relief'
            ? 'GEBCO GLOBAL WMS · VISIBLE TILES'
            : modeRef.current === 'biosphere'
              ? 'MODIS NDVI GLOBAL TILES'
              : 'MODIS LST GLOBAL TILES',
        )
        return
      }
      const isCloseEnoughToScan =
        viewer.camera.positionCartographic.height <=
        SENTINEL_2_DISPLAY_HEIGHT_METERS
      setCameraAltitude(viewer.camera.positionCartographic.height)
      setScanAvailable(isCloseEnoughToScan)
      setImageryStatus(
        IS_STATIC_DEMO
          ? 'GLOBAL IMAGERY · STATIC VIEWER DEMO'
          : !isCloseEnoughToScan
            ? 'DETAIL · ZOOM BELOW 200 KM TO SCAN'
            : 'DETAIL · PRESS SCAN FOR CURRENT VIEW',
      )
      onCoverageChange(
        isCloseEnoughToScan ? 'AWAITING SCAN' : 'GLOBAL BASELINE',
      )
    }
    const removeCameraChangedListener = viewer.camera.changed.addEventListener(
      clearDetailScenesForNavigation,
    )
    const removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(
      clearDetailScenesForNavigation,
    )
    const removeTileLoadProgressListener =
      viewer.scene.globe.tileLoadProgressEvent.addEventListener(
        (pendingTileCount: number) => {
          if (
            modeRef.current === 'relief' ||
            modeRef.current === 'biosphere' ||
            modeRef.current === 'thermal'
          ) {
            setGlobalTileStatus(
              pendingTileCount > 0
                ? `LOADING ${pendingTileCount} TILES`
                : 'READY',
            )
          }
        },
      )
    const updateViewerMode = (nextMode: ViewerMode) => {
      modeRef.current = nextMode
      setViewerMode(nextMode)
      globalSurfaceLayer.show =
        nextMode === 'imagery' ||
        nextMode === 'biosphere' ||
        nextMode === 'thermal'
      reliefLayer.show = nextMode === 'relief'
      globalBiosphereLayer.show = nextMode === 'biosphere'
      globalThermalLayer.show = nextMode === 'thermal'
      setGlobalTileStatus(
        nextMode === 'relief' ||
          nextMode === 'biosphere' ||
          nextMode === 'thermal'
          ? 'LOADING TILES'
          : 'READY',
      )
      setGlobalTileError(null)
      clearDetailScenesForNavigation()
    }
    requestSentinel2ScenesRef.current = requestDetailScenes
    setViewerModeRef.current = updateViewerMode
    focusDilithiumDepositRef.current = () => {
      viewer.camera.cancelFlight()
      viewer.trackedEntity = undefined
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          DILITHIUM_DEPOSIT.center.longitude,
          DILITHIUM_DEPOSIT.center.latitude,
          1_000_000,
        ),
        duration: 2,
        orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
        complete: () => {
          if (disposed || isDilithiumDepositRequested) {
            return
          }
          isDilithiumDepositRequested = true
          setIsDilithiumDepositVisible(true)
          depositRevealTimer = window.setTimeout(() => {
            if (disposed || !isDilithiumDepositRequested) return
            viewer.entities.suspendEvents()
            try {
              const latitudeStep = 0.025
              const longitudeStep = 0.08
              for (
                let latitude = DILITHIUM_DEPOSIT.bounds.south;
                latitude < DILITHIUM_DEPOSIT.bounds.north;
                latitude += latitudeStep
              ) {
                for (
                  let longitude = DILITHIUM_DEPOSIT.bounds.west;
                  longitude < DILITHIUM_DEPOSIT.bounds.east;
                  longitude += longitudeStep
                ) {
                  const nextLatitude = Math.min(
                    latitude + latitudeStep,
                    DILITHIUM_DEPOSIT.bounds.north,
                  )
                  const nextLongitude = Math.min(
                    longitude + longitudeStep,
                    DILITHIUM_DEPOSIT.bounds.east,
                  )
                  const corners = [
                    [longitude, latitude],
                    [nextLongitude, latitude],
                    [nextLongitude, nextLatitude],
                    [longitude, nextLatitude],
                  ]
                  if (
                    !corners.every(([cellLongitude, cellLatitude]) =>
                      isInsideDilithiumDeposit(cellLongitude, cellLatitude),
                    )
                  ) {
                    continue
                  }
                  const density = getDilithiumDensity(
                    (longitude + nextLongitude) / 2,
                    (latitude + nextLatitude) / 2,
                  )
                  if (density < 0.08) {
                    continue
                  }
                  viewer.entities.add({
                    polygon: {
                      hierarchy: Cartesian3.fromDegreesArray(corners.flat()),
                      material: getDilithiumGridColor(density),
                    },
                  })
                }
              }
            } finally {
              viewer.entities.resumeEvents()
            }
            depositRevealTimer = undefined
          }, 350)
        },
      })
      setImageryStatus('FICTIONAL · DILITHIUM DEPOSIT DENSITY MODEL')
      onCoverageChange('FICTIONAL SCENARIO')
    }
    resetViewRef.current = () => {
      viewer.camera.cancelFlight()
      viewer.trackedEntity = undefined
      viewer.selectedEntity = undefined
      viewer.camera.lookAtTransform(Matrix4.IDENTITY)
      viewer.scene.screenSpaceCameraController.enableInputs = true
      if (depositRevealTimer !== undefined) {
        window.clearTimeout(depositRevealTimer)
        depositRevealTimer = undefined
      }
      isDilithiumDepositRequested = false
      viewer.entities.removeAll()
      setIsDilithiumDepositVisible(false)
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(
          COPENHAGEN_LONGITUDE,
          COPENHAGEN_LATITUDE,
          GLOBAL_VIEW_HEIGHT_METERS,
        ),
        orientation: { heading: 0, pitch: -CesiumMath.PI_OVER_TWO, roll: 0 },
      })
      clearDetailScenesForNavigation()
    }
    viewer.camera.percentageChanged = 0.01
    clearDetailScenesForNavigation()

    return () => {
      disposed = true
      requestSequence += 1
      if (depositRevealTimer !== undefined) {
        window.clearTimeout(depositRevealTimer)
      }
      requestSentinel2ScenesRef.current = null
      setViewerModeRef.current = null
      focusDilithiumDepositRef.current = null
      resetViewRef.current = null
      removeCameraChangedListener()
      removeCameraMoveEndListener()
      removeTileLoadProgressListener()
      removeBiosphereErrorListener()
      removeThermalErrorListener()
      removeSentinel2Layers()
      viewer.destroy()
    }
  }, [onCoverageChange])

  useEffect(() => {
    setViewerModeRef.current?.(mode)
  }, [mode])

  useEffect(() => {
    if (depositFocusRequest > 0) {
      focusDilithiumDepositRef.current?.()
    }
  }, [depositFocusRequest])

  return (
    <div className="earth-viewer" tabIndex={0}>
      <div ref={viewerContainerRef} className="earth-viewer__canvas" />
      <button
        className="viewer-reset-button"
        type="button"
        aria-label="Reset Earth view"
        onClick={() => resetViewRef.current?.()}
      >
        RESET VIEW
      </button>
      {(viewerMode === 'relief' ||
        viewerMode === 'biosphere' ||
        viewerMode === 'thermal') &&
        globalTileStatus !== 'READY' &&
        !globalTileError && (
          <div className="viewer-tile-loading" role="status" aria-live="polite">
            <i className="viewer-tile-loading__spinner" aria-hidden="true" />
            <strong>STREAMING GLOBAL TILES</strong>
            <span>{globalTileStatus}</span>
          </div>
        )}
      {(viewerMode === 'imagery' || viewerMode === 'terrain') &&
        (isDetailDiscoveryLoading ||
          activeScenes.some((scene) => !scene.imageryLoaded)) && (
          <div className="viewer-tile-loading" role="status" aria-live="polite">
            <i className="viewer-tile-loading__spinner" aria-hidden="true" />
            <strong>
              {isDetailDiscoveryLoading
                ? 'DISCOVERING DETAIL SCENES'
                : 'STREAMING DETAIL TILES'}
            </strong>
            <span>
              {viewerMode === 'terrain' ? 'COPERNICUS DEM' : 'SENTINEL-2 L2A'}
            </span>
          </div>
        )}
      {!IS_STATIC_DEMO &&
        (viewerMode === 'imagery' || viewerMode === 'terrain') && (
          <button
            className="viewer-scan-button"
            type="button"
            disabled={!scanAvailable}
            onClick={() => requestSentinel2ScenesRef.current?.()}
          >
            SCAN VIEW
          </button>
        )}
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>
          {viewerMode === 'relief'
            ? 'GEBCO_2026 · GLOBAL RELIEF & BATHYMETRY'
            : viewerMode === 'biosphere'
              ? `MODIS TERRA NDVI · 8-DAY · ${GIBS_GLOBAL_LAYER_DATE}`
              : viewerMode === 'thermal'
                ? `MODIS TERRA DAYTIME LST · ${GIBS_GLOBAL_LAYER_DATE}`
                : activeScenes.length
                  ? viewerMode === 'terrain'
                    ? 'COPERNICUS DEM · COLOURIZED ELEVATION'
                    : 'SENTINEL-2 L2A · VISUAL RGB MOSAIC'
                  : viewerMode === 'terrain'
                    ? 'COPERNICUS DEM · SCAN CURRENT VIEW'
                    : 'EOX SENTINEL-2 CLOUDLESS'}
        </span>
        <span>
          {viewerMode === 'relief'
            ? '15 ARC-SECOND GRID · VISUALIZATION ONLY · NOT FOR NAVIGATION'
            : viewerMode === 'biosphere'
              ? '250 M VEGETATION INDEX · GLOBAL TILES'
              : viewerMode === 'thermal'
                ? '1 KM LAND-SURFACE TEMPERATURE · GLOBAL TILES'
                : imageryStatus}
        </span>
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
      <div className="hud hud--left">
        LIVE WGS-84 GLOBE
        <br />
        <span>DRAG TO NAVIGATE · SCROLL TO ZOOM</span>
      </div>
      {viewerMode === 'terrain' && terrainDisplayRange && (
        <aside
          className="terrain-legend"
          aria-label="Copernicus DEM display elevation scale"
        >
          <span>DEM ELEVATION</span>
          <div className="terrain-legend__scale">
            <div className="terrain-legend__gradient" aria-hidden="true" />
            <div className="terrain-legend__labels">
              <span>{formatElevation(terrainDisplayRange.display_max_m)}</span>
              <span>
                {formatElevation(
                  terrainDisplayRange.display_min_m +
                    (terrainDisplayRange.display_max_m -
                      terrainDisplayRange.display_min_m) *
                      0.75,
                )}
              </span>
              <span>
                {formatElevation(
                  (terrainDisplayRange.display_min_m +
                    terrainDisplayRange.display_max_m) /
                    2,
                )}
              </span>
              <span>
                {formatElevation(
                  terrainDisplayRange.display_min_m +
                    (terrainDisplayRange.display_max_m -
                      terrainDisplayRange.display_min_m) *
                      0.25,
                )}
              </span>
              <span>{formatElevation(terrainDisplayRange.display_min_m)}</span>
            </div>
          </div>
          <small>DISPLAY RANGE</small>
        </aside>
      )}
      {viewerMode === 'relief' && (
        <aside
          className="relief-legend"
          aria-label="GEBCO global relief color scale"
        >
          <span>GLOBAL RELIEF</span>
          <div className="relief-legend__scale">
            <div className="relief-legend__gradient" aria-hidden="true" />
            <div className="relief-legend__labels">
              <span>HIGH LAND</span>
              <span>SEA LEVEL</span>
              <span>DEEP OCEAN</span>
            </div>
          </div>
          <small>GEBCO PROVIDER RENDERING</small>
        </aside>
      )}
      {viewerMode === 'biosphere' && (
        <aside className="biosphere-legend" aria-label="MODIS NDVI color scale">
          <span>VEGETATION INDEX</span>
          <div className="biosphere-legend__scale">
            <div className="biosphere-legend__gradient" aria-hidden="true" />
            <div className="biosphere-legend__labels">
              <span>HIGH NDVI</span>
              <span>MODERATE</span>
              <span>LOW NDVI</span>
            </div>
          </div>
          <small>MODIS PROVIDER RENDERING</small>
        </aside>
      )}
      {viewerMode === 'thermal' && (
        <aside
          className="thermal-legend"
          aria-label="MODIS daytime land-surface temperature color scale"
        >
          <span>DAYTIME LST</span>
          <div className="thermal-legend__scale">
            <div className="thermal-legend__gradient" aria-hidden="true" />
            <div className="thermal-legend__labels">
              <span>WARMER</span>
              <span>MODERATE</span>
              <span>COOLER</span>
            </div>
          </div>
          <small>MODIS PROVIDER RENDERING</small>
        </aside>
      )}
      {isDilithiumDepositVisible && (
        <aside
          className="dilithium-legend"
          aria-label="Fictional Dilithium density display scale"
        >
          <span>FICTIONAL DILITHIUM</span>
          <div className="dilithium-legend__scale">
            <div className="dilithium-legend__gradient" aria-hidden="true" />
            <div className="dilithium-legend__labels">
              <span>HIGH</span>
              <span>MODERATE</span>
              <span>LOW</span>
            </div>
          </div>
          <small>RELATIVE DENSITY · SCENARIO</small>
        </aside>
      )}
      <div className="imagery-provenance">
        <span>
          {viewerMode === 'relief'
            ? 'GLOBAL RELIEF · GEBCO_2026 · 15 ARC-SECOND GRID'
            : viewerMode === 'biosphere'
              ? `GLOBAL BIOSPHERE · MODIS TERRA NDVI · ${GIBS_GLOBAL_LAYER_DATE}`
              : viewerMode === 'thermal'
                ? `GLOBAL THERMAL · MODIS TERRA DAYTIME LST · ${GIBS_GLOBAL_LAYER_DATE}`
                : 'GLOBAL BASE · EOX SENTINEL-2 CLOUDLESS 2024'}
        </span>
        {activeScenes.map((scene) => (
          <span className="scene-status" key={scene.item_id}>
            {!scene.imageryLoaded && (
              <i
                className="scene-status__spinner"
                aria-label="Loading scene imagery"
              />
            )}
            {`DETAIL · ${scene.mgrs_tile ?? scene.tile_id ?? scene.item_id} · ${scene.observed_at?.slice(0, 10) ?? 'COPERNICUS DEM'}${scene.cloud_cover === undefined ? '' : ` · CLOUD ${scene.cloud_cover.toFixed(1)}%`} · ${scene.imageryLoaded ? 'READY' : 'LOADING'}`}
          </span>
        ))}
        {(viewerMode === 'relief' ||
          viewerMode === 'biosphere' ||
          viewerMode === 'thermal') && (
          <span className="scene-status">
            {globalTileStatus !== 'READY' && (
              <i
                className="scene-status__spinner"
                aria-label="Loading global imagery tiles"
              />
            )}
            {`GLOBAL TILES · ${globalTileStatus}`}
          </span>
        )}
        {globalTileError && (
          <span className="scene-status">{`TILE ERROR · ${globalTileError}`}</span>
        )}
        {viewerMode === 'relief' ? (
          <>
            <span>GLOBAL LAND ELEVATION + OCEAN BATHYMETRY · GEBCO</span>
            <span>DISPLAY-ONLY RELIEF · NOT FOR NAVIGATION</span>
          </>
        ) : viewerMode === 'biosphere' ? (
          <>
            <span>GLOBAL VEGETATION INDEX · MODIS TERRA · NASA GIBS</span>
            <span>8-DAY PRODUCT · 250 M · PROVIDER-RENDERED INDEX</span>
          </>
        ) : viewerMode === 'thermal' ? (
          <>
            <span>
              GLOBAL DAYTIME LAND-SURFACE TEMPERATURE · MODIS TERRA · NASA GIBS
            </span>
            <span>DAILY PRODUCT · 1 KM · PROVIDER-RENDERED TEMPERATURE</span>
          </>
        ) : activeScenes.length ? (
          <>
            <span>SURFACE DETAIL · MICROSOFT PLANETARY COMPUTER</span>
            <span>
              {viewerMode === 'terrain'
                ? 'RESOLUTION · 30 M · COPERNICUS DEM · ESA'
                : 'RESOLUTION · 10 M · SENTINEL-2 · ESA'}
            </span>
          </>
        ) : (
          <span>
            {IS_STATIC_DEMO
              ? 'GLOBAL MAP LAYERS · STATIC VIEWER DEMO'
              : 'VIEWPORT DETAIL · ZOOM IN AND SELECT SCAN VIEW'}
          </span>
        )}
      </div>
    </div>
  )
}

export default EarthViewer
