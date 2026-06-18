// Client-side image downscale before upload. Used by comment result photos
// (Stage 15 item 3) — the roadmap line called for "server-side resize to
// ~1200px"; we do it client-side instead so the bytes that reach Storage are
// already capped. Matches the project's "client-side everything, minimal
// infra" posture (DATABASE_DECISIONS.md → Comment result photos).
//
// Returns a JPEG Blob no larger than `maxEdge` on its longest side, encoded
// at `quality` (0.85 by default — visibly indistinguishable from source at
// thumbnail and lightbox sizes, ~3-5× smaller than q=1.0).
//
// Falls back to the original File if the browser can't decode the image
// (HEIC on non-Safari, corrupt files). The upload still happens; Storage's
// own MIME/size limits remain the last line of defense.

export async function resizeImage(file, { maxEdge = 1200, quality = 0.85 } = {}) {
    if (!file || !(file instanceof Blob)) return file

    let bitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        return file
    }

    const { width, height } = bitmap
    const longest = Math.max(width, height)

    // Already small enough — skip re-encoding (preserves original quality
    // for users who already exported a thumbnail).
    if (longest <= maxEdge) {
        bitmap.close?.()
        return file
    }

    const scale = maxEdge / longest
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()

    const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
    })

    return blob || file
}
