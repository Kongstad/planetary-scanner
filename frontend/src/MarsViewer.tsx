import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  Rectangle,
  SingleTileImageryProvider,
  Viewer,
  WebMapServiceImageryProvider,
} from 'cesium'
import type { ImageryLayer } from 'cesium'
import { useEffect, useRef, useState } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MARS_ELLIPSOID = new Ellipsoid(3_396_190, 3_396_190, 3_376_200)
const MARS_GLOBAL_VIEW_HEIGHT_METERS = 11_000_000
const THEMIS_DISPLAY_HEIGHT_METERS = 200_000
const USGS_MARS_WMS_URL = 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map'

type MarsViewerProps = {
  onCameraAltitudeChange: (altitude: string) => void
  onCoverageChange: (coverage: string) => void
}

function formatCameraAltitude(heightMeters: number): string {
  if (heightMeters < 1_000) {
    return `${Math.round(heightMeters)} M`
  }
  return `${(heightMeters / 1_000).toFixed(heightMeters < 10_000 ? 1 : 0)} KM`
}

function createThemisImageryProvider() {
  return new WebMapServiceImageryProvider({
    url: USGS_MARS_WMS_URL,
    layers: 'THEMIS',
    parameters: {
      format: 'image/jpeg',
      styles: '',
      transparent: false,
      version: '1.1.1',
    },
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MARS_ELLIPSOID }),
    tileWidth: 512,
    tileHeight: 512,
    maximumLevel: 10,
    enablePickFeatures: false,
    credit: 'USGS Astrogeology: THEMIS global mosaic WMS',
  })
}

function createGlobalMosaicProvider() {
  return new SingleTileImageryProvider({
    url: '/mars/viking-global-color-mosaic-1024.jpg',
    rectangle: Rectangle.MAX_VALUE,
    tileWidth: 1024,
    tileHeight: 512,
    credit: 'USGS Astrogeology: Mars Viking Global Color Mosaic 925 m',
  })
}

function MarsViewer({ onCameraAltitudeChange, onCoverageChange }: MarsViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const [cameraAltitude, setCameraAltitude] = useState(MARS_GLOBAL_VIEW_HEIGHT_METERS)
  const [isThemisStreaming, setIsThemisStreaming] = useState(false)

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
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false
    }
    viewer.imageryLayers.addImageryProvider(createGlobalMosaicProvider())
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 10, MARS_GLOBAL_VIEW_HEIGHT_METERS, MARS_ELLIPSOID),
    })
    let themisLayer: ImageryLayer | undefined

    const updateImageryForAltitude = () => {
      const altitude = viewer.camera.positionCartographic.height
      const shouldStreamThemis = altitude <= THEMIS_DISPLAY_HEIGHT_METERS
      setCameraAltitude(altitude)
      setIsThemisStreaming(shouldStreamThemis)
      onCameraAltitudeChange(formatCameraAltitude(altitude))
      onCoverageChange(
        shouldStreamThemis
          ? 'THEMIS WMS · VISIBLE TILES'
          : 'GLOBAL BASELINE · ZOOM BELOW 200 KM',
      )
      if (shouldStreamThemis && !themisLayer) {
        themisLayer = viewer.imageryLayers.addImageryProvider(createThemisImageryProvider())
        themisLayer.alpha = 0.55
      } else if (!shouldStreamThemis && themisLayer) {
        viewer.imageryLayers.remove(themisLayer, true)
        themisLayer = undefined
      }
    }

    viewer.camera.percentageChanged = 0.01
    const removeCameraChangedListener = viewer.camera.changed.addEventListener(
      updateImageryForAltitude,
    )
    const removeCameraMoveEndListener = viewer.camera.moveEnd.addEventListener(
      updateImageryForAltitude,
    )
    updateImageryForAltitude()

    return () => {
      removeCameraChangedListener()
      removeCameraMoveEndListener()
      viewer.destroy()
    }
  }, [onCameraAltitudeChange, onCoverageChange])

  return (
    <div className="mars-viewer">
      <div ref={viewerContainerRef} className="mars-viewer__canvas" />
      <div className="mars-viewer__directive">
        <strong>{isThemisStreaming ? 'MARS · STREAMING THEMIS' : 'MARS · GLOBAL BASELINE'}</strong>
        <span>{isThemisStreaming ? 'VIKING COLOUR BASE + THEMIS IR DETAIL · ~100 M/PIXEL' : 'VIKING GLOBAL COLOR MOSAIC · 925 M SOURCE PRODUCT'}</span>
        <span>{isThemisStreaming ? 'USGS ASTROGEOLOGY · LIVE WMS · 55% DETAIL OVERLAY' : 'DETAIL · ZOOM BELOW 200 KM TO STREAM'}</span>
        <span>{`ALTITUDE · ${formatCameraAltitude(cameraAltitude)}`}</span>
      </div>
    </div>
  )
}

export default MarsViewer
