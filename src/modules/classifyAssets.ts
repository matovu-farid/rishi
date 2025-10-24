import type { ManifestAttr, Asset } from '@/types'

export const assetTypes: Record<string, Asset> = {
  'text/css': 'css',
  'application/x-font-ttf': 'font',
  'application/x-font-truetype': 'font',
  'application/x-font-opentype': 'font',
  'application/font-woff': 'font',
  'application/font-woff2': 'font',
  'application/vnd.ms-fontobject': 'font',
  'application/font-sfnt': 'font',
  'application/xhtml+xml': 'xml'
}
export function classifyAssets(manifest: ManifestAttr[]) {
  const assets: Record<string, ManifestAttr[]> = {
    css: [],
    font: [],
    xml: [],
    other: []
  }
  manifest.forEach((item) => {
    const type = assetTypes[item['media-type']]
    if (!type) {
      assets.other.push(item)
    } else assets[type].push(item)
  })

  return assets
}
