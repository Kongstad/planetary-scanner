import { Cartesian3, type Viewer } from 'cesium'

export function formatCameraAltitude(heightMeters: number): string {
  if (heightMeters < 1_000) {
    return `${Math.round(heightMeters)} M`
  }
  return `${(heightMeters / 1_000).toFixed(heightMeters < 10_000 ? 1 : 0)} KM`
}

export function stabilizeGlobeZoom(viewer: Viewer): void {
  const rotate = viewer.camera.rotate.bind(viewer.camera)
  viewer.camera.rotate = (axis, angle) => {
    // Cesium's centered wheel zoom can produce a zero rotation axis.
    if (Cartesian3.magnitudeSquared(axis) === 0) return
    rotate(axis, angle)
  }
}
