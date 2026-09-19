import {
  Cartesian3,
  Color,
  Ellipsoid,
  EllipsoidTerrainProvider,
  Globe,
  Rectangle,
  SingleTileImageryProvider,
  Viewer,
} from 'cesium'
import { useEffect, useRef } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const MARS_ELLIPSOID = new Ellipsoid(3_396_190, 3_396_190, 3_376_200)
const MARS_GLOBAL_VIEW_HEIGHT_METERS = 11_000_000

function MarsViewer() {
  const viewerContainerRef = useRef<HTMLDivElement>(null)

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
    viewer.imageryLayers.addImageryProvider(
      new SingleTileImageryProvider({
        url: '/mars/viking-global-color-mosaic-1024.jpg',
        rectangle: Rectangle.MAX_VALUE,
        tileWidth: 1024,
        tileHeight: 512,
        credit: 'USGS Astrogeology: Mars Viking Global Color Mosaic 925 m',
      }),
    )
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 10, MARS_GLOBAL_VIEW_HEIGHT_METERS, MARS_ELLIPSOID),
    })

    return () => viewer.destroy()
  }, [])

  return (
    <div className="mars-viewer">
      <div ref={viewerContainerRef} className="mars-viewer__canvas" />
      <div className="mars-viewer__directive">
        <strong>MARS · GLOBAL BASELINE</strong>
        <span>VIKING GLOBAL COLOR MOSAIC · 925 M SOURCE PRODUCT</span>
        <span>USGS ASTROGEOLOGY · LOCAL DISPLAY ASSET</span>
      </div>
    </div>
  )
}

export default MarsViewer
