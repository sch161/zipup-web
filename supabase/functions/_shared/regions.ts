// 안심 시그널 맵이 순회하는 지역 목록의 단일 진입점.
// 실제 목록은 data/beopjeongdong.csv(전국 법정동코드 전체자료)에서
// `npm run generate:regions`로 생성되는 regions.generated.ts에서 가져온다.
// CSV가 갱신되면 스크립트를 다시 돌리기만 하면 이 파일은 그대로 최신 목록을 재export한다.
export interface Region {
  code: string // 법정동코드 앞 5자리 (국토부 실거래가 API의 LAWD_CD)
  name: string // 화면 표시 및 뉴스 검색에 쓰이는 지역명 (전국적으로 겹치는 이름은 시/도 접두어로 구분됨)
}

export { GENERATED_REGIONS as ALL_REGIONS } from './regions.generated.ts'
