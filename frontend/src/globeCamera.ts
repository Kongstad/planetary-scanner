import { Cartesian3, type Viewer } from 'cesium'

export function stabilizeGlobeZoom(viewer: Viewer): void {
  const rotate = viewer.camera.rotate.bind(viewer.camera)
  viewer.camera.rotate = (axis, angle) => {
    // Cesium's centered wheel zoom can produce a zero rotation axis.
    if (Cartesian3.magnitudeSquared(axis) === 0) return
    rotate(axis, angle)
  }
}
