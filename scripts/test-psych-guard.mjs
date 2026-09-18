// scripts/test-psych-guard.mjs
// analyzePsychGuard()를 예제 대화 3개에 대해 돌려보는 간단한 수동 테스트 스크립트.
// supabase/functions/_shared는 Deno용 .ts라 Node에서 바로 import는 못 하므로,
// 같은 로직을 그대로 옮겨와 검증한다. 로직을 바꿀 땐 두 파일을 함께 수정할 것.
import { PSYCH_GUARD_CATEGORIES } from "../supabase/functions/_shared/psychGuardPatterns.ts";

const COMPLEX_PATTERN_MIN_CATEGORIES = 2;
const COMPLEX_PATTERN_BONUS = 5;
const GRADE_THRESHOLDS = { caution: 21, danger: 51 };

function gradeFromScore(totalScore) {
  if (totalScore >= GRADE_THRESHOLDS.danger) return "danger";
  if (totalScore >= GRADE_THRESHOLDS.caution) return "caution";
  return "safe";
}

function analyzePsychGuard(conversationText) {
  const text = conversationText ?? "";

  const categoryBreakdown = PSYCH_GUARD_CATEGORIES.map(({ category, weight, keywords }) => {
    const matchedKeywords = keywords.filter((keyword) => text.includes(keyword));
    return { category, matchedKeywords, score: matchedKeywords.length * weight };
  });

  const matchedCategoryCount = categoryBreakdown.filter((c) => c.matchedKeywords.length > 0).length;
  const hasComplexPattern = matchedCategoryCount >= COMPLEX_PATTERN_MIN_CATEGORIES;

  const categoryScoreSum = categoryBreakdown.reduce((sum, c) => sum + c.score, 0);
  const totalScore = categoryScoreSum + (hasComplexPattern ? COMPLEX_PATTERN_BONUS : 0);

  return { totalScore, grade: gradeFromScore(totalScore), categoryBreakdown, hasComplexPattern };
}

const examples = [
  {
    name: "안전한 대화 (매칭 없음)",
    text: "안녕하세요, 집 보러 가는 시간은 편하실 때 말씀해주시면 맞춰볼게요. 궁금한 점 있으면 언제든 물어보세요.",
  },
  {
    name: "희소성만 있는 대화",
    text: "이 집 오늘 안 하시면 나가요. 지금 결정 안 하시면 다른 분한테 넘어가요.",
  },
  {
    name: "복합 패턴 대화 (희소성+권위)",
    text: "오늘 계약 안 하시면 다른 분한테 넘어가요. 제가 다 확인했으니까 걱정하지 마세요.",
  },
];

for (const { name, text } of examples) {
  const result = analyzePsychGuard(text);
  console.log(`\n=== ${name} ===`);
  console.log(`대화: "${text}"`);
  console.log(`totalScore: ${result.totalScore}, grade: ${result.grade}, hasComplexPattern: ${result.hasComplexPattern}`);
  const matched = result.categoryBreakdown.filter((c) => c.matchedKeywords.length > 0);
  if (matched.length === 0) {
    console.log("매칭된 카테고리 없음");
  } else {
    for (const c of matched) {
      console.log(`  - ${c.category}: score=${c.score}, matchedKeywords=${JSON.stringify(c.matchedKeywords)}`);
    }
  }
}
