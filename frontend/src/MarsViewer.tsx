import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  GeographicTilingScheme,
  Globe,
  Rectangle,
  SingleTileImageryProvider,
  Viewer,
  WebMapServiceImageryProvider,
} from 'cesium'
import { useEffect, useRef } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MARS_ELLIPSOID = new Ellipsoid(3_396_190, 3_396_190, 3_376_200)
const MARS_GLOBAL_VIEW_HEIGHT_METERS = 11_000_000
const USGS_MARS_WMS_URL = 'https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/mars_simp_cyl.map'

export type MarsImageryMode = 'baseline' | 'themis'

type MarsViewerProps = {
  imageryMode: MarsImageryMode
}

function createMarsImageryProvider(imageryMode: MarsImageryMode) {
  if (imageryMode === 'themis') {
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
  return new SingleTileImageryProvider({
    url: '/mars/viking-global-color-mosaic-1024.jpg',
    rectangle: Rectangle.MAX_VALUE,
    tileWidth: 1024,
    tileHeight: 512,
    credit: 'USGS Astrogeology: Mars Viking Global Color Mosaic 925 m',
  })
}

function MarsViewer({ imageryMode }: MarsViewerProps) {
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)

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
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 10, MARS_GLOBAL_VIEW_HEIGHT_METERS, MARS_ELLIPSOID),
    })
    viewerRef.current = viewer

    return () => {
      viewerRef.current = null
      viewer.destroy()
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) {
      return
    }
    viewer.imageryLayers.removeAll(true)
    viewer.imageryLayers.addImageryProvider(createMarsImageryProvider(imageryMode))
  }, [imageryMode])

  const isThemisMode = imageryMode === 'themis'

  return (
    <div className="mars-viewer">
      <div ref={viewerContainerRef} className="mars-viewer__canvas" />
      <div className="mars-viewer__directive">
        <strong>{isThemisMode ? 'MARS · ZOOMABLE THEMIS' : 'MARS · GLOBAL BASELINE'}</strong>
        <span>{isThemisMode ? 'THEMIS GLOBAL MOSAIC · WMS TILES TO ~100 M/PIXEL' : 'VIKING GLOBAL COLOR MOSAIC · 925 M SOURCE PRODUCT'}</span>
        <span>{isThemisMode ? 'USGS ASTROGEOLOGY · LIVE WMS' : 'USGS ASTROGEOLOGY · LOCAL DISPLAY ASSET'}</span>
      </div>
    </div>
  )
}

export default MarsViewer
