// Draws opaque black rectangles over PII regions before an image is sent to Gemini.
// magick-wasm is the WASM (no native-binary) port of ImageMagick officially recommended by
// Supabase for Edge Functions — see https://supabase.com/docs/guides/functions/examples/image-manipulation.
// It does NOT support PDF (maintainer: PDF would require linking glib, blocked by licensing),
// so this module only ever receives jpg/png bytes — see mimeTypeToClovaFormat in clovaOcr.ts.
import {
  DrawableFillColor,
  DrawableRectangle,
  ImageMagick,
  initializeImageMagick,
  MagickColor,
  MagickFormat,
} from 'npm:@imagemagick/magick-wasm@0.0.43'
import type { MaskBox } from './piiMask.ts'

let initPromise: Promise<void> | null = null

// index.ts에서 이미지 처리(리사이즈) 직전에 명시적으로 호출해, WASM 컴파일 시간을 stageTimingsMs에
// resize/imageEdit과 분리된 별도 항목(wasmInit)으로 기록할 수 있게 export한다. prepareImageForOcr/
// applyBlackBoxes 내부에서도 그대로 호출하므로(멱등, initPromise로 캐시됨) 여기서 먼저 안 불러도
// 동작은 같지만, 시간 측정을 위해서는 index.ts가 먼저 호출해야 한다.
export function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // 0.0.43(2026-08-25 배포)부터 magick.wasm이 dist/ 바로 밑이 아니라
      // dist/x86(기본, wasm32)/dist/x64(memory64) 하위로 옮겨졌고 서브패스 export로만
      // 공개된다 — package.json의 "./magick.wasm" export(→ dist/x86/magick.wasm)를
      // import.meta.resolve로 그대로 따라가야, 이 패키지가 내부 파일 배치를 또 바꿔도
      // 깨지지 않는다. 예전처럼 메인 엔트리 URL에 상대경로 'magick.wasm'을 직접 이어붙이던
      // 방식은 이번 버전에서 dist/magick.wasm이 사라지며 404가 났다. 버전도 `^0`(모든 0.x
      // 허용) 대신 정확히 고정해, 다음 재배포에서 또 다른 패치가 조용히 레이아웃을 바꿔도
      // 이 함수가 예고 없이 깨지지 않게 한다.
      // 주의: import.meta.resolve()는 "file:///..." 문자열을 반환하는데, Deno.readFile은
      // 문자열 인자를 URL이 아니라 리터럴 OS 경로로 취급한다 — new URL(...)로 감싸지 않으면
      // "file:"로 시작하는 이름의 상대 경로를 찾다가 NotFound로 실패한다(로컬 Deno로 재현 확인).
      const wasmBytes = await Deno.readFile(
        new URL(import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.43/magick.wasm')),
      )
      await initializeImageMagick(wasmBytes)
    })()
  }
  return initPromise
}

/** boxes 목록을 검은 사각형으로 덮은 새 이미지를 PNG로 반환한다. boxes가 비어 있어도(마스킹할
 *  PII가 없어도) 원본을 그대로 통과시키지 않고 반드시 이 함수를 거치게 해, "마스킹 단계 자체가
 *  스킵된 상태"가 생기지 않도록 한다. 실패하면 예외를 던진다 — 호출부는 이를 삼키지 말고
 *  분석 자체를 중단해야 한다. */
export async function applyBlackBoxes(imageBytes: Uint8Array, boxes: MaskBox[]): Promise<Uint8Array> {
  await ensureInitialized()

  return ImageMagick.read(imageBytes, (img): Uint8Array => {
    for (const box of boxes) {
      img.draw(new DrawableFillColor(new MagickColor('black')), new DrawableRectangle(box.x1, box.y1, box.x2, box.y2))
    }
    // magick-wasm hands the write callback a Uint8Array view into WASM linear memory, valid only
    // during this callback — the native buffer gets freed/reused right after (e.g. by the next
    // ImageMagick.read call). Uint8Array.from() copies it into a real JS-owned array so the bytes
    // survive being returned and used later. Skipping this produced silently corrupted output
    // (confirmed live: CLOVA OCR rejected it with "Request invalid" once a second magick-wasm
    // call — the resize/normalize step — ran before this one in the same request).
    return img.write(MagickFormat.Png, (data) => Uint8Array.from(data))
  })
}

// Supabase Edge Functions cap out at 256MB memory, and CPU time is capped separately. 2026-09
// 실측 히스토리: 클라이언트 리사이즈 없이 원본 사진 그대로 왔을 때 cpu_time_used 3872ms(546),
// 클라이언트에서 1500px로 미리 줄인 뒤에도 2183ms(여전히 546, 2초 한도를 8% 초과) — magick-wasm은
// 리사이즈 "전에" 원본 해상도로 먼저 디코드하므로 서버 상수만으로는 한계가 있고, 클라이언트
// 다운스케일(src/lib/analyzeContract.ts, src/lib/pdfToImage.ts)과 이 상수를 항상 같은 값으로
// 맞춰야 한다. magick-wasm's cost is driven by decoded pixel count (width * height), not
// compressed upload size — a small-looking JPEG can still decode to a huge raw buffer at high
// resolution. So instead of gating on upload byte size, this caps the longest side. 1200px is
// comfortably more detail than CLOVA OCR or Gemini need to read contract text, while keeping the
// decoded buffer (and resize/encode CPU cost, which scales with pixel count) smaller regardless
// of how large the original photo was.
const MAX_DIMENSION_PX = 1200

/** OCR로 보내기 전 이미지를 정규화한다: 해상도가 크면 축소하고, 이후 단계(OCR 좌표 계산과
 *  마스킹)가 항상 같은 바이트를 기준으로 동작하도록 PNG로 통일해 반환한다. 실패하면 예외를
 *  던진다 — 호출부는 이를 원본을 그대로 흘려보내는 대신 분석 중단으로 처리해야 한다. */
export async function prepareImageForOcr(imageBytes: Uint8Array): Promise<Uint8Array> {
  await ensureInitialized()

  return ImageMagick.read(imageBytes, (img): Uint8Array => {
    const longestSide = Math.max(img.width, img.height)
    if (longestSide > MAX_DIMENSION_PX) {
      const scale = MAX_DIMENSION_PX / longestSide
      img.resize(Math.round(img.width * scale), Math.round(img.height * scale))
    }
    // magick-wasm hands the write callback a Uint8Array view into WASM linear memory, valid only
    // during this callback — the native buffer gets freed/reused right after (e.g. by the next
    // ImageMagick.read call). Uint8Array.from() copies it into a real JS-owned array so the bytes
    // survive being returned and used later. Skipping this produced silently corrupted output
    // (confirmed live: CLOVA OCR rejected it with "Request invalid" once a second magick-wasm
    // call — the resize/normalize step — ran before this one in the same request).
    return img.write(MagickFormat.Png, (data) => Uint8Array.from(data))
  })
}
