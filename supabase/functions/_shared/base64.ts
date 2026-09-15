// Deno Edge Runtime has no Buffer — atob/btoa work fine for base64 since it's always ASCII.
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// 바이트 1개씩 String.fromCharCode + 문자열 concat을 하면 이미지 크기(수백 KB~수 MB)에 비례해
// 함수 호출/문자열 연산이 그만큼 반복돼 CPU 시간이 크게 늘어난다(실측: 사진 한 장에 수백만 회).
// 청크 단위로 fromCharCode를 호출하면 호출 횟수가 bytes.length에서 bytes.length/CHUNK_SIZE로
// 줄어든다.
const CHUNK_SIZE = 8192 // fromCharCode 인자 개수 상한(엔진마다 다르지만 대략 65536) 안에서 안전한 값

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)))
  }
  return btoa(chunks.join(''))
}
