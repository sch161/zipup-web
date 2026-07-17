import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import { analyzeContract } from "../lib/analyzeContract";
import { fetchLatestNews, type NewsItem } from "../lib/news";
import { supabase } from "../lib/supabase";

function formatNewsDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [address, setAddress] = useState("");
  const [deposit, setDeposit] = useState("");
  const [buildingType, setBuildingType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestNews(5)
      .then(setNewsItems)
      .catch((err) =>
        setNewsError(
          err instanceof Error ? err.message : "뉴스를 불러오지 못했습니다.",
        ),
      )
      .finally(() => setNewsLoading(false));
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await analyzeContract({
        address,
        deposit,
        buildingType,
        file: file ?? undefined,
      });
      navigate("/analysis", { state: { result } });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 lg:gap-8 lg:px-0 lg:pt-0">
      {/* 모바일 전용 헤더 — 데스크톱은 TopNav가 대신함 */}
      <header className="flex items-center justify-between lg:hidden">
        <h1 className="text-lg font-bold text-primary">ZIPUP 🏠</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="알림"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-gray shadow-card"
          >
            🔔
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-9 items-center justify-center rounded-full bg-white px-3 text-xs font-medium text-text-gray shadow-card"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 데스크톱 전용 히어로 배너 */}
      <section className="hidden items-center justify-between gap-10 rounded-card border border-border bg-white p-10 shadow-card lg:flex">
        <div className="max-w-[420px]">
          <h2 className="text-2xl font-bold leading-snug text-text-dark">
            계약 전, <span className="text-primary">AI로 위험을</span> 먼저
            확인하세요
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-gray">
            등기부등본이나 계약서를 업로드하면 AI가 위험 조항을 자동으로
            찾아드려요.
          </p>
          <label
            htmlFor="scan-upload-desktop"
            className="mt-6 inline-flex cursor-pointer"
          >
            <span className="inline-flex h-12 items-center rounded-btn bg-primary px-6 text-sm font-bold text-white shadow-btn">
              {file ? `✓ ${file.name}` : "파일 선택하기"}
            </span>
            <input
              id="scan-upload-desktop"
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          <p className="mt-2 text-[11px] text-text-lightgray">
            PDF, JPG, PNG만 지원돼요. 한글(HWP) 파일은 한글에서 "다른 이름으로
            저장 → PDF"로 변환한 후 올려주세요.
          </p>
          {file && (
            <p className="mt-1 text-[11px] font-medium text-primary-dark">
              파일이 선택됐어요. 아래에서 매물 정보를 입력하고 "위험도
              분석하기"를 눌러야 분석이 시작돼요.
            </p>
          )}
        </div>
        <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-card bg-primary-bg text-6xl">
          🔎
        </div>
      </section>

      {/* AI 스캔 배너 카드 (모바일 전용, 데스크톱은 위 히어로가 대신함) */}
      <Card className="border-primary/40 bg-white lg:hidden">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-lg">
            🔎
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-dark">
              AI 등기부등본 스캔
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-text-gray">
              등기부등본이나 계약서를 업로드하면 AI가 위험 조항을 자동으로
              찾아드려요.
            </p>
          </div>
        </div>

        <label
          htmlFor="scan-upload"
          className="mt-4 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-input border-[1.5px] border-dashed border-primary/50 bg-primary-bg/40 text-center"
        >
          <span className="text-xl">📄</span>
          <span className="text-xs font-medium text-primary-dark">
            {file ? `✓ ${file.name}` : "파일을 선택하거나 드래그하세요"}
          </span>
          <input
            id="scan-upload"
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        <p className="mt-2 text-[10px] text-text-lightgray">
          PDF, JPG, PNG만 지원돼요. 한글(HWP) 파일은 한글에서 "다른 이름으로
          저장 → PDF"로 변환한 후 올려주세요.
        </p>
        {file && (
          <p className="mt-1 text-[10px] font-medium text-primary-dark">
            파일이 선택됐어요. 아래에서 매물 정보를 입력하고 "위험도 분석하기"를
            눌러야 분석이 시작돼요.
          </p>
        )}
      </Card>

      {/* 매물 기본 정보 + 최근 뉴스: 모바일은 세로 스택, 데스크톱(lg)은 2단 그리드 */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        {/* 매물 기본 정보 입력 카드 */}
        <Card>
          <h2 className="text-sm font-bold text-text-dark">매물 기본 정보</h2>
          <form onSubmit={handleAnalyze} className="mt-3 flex flex-col gap-3">
            <Input
              id="address"
              label="매물 주소"
              placeholder="예) 서울시 관악구 신림동"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
            <Input
              id="deposit"
              label="전세보증금 (만원)"
              placeholder="예) 25000"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              required
            />
            <Input
              id="buildingType"
              label="건물 유형"
              placeholder="예) 다세대주택, 오피스텔"
              value={buildingType}
              onChange={(e) => setBuildingType(e.target.value)}
            />
            {error && (
              <p className="text-xs font-medium text-danger">{error}</p>
            )}

            <Button type="submit" className="mt-1" disabled={loading}>
              {loading ? "AI가 분석하는 중..." : "위험도 분석하기"}
            </Button>
          </form>
        </Card>

        {/* 최근 전세사기 뉴스 카드 */}
        <Card className="mb-4 lg:mb-0">
          <h2 className="text-sm font-bold text-text-dark">
            최근 전세사기 관련 뉴스
          </h2>
          {newsLoading ? (
            <p className="mt-3 text-xs text-text-gray">뉴스를 불러오는 중...</p>
          ) : newsError ? (
            <p className="mt-3 text-xs text-danger">{newsError}</p>
          ) : newsItems.length === 0 ? (
            <p className="mt-3 text-xs text-text-gray">
              아직 등록된 뉴스가 없어요.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {newsItems.map((item) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium leading-snug text-text-dark hover:text-primary"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-[10px] text-text-gray">
                    {formatNewsDate(item.published_at)}
                    {item.media && ` · ${item.media}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
