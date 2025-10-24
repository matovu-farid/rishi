import { OPFFileObj } from '@/types'

export async function getEpubCover(opfFileObj: OPFFileObj) {
  try {
    // Try to find the cover by checking the 'properties' attribute or the id
    const coverItem = opfFileObj.manifest.item.find(
      (item) =>
        (item._attributes['media-type'] === 'image/jpeg' ||
          item._attributes['media-type'] === 'image/png') &&
        (item._attributes.properties?.['cover-image'] ||
          item._attributes.id.toLowerCase().includes('cover'))
    )

    if (coverItem) {
      return coverItem._attributes.href
    }

    // No cover found with specific properties or id hints, checking by file name
    const likelyCover = opfFileObj.manifest.item.find(
      (item) =>
        item._attributes.href.toLowerCase().includes('cover') &&
        (item._attributes['media-type'] === 'image/jpeg' ||
          item._attributes['media-type'] === 'image/png')
    )

    return likelyCover ? likelyCover._attributes.href : ''
  } catch (e) {
    return 'error'
  }
}
