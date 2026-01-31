"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Company = {
  id: string;
  name: string;
  biz_no?: string;
  ceo_name?: string;
  address?: string;
  phone?: string;
};

type Json = Record<string, any>;
async function safeJson(res: Response): Promise<Json> {
  try {
    return await res.json();
  } catch {
    return {};
  }
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

  // editable fields
  const [name, setName] = useState(company?.name ?? "");
  const [bizNo, setBizNo] = useState(company?.biz_no ?? "");
  const [ceoName, setCeoName] = useState(company?.ceo_name ?? "");
  const [address, setAddress] = useState(company?.address ?? "");
  const [phone, setPhone] = useState(company?.phone ?? "");

  const [saving, setSaving] = useState(false);

  // delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // invoice-create state (replaces export download)
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  useEffect(() => {
    setName(company?.name ?? "");
    setBizNo(company?.biz_no ?? "");
    setCeoName(company?.ceo_name ?? "");
    setAddress(company?.address ?? "");
    setPhone(company?.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const canSave = useMemo(() => {
    return !!companyId && name.trim().length > 0 && bizNo.trim().length > 0;
  }, [companyId, name, bizNo]);

  const canCreateInvoice = !!companyId && !!periodStart && !!periodEnd && periodStart <= periodEnd;

  const handleSave = async () => {
    if (!canSave) {
      if (!companyId) toast.error("회사 선택이 없습니다.");
      else if (!name.trim()) toast.error("회사명을 입력해 주세요.");
      else if (!bizNo.trim()) toast.error("사업자번호를 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          bizNo: bizNo.trim(),
          ceoName: ceoName.trim(),
          address: address.trim(),
          phone: phone.trim(),
        }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `저장 실패 (${res.status})`);

      toast.success("회사 정보를 저장했습니다");
      onCompanyUpdated(json?.company ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "저장 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `삭제 실패 (${res.status})`);

      toast.success("회사를 삭제했습니다");
      setDeleteDialogOpen(false);
      onCompanyDeleted();
    } catch (e: any) {
      toast.error(e?.message ?? "삭제 중 오류가 발생했습니다");
    } finally {
      setDeleting(false);
    }
  };

  /**
   * ✅ NEW: “출력” 대신 “청구 탭에 청구서 추가(초안)”로 전환
   * - 여기서는 /api/invoices 로 POST하는 형태를 가정
   * - 실제로는 우리가 다음 단계에서 ‘company 기준 청구서 생성’ endpoint를 확정하면 body만 맞추면 됨
   */
  const createInvoiceFromCompany = async () => {
    if (!canCreateInvoice) {
      toast.error("기간을 올바르게 입력해 주세요(시작일 <= 종료일)");
      return;
    }

    setCreatingInvoice(true);
    try {
      // 1) 추천: 신규 endpoint를 만들면 더 깔끔함
      //    POST /api/invoices/from-company  { companyId, periodStart, periodEnd }
      //
      // 2) 임시: 기존 /api/invoices POST에 contractorName으로 회사명만 넣고
      //    lineItems는 서버에서 기간 집계로 채우는 방식으로 확장
      const res = await fetch("/api/invoices/from-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          periodStart,
          periodEnd,
        }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `청구서 생성 실패 (${res.status})`);

      toast.success("청구 탭에 청구서가 추가되었습니다");
      // 여기서 billing 탭으로 라우팅까지 하고 싶으면:
      // router.push("/billing") (추가 구현 필요)
    } catch (e: any) {
      toast.error(e?.message ?? "청구서 생성 중 오류가 발생했습니다");
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>회사 상세</SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-6">
            {/* Company fields */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>회사명 *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="회사명" />
              </div>

              <div className="space-y-1">
                <Label>사업자번호 *</Label>
                <Input value={bizNo} onChange={(e) => setBizNo(e.target.value)} placeholder="123-45-67890" />
                <div className="text-xs text-muted-foreground">숫자/하이픈만 입력</div>
              </div>

              <div className="space-y-1">
                <Label>대표자명</Label>
                <Input value={ceoName} onChange={(e) => setCeoName(e.target.value)} placeholder="대표자명" />
              </div>

              <div className="space-y-1">
                <Label>주소</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
              </div>

              <div className="space-y-1">
                <Label>전화</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="02-1234-5678" />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={!canSave || saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={!companyId || deleting}
                >
                  삭제
                </Button>
              </div>
            </div>

            <Separator />

            {/* NEW: Create invoice (instead of download export) */}
            <div className="space-y-3">
              <div className="text-sm font-semibold">청구서 생성(청구 탭에 추가)</div>

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

              <Button onClick={createInvoiceFromCompany} disabled={!canCreateInvoice || creatingInvoice}>
                {creatingInvoice ? "추가 중..." : "청구 탭에 청구서 추가"}
              </Button>

              {!canCreateInvoice && (
                <div className="text-xs text-muted-foreground">
                  기간을 입력하면 버튼이 활성화됩니다.
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog (custom UI) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>회사를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              연결된 현장이 있으면 삭제할 수 없습니다. 삭제 후 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
