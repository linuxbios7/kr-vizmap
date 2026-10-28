"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import BubbleCanvas from "@/components/BubbleCanvas";
import BubbleControls from "@/components/BubbleControls";
import ControlBar from "@/components/ControlBar";
import Legend from "@/components/Legend";
import SearchBox from "@/components/SearchBox";
import TreemapCanvas from "@/components/TreemapCanvas";
import { fetcher, type BubbleResponse, type MapNode, type MapResponse } from "@/lib/api";
import { bubblesToTree } from "@/lib/bubbleLayout";
import { STATIC_DATA, urls } from "@/lib/dataSource";
import { PERIOD_RANGE } from "@/lib/colorScale";
import { allStocks, isUnder, pruneTopN, type StockHit } from "@/lib/search";
import { isStale } from "@/lib/staleness";
import { findNode } from "@/lib/treemapLayout";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { parseState, serializeState, type MapState, type View } from "@/lib/urlState";

const REFRESH_MS = 3 * 60 * 1000;
const MOBILE_TOP_N = 200;
const SWR_OPTS = { refreshInterval: REFRESH_MS, keepPreviousData: true };

const VIEWS: { value: View; label: string }[] = [
  { value: "map", label: "맵" },
  { value: "bubble", label: "버블" },
];

function MapPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => parseState(new URLSearchParams(params.toString())), [params]);
  const { market, period, colorMode, path, highlight, view } = state;
  const isMobile = useMediaQuery("(max-width: 767px)");

  // 상태의 원본은 URL. 변경은 replace로 기록해 뒤로가기 기록을 어지럽히지 않는다.
  const update = useCallback(
    (patch: Partial<MapState>) => {
      const qs = serializeState({ ...state, ...patch });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [state, router, pathname],
  );

  // 보고 있는 화면의 데이터만 받는다
  const mapRes = useSWR<MapResponse>(
    view === "map" ? urls.map(market, period) : null,
    fetcher,
    SWR_OPTS,
  );
  const bubbleRes = useSWR<BubbleResponse>(
    view === "bubble" ? urls.bubbles(market) : null,
    fetcher,
    SWR_OPTS,
  );
  const { error, isLoading } = view === "map" ? mapRes : bubbleRes;

  // 수집이 멈추면(장중 지연·장 마감 후 미갱신) 경고를 띄운다.
  // 정적 모드는 서버가 없어 브라우저에서 판단한다 (GitHub Actions 예약 실행은 늦어질 수 있어 60분 여유).
  const { data: health } = useSWR<{ stale?: boolean; last_collected?: string | null }>(
    urls.health,
    fetcher,
    { refreshInterval: 60_000 },
  );
  const stale = health
    ? STATIC_DATA
      ? isStale(health.last_collected ?? null, new Date(), 60)
      : Boolean(health.stale)
    : false;

  // 검색·줌·툴팁이 쓰는 섹터/업종/종목 트리. 모바일은 시총 상위 N종목만 (강조 종목은 유지)
  const tree = useMemo<MapNode | undefined>(() => {
    const full =
      view === "map"
        ? mapRes.data
        : bubbleRes.data
          ? bubblesToTree(bubbleRes.data, period)
          : undefined;
    return full && isMobile ? { ...full, ...pruneTopN(full, MOBILE_TOP_N, highlight) } : full;
  }, [view, mapRes.data, bubbleRes.data, period, isMobile, highlight]);

  const bubbleStocks = useMemo(() => {
    if (!bubbleRes.data || !tree) return [];
    if (!isMobile) return bubbleRes.data.stocks;
    const keep = new Set(allStocks(tree).map((h) => h.stock.code));
    return bubbleRes.data.stocks.filter((s) => keep.has(s.code));
  }, [bubbleRes.data, tree, isMobile]);

  // 시장이 바뀌어 현재 줌 대상이 없어지면 루트로
  const validPath = useMemo(() => (tree && findNode(tree, path) ? path : []), [tree, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (validPath.length) update({ path: validPath.slice(0, -1) });
      else if (highlight) update({ highlight: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [validPath, highlight, update]);

  const onSearch = (hit: StockHit | null) => {
    if (!hit) return update({ highlight: null });
    // 현재 줌 범위 밖 종목이면 전체 보기로
    update({ highlight: hit.stock.code, path: isUnder(hit.path, validPath) ? validPath : [] });
  };

  const crumbs = [market === "ALL" ? "전체" : market, ...validPath];
  const asof = view === "map" ? mapRes.data?.asof : bubbleRes.data?.asof;
  const baseDate = view === "map" ? mapRes.data?.base_date : bubbleRes.data?.base_dates[period];
  const hint =
    view === "map"
      ? isMobile
        ? "헤더 탭: 확대 · 종목 탭: 정보, 한 번 더: 네이버증권"
        : "헤더 클릭: 확대 · 우클릭/Esc: 축소 · 종목 클릭: 네이버증권"
      : isMobile
        ? "섹터 이름 탭: 확대 · 버블 탭: 정보, 한 번 더: 네이버증권"
        : "섹터 이름 클릭: 확대 · 우클릭/Esc: 축소 · 버블 클릭: 네이버증권";

  return (
    <main className="page">
      <header className="topbar">
        <h1>KR Market Map</h1>
        <div className="segmented" role="group" aria-label="화면">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={view === v.value ? "active" : undefined}
              aria-pressed={view === v.value}
              onClick={() => update({ view: v.value })}
            >
              {v.label}
            </button>
          ))}
        </div>
        <SearchBox data={tree} selected={highlight} onSelect={onSearch} />
        <ControlBar
          market={market}
          period={period}
          colorMode={colorMode}
          onMarket={(m) => update({ market: m, highlight: null })}
          onPeriod={(p) => update({ period: p })}
          onColorMode={(c) => update({ colorMode: c })}
        />
      </header>

      {view === "bubble" && (
        <BubbleControls x={state.bx} y={state.by} group={state.bg} onChange={update} />
      )}

      <nav className="breadcrumb" aria-label="줌 경로">
        {crumbs.map((c, i) => (
          <span key={i} className="crumb">
            {i > 0 && <span className="sep">›</span>}
            {i < crumbs.length - 1 ? (
              <button type="button" onClick={() => update({ path: validPath.slice(0, i) })}>
                {c}
              </button>
            ) : (
              <span className="current">{c}</span>
            )}
          </span>
        ))}
        {isMobile && <span className="muted note">시총 상위 {MOBILE_TOP_N}종목</span>}
        <span className="hint">{hint}</span>
      </nav>

      <section className="map-area">
        {error && !tree && <p className="muted center">데이터를 불러오지 못했습니다.</p>}
        {isLoading && !tree && <p className="muted center">불러오는 중…</p>}
        {view === "map" && tree && mapRes.data && (
          <TreemapCanvas
            data={{ ...mapRes.data, ...tree }}
            colorMode={colorMode}
            path={validPath}
            onZoom={(p) => update({ path: p })}
            highlight={highlight}
          />
        )}
        {view === "bubble" && tree && bubbleRes.data && (
          <BubbleCanvas
            stocks={bubbleStocks}
            tree={tree}
            x={state.bx}
            y={state.by}
            period={period}
            group={state.bg}
            colorMode={colorMode}
            path={validPath}
            onZoom={(p) => update({ path: p })}
            highlight={highlight}
          />
        )}
      </section>

      <footer className="footer">
        <Legend colorMode={colorMode} range={PERIOD_RANGE[period]} />
        {stale && (
          <span className="stale" role="status">
            ⚠ 시세 갱신이 지연되고 있습니다
          </span>
        )}
        <span className="muted">
          {asof && `기준 ${asof.replace("T", " ").slice(0, 16)}`}
          {baseDate && ` · 비교일 ${baseDate}`} · 출처 네이버증권(지연 시세) · 투자 권유 아님
        </span>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<p className="muted center">불러오는 중…</p>}>
      <MapPage />
    </Suspense>
  );
}
