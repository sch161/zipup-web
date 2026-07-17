// southkorea-maps의 municipalities topojson(2018, 자체 임의 code 체계)을 GeoJSON으로 변환하고,
// 각 feature의 code 속성을 실제 LAWD 코드(region_stats.region_code)로 교체한다.
// 매칭 키: (시/도, 시군구 짧은 이름) - 이 레포의 code는 LAWD와도, 자기 자신의 시도 코드와도
// 일관되게 대응하지 않아서 이름 기반으로만 교차 매칭 가능하다.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import * as topojson from 'topojson-client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// 1. CSV에서 leaf 지역(시군구 단위, LAWD 코드) + 원본 시/도명 추출 (generate-regions.mjs와 동일 로직)
function readCsvRows() {
  const buf = readFileSync(path.join(ROOT, 'data/beopjeongdong.csv'))
  const text = iconv.decode(buf, 'cp949')
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const [, ...dataLines] = lines
  return dataLines.map((line) => {
    const [code, name, status] = line.split(',').map((s) => s.trim())
    return { code, name, status }
  })
}

function extractLeafRegions(rows) {
  const candidates = rows.filter(
    (r) => r.status === '존재' && r.code.length === 10 && r.code.slice(5) === '00000' && r.code.slice(2, 5) !== '000',
  )
  return candidates.filter((r) => !candidates.some((other) => other.name.startsWith(`${r.name} `)))
}

const csvRows = readCsvRows()
const leaves = extractLeafRegions(csvRows)

// key: `${시도}::${공백제거 시군구명}` -> LAWD 5자리 코드
const crosswalk = new Map()
for (const r of leaves) {
  const tokens = r.name.split(' ')
  const sido = tokens[0]
  const shortName = tokens.length > 1 ? tokens.slice(1).join('') : tokens[0] // 세종특별자치시: 단일 토큰
  crosswalk.set(`${sido}::${shortName}`, r.code.slice(0, 5))
}
console.log('CSV 기준 leaf 지역 수:', leaves.length)

// 2. 2018 topojson의 시/도명 → 현재(2026) CSV 기준 시/도명 별칭 정규화
const SIDO_ALIAS = {
  강원도: '강원특별자치도',
  전라북도: '전북특별자치도',
}
function normalizeSido(name) {
  return SIDO_ALIAS[name] ?? name
}

// 3. provinces topology에서 repo 자체 시도 code(2자리) -> 시/도명 매핑
const provinceTopo = JSON.parse(readFileSync(path.join(ROOT, 'data/skorea-provinces-topo.json'), 'utf8'))
const provinceObjKey = Object.keys(provinceTopo.objects)[0]
const provinceGeometries = provinceTopo.objects[provinceObjKey].geometries
const repoSidoCodeToName = new Map(provinceGeometries.map((g) => [g.properties.code, g.properties.name]))

// 4. municipalities topology 로드 + GeoJSON으로 변환
const muniTopo = JSON.parse(readFileSync(path.join(ROOT, 'data/skorea-municipalities-topo.json'), 'utf8'))
const muniObjKey = Object.keys(muniTopo.objects)[0]
const featureCollection = topojson.feature(muniTopo, muniTopo.objects[muniObjKey])
console.log('municipalities feature 수:', featureCollection.features.length)

// 5. 2018년 지도 제작 이후 실제로 이름/소속이 바뀐 지역들은 이름만으로 교차 매칭이 안 되므로
// `${시도}::${당시 이름}` -> 현재 LAWD 코드로 직접 매핑한다. (부천시는 alias를 추가하지 않음 —
// 2016~2024년 사이 원미/소사/오정구가 통합되어 있던 시기의 경계라 지금의 구 3개 중 어느 것과도
// 1:1로 대응하지 않는다. 매칭 실패로 남겨 보고한다.)
const MANUAL_ALIASES = {
  '세종특별자치시::세종시': '36110', // 세종은 하위 구가 없어 CSV(단일 토큰 "세종특별자치시")와 이름 형태만 다름
  '인천광역시::남구': '28177', // 2018년 미추홀구로 개칭
  '경상북도::군위군': '27720', // 2023년 대구광역시로 편입(행정구역 변경으로 소속 시/도가 바뀜)
}

const unmatched = []
let matched = 0
for (const feature of featureCollection.features) {
  const props = feature.properties
  const repoSidoCode = props.code.slice(0, 2)
  const sido2018 = repoSidoCodeToName.get(repoSidoCode)
  const sido = normalizeSido(sido2018)
  const key = `${sido}::${props.name}`
  const lawdCode = MANUAL_ALIASES[key] ?? crosswalk.get(key)

  if (lawdCode) {
    props.code = lawdCode
    matched++
  } else {
    unmatched.push({ name: props.name, repoCode: props.code, resolvedSido: sido })
    delete props.code // 매칭 안 되는 지역은 잘못된(LAWD 아닌) code를 남기지 않는다
  }
}

console.log('매칭 성공:', matched, '/', featureCollection.features.length)
console.log('매칭 실패:', unmatched.length)
console.log(JSON.stringify(unmatched, null, 2))

writeFileSync(path.join(ROOT, 'public/data/skorea-municipalities.json'), JSON.stringify(featureCollection))
console.log('public/data/skorea-municipalities.json 저장 완료')
