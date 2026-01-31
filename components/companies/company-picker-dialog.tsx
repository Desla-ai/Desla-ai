"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CompanyLite = {
  id: string;
  name: string;
  biz_no: string;
  ceo_name?: string | null;
  address?: string | null;
  phone?: string | null;
};

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

export function CompanyPickerDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (c: CompanyLite) => void;
  initialQuery?: string;
}) {
  const { open, onOpenChange, onPick } = props;

  const [query, setQuery] = useState(props.initialQuery ?? "");
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyLite[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setError("");

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/companies?query=${encodeURIComponent(query.trim())}`;
        const res = await fetch(url);
        const j = await safeJson(res);
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        setCompanies(j?.companies ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to search companies");
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    }, 200); // debounce

    return () => clearTimeout(t);
  }, [open, query]);

  const items = useMemo(() => companies, [companies]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>회사 검색</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="회사명 또는 사업자번호로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : null}

          <div className="max-h-[360px] overflow-auto rounded-md border">
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground">검색 중…</div>
            ) : items.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">검색 결과가 없습니다.</div>
            ) : (
              <ul className="divide-y">
                {items.map((c) => (
                  <li key={c.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        사업자번호: {c.biz_no}
                        {c.ceo_name ? ` · 대표: ${c.ceo_name}` : ""}
                      </div>
                      {c.address ? (
                        <div className="text-xs text-muted-foreground truncate">주소: {c.address}</div>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onPick(c);
                        onOpenChange(false);
                      }}
                    >
                      선택
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            회사는 미리 생성해 둔 뒤 현장에 1개만 연결합니다.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
