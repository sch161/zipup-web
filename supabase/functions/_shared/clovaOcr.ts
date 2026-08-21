// CLOVA OCR (General) client. Used to locate PII text/coordinates in an uploaded contract image
// before the image is sent to Gemini — see piiMask.ts for what happens with the result.

const CLOVA_OCR_INVOKE_URL = Deno.env.get('CLOVA_OCR_INVOKE_URL')
const CLOVA_OCR_SECRET_KEY = Deno.env.get('CLOVA_OCR_SECRET_KEY')

export interface ClovaOcrField {
  text: string
  vertices: { x: number; y: number }[]
}

export type ClovaOcrFormat = 'jpg' | 'png'

export function mimeTypeToClovaFormat(mimeType: string): ClovaOcrFormat | null {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  return null
}

/** Calls CLOVA General OCR. Throws on any network/API/shape failure — the caller must treat a
 *  thrown error as "cannot guarantee masking" and block the analysis rather than swallow it. */
export async function runClovaOcr(imageBase64: string, format: ClovaOcrFormat): Promise<ClovaOcrField[]> {
  if (!CLOVA_OCR_INVOKE_URL || !CLOVA_OCR_SECRET_KEY) {
    throw new Error('CLOVA_OCR_INVOKE_URL / CLOVA_OCR_SECRET_KEY is not set')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  let res: Response
  try {
    res = await fetch(CLOVA_OCR_INVOKE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': CLOVA_OCR_SECRET_KEY,
      },
      body: JSON.stringify({
        version: 'V2',
        requestId: crypto.randomUUID(),
        timestamp: Date.now(),
        images: [{ format, name: 'contract', data: imageBase64 }],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`CLOVA OCR request failed with status ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const json = await res.json()
  const fields = json?.images?.[0]?.fields
  if (!Array.isArray(fields)) {
    throw new Error('CLOVA OCR response missing images[0].fields')
  }

  return fields.map((f: Record<string, unknown>) => ({
    text: String((f as { inferText?: unknown }).inferText ?? ''),
    vertices: (((f as { boundingPoly?: { vertices?: unknown[] } }).boundingPoly?.vertices ?? []) as Array<{
      x?: number
      y?: number
    }>).map((v) => ({ x: Number(v.x ?? 0), y: Number(v.y ?? 0) })),
  }))
}
