export const IS_STATIC_DEMO = import.meta.env.MODE === 'demo'

export function publicAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
