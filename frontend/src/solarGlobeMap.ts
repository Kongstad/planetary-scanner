import { publicAssetUrl } from './runtime.ts'

export const solarGlobeMap = {
  imageUrl: publicAssetUrl('sol/aia-171-cr2311-globe.png'),
  carringtonRotation: 2311,
  wavelength: 'AIA 171 Å',
  period: '2026-05-12 – 2026-06-09',
  width: 3600,
  height: 1080,
  credit: 'Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams.',
} as const
