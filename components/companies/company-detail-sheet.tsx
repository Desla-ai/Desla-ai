"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type Company = {
  id: string;
  name: string;
};

type Json = Record<string, any>;
async function safeJson(res: Response): Promise<Json> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function CompanyDetailSheet({
  company,
  open,
  onOpenChange,
  onCompanyUpdated,
  onCompanyDeleted,
}: {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompanyUpdated: (company: Company | null) => void;
  onCompanyDeleted: () => void;
}) {
  const companyId = company?.id ?? "";

  const [name, setName] = useState(company?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  // keep local name in sync when company changes
  useMemo(() => {
    setName(company?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const canSave = name.trim().length > 0 && !!companyId;
  const canExport = !!companyId && !!periodStart && !!periodEnd && periodStart <= periodEnd;

  const handleSaveName = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `저장 실패 (${res.status})`);
      toast.success("회사명을 저장했습니다");
      onCompanyUpdated(json?.company ?? { id: companyId, name: name.trim() });
    } catch (e: any) {
      toast.error(e?.message ?? "저장 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;
    if (!confirm("회사를 삭제할까요? 연결된 현장이 있으면 삭제할 수 없습니다.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `삭제 실패 (${res.status})`);
      toast.success("회사를 삭제했습니다");
      onCompanyDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? "삭제 중 오류가 발생했습니다");
    } finally {
      setDeleting(false);
    }
  };

  const exportFile = async (docType: "INVOICE" | "WAGE_LEDGER", format: "pdf" | "xlsx") => {
    if (!canExport) {
      toast.error("기간을 올바르게 입력해 주세요(시작일 <= 종료일)");
      return;
    }
    const key = `${docType}-${format}`;
    setExporting(key);
    try {
      const qs = new URLSearchParams({
        companyId,
        periodStart,
        periodEnd,
        docType,
        format,
      });
      const url = `/api/exports/labor?${qs.toString()}`;

      // 다운로드용: blob으로 받아 a 태그로 저장
      const res = await fetch(url);
      if (!res.ok) {
        const json = await safeJson(res);
        throw new Error(json?.error ?? `출력 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = `${docType}_${periodStart}_${periodEnd}.${format}`;
      downloadUrl(blobUrl, filename);
      URL.revokeObjectURL(blobUrl);
      toast.success("파일을 다운로드했습니다");
    } catch (e: any) {
      toast.error(e?.message ?? "출력 중 오류가 발생했습니다");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>회사 상세</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-6">
          <div className="space-y-2">
            <Label>회사명</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="회사명" />
            <div className="flex gap-2">
              <Button onClick={handleSaveName} disabled={!canSave || saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-semibold">출력</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>시작일</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>종료일</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => exportFile("INVOICE", "pdf")}
                disabled={!canExport || exporting !== null}
              >
                {exporting === "INVOICE-pdf" ? "생성 중..." : "노무비 청구서 PDF"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => exportFile("INVOICE", "xlsx")}
                disabled={!canExport || exporting !== null}
              >
                {exporting === "INVOICE-xlsx" ? "생성 중..." : "노무비 청구서 엑셀"}
              </Button>
              <Button
                onClick={() => exportFile("WAGE_LEDGER", "pdf")}
                disabled={!canExport || exporting !== null}
              >
                {exporting === "WAGE_LEDGER-pdf" ? "생성 중..." : "노임대장 PDF"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => exportFile("WAGE_LEDGER", "xlsx")}
                disabled={!canExport || exporting !== null}
              >
                {exporting === "WAGE_LEDGER-xlsx" ? "생성 중..." : "노임대장 엑셀"}
              </Button>
            </div>

            {!canExport && (
              <div className="text-xs text-muted-foreground">
                기간을 입력하면 출력 버튼이 활성화됩니다.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
