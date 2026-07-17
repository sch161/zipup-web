// data/beopjeongdong.csv(전국 법정동코드 전체자료, CP949) → 전국 시군구(LAWD_CD) 단위
// 지역 목록을 생성한다.
//
// 사용법:
//   node scripts/generate-regions.mjs          # regions.generated.ts만 생성
//   node scripts/generate-regions.mjs --sql    # + region_stats 시드용 SQL도 생성
//
// 알고리즘:
//   1. 법정동코드 10자리 중 뒤 5자리(읍면동+리)가 전부 0이고 시군구 3자리가 000이 아닌
//      "존재" 행만 추린다 → 시/도 + 시군구 단위 행 (자치구가 있는 시는 그 시 자체 행도 함께 잡힘).
//   2. 그 중 다른 행의 이름이 "이 행의 이름 + 공백 + ..."로 시작하는 행(= 하위 구가 있는
//      상위 "시")은 제외한다. 예: "경기도 수원시"는 제외하고 "경기도 수원시 장안구" 등만 남긴다.
//      → 국토부 실거래가 API가 실제로 쓰는 LAWD_CD 단위(구가 있으면 구, 없으면 시/군)와 일치시킴.
//   3. 남은 이름의 마지막 토큰(구/시/군명)이 전국적으로 겹치면(중구, 강서구 등) 시/도 축약명을
//      앞에 붙여 자동으로 구분한다.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CSV_PATH = path.join(ROOT, 'data/beopjeongdong.csv')
const OUT_TS_PATH = path.join(ROOT, 'supabase/functions/_shared/regions.generated.ts')
const OUT_SQL_PATH = path.join(ROOT, 'supabase/seed-all-regions.generated.sql')

const SIDO_SHORT_NAME = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
}

function readCsvRows() {
  const buf = readFileSync(CSV_PATH)
  const text = iconv.decode(buf, 'cp949')
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const [, ...dataLines] = lines // 헤더(법정동코드,법정동명,폐지여부) 제외

  return dataLines.map((line) => {
    const [code, name, status] = line.split(',').map((s) => s.trim())
    return { code, name, status }
  })
}

function extractLeafRegions(rows) {
  const candidates = rows.filter(
    (r) => r.status === '존재' && r.code.length === 10 && r.code.slice(5) === '00000' && r.code.slice(2, 5) !== '000',
  )

  // 하위 구가 있는 상위 "시" 행 제외 (예: "경기도 수원시"는 "경기도 수원시 장안구" 등이 있으므로 제외)
  return candidates.filter((r) => !candidates.some((other) => other.name.startsWith(`${r.name} `)))
}

/** "서울특별시 종로구" → "종로구", "경기도 수원시 장안구" → "수원시 장안구", 단일 토큰(세종)은 그대로. */
function shortName(fullName) {
  const tokens = fullName.split(' ')
  return tokens.length > 1 ? tokens.slice(1).join(' ') : tokens[0]
}

function withDisambiguation(leaves) {
  const counts = new Map()
  for (const r of leaves) {
    const key = shortName(r.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return leaves.map((r) => {
    const sido = r.name.split(' ')[0]
    const rest = shortName(r.name)
    const isDuplicate = (counts.get(rest) ?? 0) > 1
    const name = isDuplicate ? `${SIDO_SHORT_NAME[sido] ?? sido} ${rest}` : rest
    return { code: r.code.slice(0, 5), name }
  })
}

function main() {
  const rows = readCsvRows()
  const leaves = extractLeafRegions(rows)
  const regions = withDisambiguation(leaves).sort((a, b) => a.code.localeCompare(b.code))

  const tsBody = regions.map((r) => `  { code: '${r.code}', name: '${r.name}' },`).join('\n')
  const ts = `// scripts/generate-regions.mjs로 data/beopjeongdong.csv에서 자동 생성됨. 직접 수정하지 말 것.
// 재생성: npm run generate:regions
import type { Region } from './regions.ts'

export const GENERATED_REGIONS: Region[] = [
${tsBody}
]
`
  writeFileSync(OUT_TS_PATH, ts, 'utf8')
  console.log(`${path.relative(ROOT, OUT_TS_PATH)} 생성 완료 (${regions.length}개 지역)`)

  if (process.argv.includes('--sql')) {
    const values = regions.map((r) => `  ('${r.code}', '${r.name.replace(/'/g, "''")}')`).join(',\n')
    const sql = `-- scripts/generate-regions.mjs --sql 로 자동 생성됨.
-- 적용 시 \`supabase migration new expand_region_stats_nationwide\`로 새 마이그레이션 파일을 만들고
-- 아래 내용을 그 안에 붙여넣을 것 (이 파일 자체는 migrations/ 폴더 밖에 있어 자동 적용되지 않음).
insert into public.region_stats (region_code, region_name) values
${values}
on conflict (region_code) do nothing;
`
    writeFileSync(OUT_SQL_PATH, sql, 'utf8')
    console.log(`${path.relative(ROOT, OUT_SQL_PATH)} 생성 완료 (${regions.length}개 지역)`)
  }
}

main()
