-- 계약서 위험도 점수의 방향을 "낮을수록 위험"에서 "높을수록 위험"(SignalMap과 동일)으로 뒤집으면서,
-- 이미 저장된 기존 행들은 옛 기준으로 계산된 값이라 그대로 두면 새 기준으로 잘못 해석된다.
-- 값을 억지로 변환(100-score)하지 않고 버전 컬럼으로 구분한다 — 기존 데이터가 Gemini의 자유
-- 판단이라 새 계산식과 완벽히 수학적으로 들어맞는다는 보장이 없어서(에초에 이 리워크의 계기),
-- 기계적으로 뒤집어봤자 근사치일 뿐이기 때문이다. 대신 프론트에서 score_direction을 보고 화면에
-- "예전 채점 기준" 안내를 보여준다(src/pages/Analysis.tsx 참고).
alter table public.analyses add column score_direction text;

-- 이 마이그레이션 시점에 이미 존재하는 행은 전부 옛 기준("낮을수록 위험")으로 계산된 값이다.
update public.analyses set score_direction = 'legacy_low_is_risky' where score_direction is null;

alter table public.analyses alter column score_direction set default 'high_is_risky';
alter table public.analyses alter column score_direction set not null;
alter table public.analyses add constraint analyses_score_direction_check
  check (score_direction in ('high_is_risky', 'legacy_low_is_risky'));
