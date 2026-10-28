"use client";

import { useEffect, useMemo, useState } from "react";
import type { MapNode } from "@/lib/api";
import { formatChg } from "@/lib/format";
import { allStocks, searchStocks, type StockHit } from "@/lib/search";

interface Props {
  data: MapNode | undefined;
  selected: string | null;
  onSelect: (hit: StockHit | null) => void;
}

export default function SearchBox({ data, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const hits = useMemo(() => (data ? searchStocks(data, query) : []), [data, query]);

  // URL로 들어온 강조 종목은 입력창에 이름을 채운다
  useEffect(() => {
    if (!selected || !data || query) return;
    const hit = allStocks(data).find((h) => h.stock.code === selected);
    if (hit) setQuery(hit.stock.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, data]);

  const choose = (hit: StockHit) => {
    onSelect(hit);
    setQuery(hit.stock.name);
    setOpen(false);
  };

  const clear = () => {
    setQuery("");
    setOpen(false);
    onSelect(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      clear();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="search">
      <input
        type="search"
        role="combobox"
        value={query}
        placeholder="종목명·코드 검색"
        aria-label="종목 검색"
        aria-autocomplete="list"
        aria-expanded={open && hits.length > 0}
        aria-controls="search-results"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (!e.target.value) onSelect(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {(selected || query) && (
        <button type="button" className="search-clear" aria-label="검색 지우기" onClick={clear}>
          ×
        </button>
      )}
      {open && hits.length > 0 && (
        <ul id="search-results" className="search-results" role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.stock.code}
              role="option"
              aria-selected={i === active}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="name">{h.stock.name}</span>
              <span className="code">{h.stock.code}</span>
              <span className="ind">{h.path[1]}</span>
              <span className="chg">{formatChg(h.stock.chg)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
