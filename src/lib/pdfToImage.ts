import * as pdfjsLib from "pdfjs-dist";

// Vite detects this `new URL(..., import.meta.url)` pattern statically and bundles the worker
// as its own asset with a correct URL — the documented way to wire up pdfjs-dist's worker in Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// 서버(supabase/functions/_shared/imageMask.ts)의 MAX_DIMENSION_PX와 반드시 같은 값으로
// 맞춰둔다. 여기서 이 한도에 맞춰 렌더링 배율을 미리 정하지 않으면, 서버가 다시 축소하면서
// 클라이언트가 공들여 렌더링한 해상도를 그냥 버리게 된다.
const SERVER_MAX_DIMENSION = 2000;
// 페이지가 1장일 때도 무한정 키우지 않도록 두는 상한(대략 2000px / A4 세로 842pt ≈ 2.37배).
const MAX_RENDER_SCALE = 2.5;
// 이 배율보다 낮아지면(표준 A4 기준 페이지당 세로 약 715px, ~150dpi의 절반 이하) 본문 작은
// 글씨의 OCR 인식률이 눈에 띄게 떨어지기 시작한다고 보고 "인식률 저하 가능" 경고를 띄운다.
// 표준 A4(842pt) 기준 3페이지부터 이 임계값 아래로 떨어진다.
const LOW_RES_SCALE_THRESHOLD = 0.85;

export interface PdfConversionResult {
  file: File;
  pageCount: number;
  /** true면 페이지 수 대비 해상도가 낮아 OCR 인식률이 떨어질 수 있다는 뜻(업로드는 계속 진행 가능). */
  isLowRes: boolean;
}

/** PDF의 각 페이지를 캔버스에 렌더링해 세로로 이어붙인 뒤 PNG 한 장으로 변환한다. 서버는 이미지
 *  업로드만 알면 되므로(마스킹 파이프라인은 이미지 전용), 변환 결과는 기존 이미지 업로드와 동일한
 *  File 객체로 반환한다. 비밀번호로 잠겼거나 손상된 PDF 등 렌더링에 실패하면 예외를 던진다 —
 *  호출부는 이를 잡아 업로드를 진행하지 말고 사용자에게 안내해야 한다. */
export async function convertPdfToImage(pdfFile: File): Promise<PdfConversionResult> {
  const buffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;

  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = await Promise.all(pageNumbers.map((n) => pdf.getPage(n)));

  // 1배율 기준 실제 페이지 크기를 먼저 파악해, 페이지 수(=이어붙였을 때 총 높이)에 맞는
  // 렌더링 배율을 정한다 — 페이지가 많을수록 배율을 낮춰 최종 이미지가 2000px 한도 안에 들어오게.
  const baseViewports = pages.map((page) => page.getViewport({ scale: 1 }));
  const maxPageWidth = Math.max(...baseViewports.map((v) => v.width));
  const totalPageHeight = baseViewports.reduce((sum, v) => sum + v.height, 0);
  const scale = Math.min(
    MAX_RENDER_SCALE,
    SERVER_MAX_DIMENSION / Math.max(maxPageWidth, totalPageHeight),
  );

  const pageCanvases: HTMLCanvasElement[] = [];
  for (const page of pages) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    if (!canvas.getContext("2d")) throw new Error("canvas 2d context를 생성할 수 없습니다.");
    await page.render({ canvas, viewport }).promise;
    pageCanvases.push(canvas);
  }

  const stitchedWidth = Math.max(...pageCanvases.map((c) => c.width));
  const stitchedHeight = pageCanvases.reduce((sum, c) => sum + c.height, 0);
  const stitched = document.createElement("canvas");
  stitched.width = stitchedWidth;
  stitched.height = stitchedHeight;
  const stitchedContext = stitched.getContext("2d");
  if (!stitchedContext) throw new Error("canvas 2d context를 생성할 수 없습니다.");
  // PDF 페이지는 보통 불투명한 흰 배경이지만, 페이지마다 폭이 다른 경우 이어붙인 캔버스의
  // 빈 여백이 투명(→ PNG에서 검게 보일 수 있음)으로 남지 않도록 명시적으로 흰색을 깐다.
  stitchedContext.fillStyle = "white";
  stitchedContext.fillRect(0, 0, stitchedWidth, stitchedHeight);

  let y = 0;
  for (const canvas of pageCanvases) {
    stitchedContext.drawImage(canvas, 0, y);
    y += canvas.height;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    stitched.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("PDF를 이미지로 변환하지 못했습니다."));
    }, "image/png");
  });

  return {
    file: new File([blob], `${pdfFile.name.replace(/\.pdf$/i, "")}.png`, {
      type: "image/png",
    }),
    pageCount,
    isLowRes: scale < LOW_RES_SCALE_THRESHOLD,
  };
}
