import {
  Cartesian3,
  Math as CesiumMath,
  Color,
  EllipsoidTerrainProvider,
  SkyBox,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium'
import type { ImageryLayer } from 'cesium'
import { useEffect, useRef, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { DILITHIUM_DEPOSIT } from './dilithiumDeposit.ts'

const COPENHAGEN_LONGITUDE = 12.5683
const COPENHAGEN_LATITUDE = 55.6761
const GLOBAL_VIEW_HEIGHT_METERS = 20_000_000
const SENTINEL_2_DISPLAY_HEIGHT_METERS = 200_000
const SCENE_SEARCH_DEBOUNCE_MILLISECONDS = 600
const EOX_SENTINEL_2_CLOUDLESS_TILES_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'

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

export type ViewerMode = 'imagery' | 'terrain' | 'biosphere' | 'thermal'

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

function formatTemperature(temperatureCelsius: number): string {
  return `${temperatureCelsius.toFixed(1)} °C`
}

function isInsideDilithiumDeposit(longitude: number, latitude: number): boolean {
  let isInside = false
  const points = DILITHIUM_DEPOSIT.polygon
  for (let index = 0, previousIndex = points.length - 1; index < points.length; previousIndex = index++) {
    const [longitudeA, latitudeA] = points[index]
    const [longitudeB, latitudeB] = points[previousIndex]
    const intersects = (latitudeA > latitude) !== (latitudeB > latitude)
      && longitude < (longitudeB - longitudeA) * (latitude - latitudeA) / (latitudeB - latitudeA) + longitudeA
    if (intersects) {
      isInside = !isInside
    }
  }
  return isInside
}

function getDilithiumDensity(longitude: number, latitude: number): number {
  const { bounds, densitySamples } = DILITHIUM_DEPOSIT
  const normalizedLongitude = (longitude - bounds.west) / (bounds.east - bounds.west)
  const normalizedLatitude = (latitude - bounds.south) / (bounds.north - bounds.south)
  const sampleDensity = densitySamples.reduce((total, [x, y, density]) => {
    const distanceSquared = (normalizedLongitude - x) ** 2 + (normalizedLatitude - y) ** 2
    return total + density * Math.exp(-distanceSquared / 0.008)
  }, 0)
  const distanceFromCenterSquared = (normalizedLongitude - 0.5) ** 2 + (normalizedLatitude - 0.5) ** 2
  return Math.min(1, sampleDensity * Math.exp(-distanceFromCenterSquared / 0.22))
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
  return Color.fromBytes(color[0], color[1], color[2], Math.round(35 + density * 180))
}

function EarthViewer({ mode, depositFocusRequest, onCoverageChange }: EarthViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const requestSentinel2ScenesRef = useRef<(() => void) | null>(null)
  const setViewerModeRef = useRef<((nextMode: ViewerMode) => void) | null>(null)
  const focusDilithiumDepositRef = useRef<(() => void) | null>(null)
  const modeRef = useRef<ViewerMode>(mode)
  const [activeScenes, setActiveScenes] = useState<ActiveScene[]>([])
  const [scanAvailable, setScanAvailable] = useState(false)
  const [viewerMode, setViewerMode] = useState<ViewerMode>(mode)
  const [cameraAltitude, setCameraAltitude] = useState(GLOBAL_VIEW_HEIGHT_METERS)
  const [isDilithiumDepositVisible, setIsDilithiumDepositVisible] = useState(false)
  const terrainDisplayRange = activeScenes.find(
    (
      scene,
    ): scene is ActiveScene & { display_min_m: number; display_max_m: number } =>
      scene.display_min_m !== undefined && scene.display_max_m !== undefined,
  )
  const thermalDisplayRange = activeScenes.find(
    (
      scene,
    ): scene is ActiveScene & { display_min_c: number; display_max_c: number } =>
      scene.display_min_c !== undefined && scene.display_max_c !== undefined,
  )
  const [imageryStatus, setImageryStatus] = useState(
    'DETAIL · ZOOM BELOW 200 KM TO SCAN',
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
    let isDilithiumDepositRequested = false
    let depositRevealTimer: number | undefined
    const sentinel2Layers = new Map<string, ImageryLayer>()
    let refreshTimer: number | undefined
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
          : activeMode === 'thermal'
            ? 'DETAIL · SELECTING MODIS TEMPERATURE TILES'
          : 'DETAIL · SELECTING LATEST LOW-CLOUD SCENES',
      )
      onCoverageChange('ANALYSING VIEWPORT')
      const endpoint = activeMode === 'terrain'
        ? '/imagery/copernicus-dem/scenes'
        : activeMode === 'thermal'
          ? '/imagery/modis-lst/scenes'
        : `/imagery/sentinel-2/scenes?mode=${activeMode}`
      const response = await fetch(
        `${endpoint}${activeMode === 'imagery' || activeMode === 'biosphere' ? '&' : '?'}${query}`,
      )
      if (!response.ok) {
        throw new Error(`Sentinel-2 scene API returned ${response.status}`)
      }
      const scenes = await response.json() as Sentinel2Scene[]
      if (disposed || currentRequestSequence !== requestSequence) {
        return
      }
      removeSentinel2Layers()
      setActiveScenes(scenes.map((scene) => ({ ...scene, imageryLoaded: false })))
      for (const scene of scenes) {
        const imageryProvider = new UrlTemplateImageryProvider({ url: scene.tile_url })
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
        sentinel2Layers.set(
          scene.item_id,
          viewer.imageryLayers.addImageryProvider(imageryProvider),
        )
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
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer)
      }
      const isCloseEnoughToScan =
        viewer.camera.positionCartographic.height <= SENTINEL_2_DISPLAY_HEIGHT_METERS
      setScanAvailable(isCloseEnoughToScan)
      if (!isCloseEnoughToScan) {
        requestSequence += 1
        removeSentinel2Layers()
        setImageryStatus('DETAIL · ZOOM BELOW 200 KM TO SCAN')
        onCoverageChange('GLOBAL BASELINE')
        return
      }
      refreshTimer = window.setTimeout(() => {
        void refreshDetailLayers().catch(() => {
          if (!disposed) {
            removeSentinel2Layers()
            setImageryStatus('DETAIL · SENTINEL-2 DISCOVERY UNAVAILABLE')
            onCoverageChange('DISCOVERY UNAVAILABLE')
          }
        })
      }, SCENE_SEARCH_DEBOUNCE_MILLISECONDS)
    }
    const clearDetailScenesForNavigation = () => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer)
      }
      requestSequence += 1
      removeSentinel2Layers()
      const isCloseEnoughToScan =
        viewer.camera.positionCartographic.height <= SENTINEL_2_DISPLAY_HEIGHT_METERS
      setCameraAltitude(viewer.camera.positionCartographic.height)
      setScanAvailable(isCloseEnoughToScan)
      setImageryStatus(
        !isCloseEnoughToScan
          ? 'DETAIL · ZOOM BELOW 200 KM TO SCAN'
          : 'DETAIL · PRESS SCAN FOR CURRENT VIEW',
      )
      onCoverageChange(isCloseEnoughToScan ? 'AWAITING SCAN' : 'GLOBAL BASELINE')
    }
    const removeCameraChangedListener = viewer.camera.changed.addEventListener(
      clearDetailScenesForNavigation,
    )
    const removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(
      clearDetailScenesForNavigation,
    )
    const updateViewerMode = (nextMode: ViewerMode) => {
      modeRef.current = nextMode
      setViewerMode(nextMode)
      clearDetailScenesForNavigation()
    }
    requestSentinel2ScenesRef.current = requestDetailScenes
    setViewerModeRef.current = updateViewerMode
    focusDilithiumDepositRef.current = () => {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          DILITHIUM_DEPOSIT.center.longitude,
          DILITHIUM_DEPOSIT.center.latitude,
          1_000_000,
        ),
        duration: 2,
        complete: () => {
          if (disposed || isDilithiumDepositRequested) {
            return
          }
          isDilithiumDepositRequested = true
          setIsDilithiumDepositVisible(true)
          depositRevealTimer = window.setTimeout(() => {
            const latitudeStep = 0.025
            const longitudeStep = 0.08
            for (let latitude = DILITHIUM_DEPOSIT.bounds.south; latitude < DILITHIUM_DEPOSIT.bounds.north; latitude += latitudeStep) {
              for (let longitude = DILITHIUM_DEPOSIT.bounds.west; longitude < DILITHIUM_DEPOSIT.bounds.east; longitude += longitudeStep) {
                const nextLatitude = Math.min(latitude + latitudeStep, DILITHIUM_DEPOSIT.bounds.north)
                const nextLongitude = Math.min(longitude + longitudeStep, DILITHIUM_DEPOSIT.bounds.east)
                const corners = [
                  [longitude, latitude],
                  [nextLongitude, latitude],
                  [nextLongitude, nextLatitude],
                  [longitude, nextLatitude],
                ]
                if (!corners.every(([cellLongitude, cellLatitude]) => isInsideDilithiumDeposit(cellLongitude, cellLatitude))) {
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
          }, 350)
        },
      })
      setImageryStatus('FICTIONAL · DILITHIUM DEPOSIT DENSITY MODEL')
      onCoverageChange('FICTIONAL SCENARIO')
    }
    viewer.camera.percentageChanged = 0.01
    clearDetailScenesForNavigation()

    return () => {
      disposed = true
      requestSequence += 1
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer)
      }
      if (depositRevealTimer !== undefined) {
        window.clearTimeout(depositRevealTimer)
      }
      requestSentinel2ScenesRef.current = null
      setViewerModeRef.current = null
      focusDilithiumDepositRef.current = null
      removeCameraChangedListener()
      removeCameraMoveEndListener()
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
    <div className="earth-viewer">
      <div ref={viewerContainerRef} className="earth-viewer__canvas" />
      <button
        className="viewer-scan-button"
        type="button"
        disabled={!scanAvailable}
        onClick={() => requestSentinel2ScenesRef.current?.()}
      >
        SCAN VIEW
      </button>
      <div className="viewer-directive">
        <strong>PRIMARY OBSERVATION</strong>
        <span>
          {activeScenes.length
            ? viewerMode === 'terrain'
              ? 'COPERNICUS DEM · COLOURIZED ELEVATION'
              : viewerMode === 'thermal'
                ? 'MODIS · 8-DAY DAYTIME LAND-SURFACE TEMPERATURE'
              : viewerMode === 'biosphere'
                ? 'SENTINEL-2 L2A · NDVI MOSAIC'
                : 'SENTINEL-2 L2A · VISUAL RGB MOSAIC'
            : 'EOX SENTINEL-2 CLOUDLESS'}
        </span>
        <span>{imageryStatus}</span>
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
      <div className="hud hud--left">
        LIVE WGS-84 GLOBE
        <br />
        <span>DRAG TO NAVIGATE · SCROLL TO ZOOM</span>
      </div>
      {viewerMode === 'terrain' && terrainDisplayRange && (
        <aside className="terrain-legend" aria-label="Copernicus DEM display elevation scale">
          <span>DEM ELEVATION</span>
          <div className="terrain-legend__scale">
            <div className="terrain-legend__gradient" aria-hidden="true" />
            <div className="terrain-legend__labels">
              <span>{formatElevation(terrainDisplayRange.display_max_m)}</span>
              <span>{formatElevation(terrainDisplayRange.display_min_m + (terrainDisplayRange.display_max_m - terrainDisplayRange.display_min_m) * 0.75)}</span>
              <span>{formatElevation((terrainDisplayRange.display_min_m + terrainDisplayRange.display_max_m) / 2)}</span>
              <span>{formatElevation(terrainDisplayRange.display_min_m + (terrainDisplayRange.display_max_m - terrainDisplayRange.display_min_m) * 0.25)}</span>
              <span>{formatElevation(terrainDisplayRange.display_min_m)}</span>
            </div>
          </div>
          <small>DISPLAY RANGE</small>
        </aside>
      )}
      {viewerMode === 'biosphere' && activeScenes.length > 0 && (
        <aside className="biosphere-legend" aria-label="Sentinel-2 NDVI display scale">
          <span>NDVI</span>
          <div className="biosphere-legend__scale">
            <div className="biosphere-legend__gradient" aria-hidden="true" />
            <div className="biosphere-legend__labels">
              <span>+1.0</span>
              <span>+0.5</span>
              <span>0.0</span>
              <span>−0.5</span>
              <span>−1.0</span>
            </div>
          </div>
          <small>VEGETATION INDEX</small>
        </aside>
      )}
      {viewerMode === 'thermal' && thermalDisplayRange && (
        <aside className="thermal-legend" aria-label="MODIS land-surface temperature display scale">
          <span>LAND-SURFACE TEMP.</span>
          <div className="thermal-legend__scale">
            <div className="thermal-legend__gradient" aria-hidden="true" />
            <div className="thermal-legend__labels">
              <span>{formatTemperature(thermalDisplayRange.display_max_c)}</span>
              <span>{formatTemperature(thermalDisplayRange.display_min_c + (thermalDisplayRange.display_max_c - thermalDisplayRange.display_min_c) * 0.75)}</span>
              <span>{formatTemperature((thermalDisplayRange.display_min_c + thermalDisplayRange.display_max_c) / 2)}</span>
              <span>{formatTemperature(thermalDisplayRange.display_min_c + (thermalDisplayRange.display_max_c - thermalDisplayRange.display_min_c) * 0.25)}</span>
              <span>{formatTemperature(thermalDisplayRange.display_min_c)}</span>
            </div>
          </div>
          <small>8-DAY DAYTIME · 1 KM</small>
        </aside>
      )}
      {isDilithiumDepositVisible && (
        <aside className="dilithium-legend" aria-label="Fictional Dilithium density display scale">
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
        <span>GLOBAL BASE · EOX SENTINEL-2 CLOUDLESS 2024</span>
        {activeScenes.map((scene) => (
          <span className="scene-status" key={scene.item_id}>
            {!scene.imageryLoaded && <i className="scene-status__spinner" aria-label="Loading scene imagery" />}
            {`DETAIL · ${scene.mgrs_tile ?? scene.tile_id ?? scene.item_id} · ${scene.observed_at?.slice(0, 10) ?? 'COPERNICUS DEM'}${scene.cloud_cover === undefined ? '' : ` · CLOUD ${scene.cloud_cover.toFixed(1)}%`} · ${scene.imageryLoaded ? 'READY' : 'LOADING'}`}
          </span>
        ))}
        {activeScenes.length ? (
          <>
            <span>SURFACE DETAIL · MICROSOFT PLANETARY COMPUTER</span>
            <span>
              {viewerMode === 'terrain'
                ? 'RESOLUTION · 30 M · COPERNICUS DEM · ESA'
                : viewerMode === 'thermal'
                  ? 'PRODUCT · MODIS LST · AQUA · 1 KM · 8-DAY DAYTIME'
                : viewerMode === 'biosphere'
                  ? 'INDEX · NDVI = (B08 - B04) / (B08 + B04) · SENTINEL-2 · ESA'
                  : 'RESOLUTION · 10 M · SENTINEL-2 · ESA'}
            </span>
          </>
        ) : (
          <span>VIEWPORT DETAIL · ZOOM IN AND SELECT SCAN VIEW</span>
        )}
      </div>
    </div>
  )
}

export default EarthViewer
