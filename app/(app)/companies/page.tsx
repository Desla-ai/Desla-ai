"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CompanyDetailSheet } from "@/components/companies/company-detail-sheet";
import { Label } from "@/components/ui/label";

export type Company = {
  id: string;
  name: string;
  biz_no?: string;
  ceo_name?: string;
  address?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
};

type Json = Record<string, any>;
async function safeJson(res: Response): Promise<Json> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);

  // ✅ New Company form
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyBizNo, setNewCompanyBizNo] = useState("");
  const [newCompanyCeoName, setNewCompanyCeoName] = useState("");
  const [newCompanyAddress, setNewCompanyAddress] = useState("");
  const [newCompanyPhone, setNewCompanyPhone] = useState("");

  const canCreate = useMemo(() => {
    const nameOk = newCompanyName.trim().length > 0;
    const bizOk = newCompanyBizNo.trim().length > 0;
    return nameOk && bizOk;
  }, [newCompanyName, newCompanyBizNo]);

  const resetCreateForm = () => {
    setNewCompanyName("");
    setNewCompanyBizNo("");
    setNewCompanyCeoName("");
    setNewCompanyAddress("");
    setNewCompanyPhone("");
  };

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `불러오기 실패 (${res.status})`);
      setCompanies(Array.isArray(json?.companies) ? json.companies : []);
    } catch (e: any) {
      toast.error(e?.message ?? "회사 목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const handleOpenCompany = (c: Company) => {
    setSelectedCompany(c);
    setSheetOpen(true);
  };

  const handleCreate = async () => {
    const name = newCompanyName.trim();
    const bizNo = newCompanyBizNo.trim();
    const ceoName = newCompanyCeoName.trim();
    const address = newCompanyAddress.trim();
    const phone = newCompanyPhone.trim();

    if (!name) return toast.error("회사명을 입력해 주세요.");
    if (!bizNo) return toast.error("사업자번호를 입력해 주세요.");

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bizNo, ceoName, address, phone }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `생성 실패 (${res.status})`);

      toast.success("회사를 추가했습니다");
      setAddOpen(false);
      resetCreateForm();
      await loadCompanies();
    } catch (e: any) {
      toast.error(e?.message ?? "회사 추가 중 오류가 발생했습니다");
    }
  };

  const handleUpdated = async (c: Company | null) => {
    setSelectedCompany(c);
    await loadCompanies();
  };

  return (
    <AppShell title="회사">
      <div className="px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">회사</h1>
            <p className="text-sm text-muted-foreground">건설사(업체) 기본 정보를 관리합니다.</p>
          </div>
          <Button
            onClick={() => {
              resetCreateForm();
              setAddOpen(true);
            }}
          >
            회사 추가
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        ) : companies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            아직 등록된 회사가 없습니다. “회사 추가”를 눌러 생성하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {companies.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer transition hover:bg-accent"
                onClick={() => handleOpenCompany(c)}
              >
                <CardContent className="p-5">
                  <div className="text-base font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    클릭하여 상세/출력을 확인하세요
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Company Dialog */}
        <Dialog
          open={addOpen}
          onOpenChange={(o) => {
            setAddOpen(o);
            if (!o) resetCreateForm();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>회사 추가</DialogTitle>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>회사명 *</Label>
                <Input
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="예: 삼성인테리어"
                />
              </div>

              <div className="grid gap-1.5">
                <Label>사업자번호 *</Label>
                <Input
                  value={newCompanyBizNo}
                  onChange={(e) => setNewCompanyBizNo(e.target.value)}
                  placeholder="123-45-67890"
                />
                <div className="text-xs text-muted-foreground">
                  숫자/하이픈만 입력 (예: 123-45-67890)
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>대표자명</Label>
                <Input
                  value={newCompanyCeoName}
                  onChange={(e) => setNewCompanyCeoName(e.target.value)}
                  placeholder="예: 홍길동"
                />
              </div>

              <div className="grid gap-1.5">
                <Label>주소</Label>
                <Input
                  value={newCompanyAddress}
                  onChange={(e) => setNewCompanyAddress(e.target.value)}
                  placeholder="예: 서울시 ..."
                />
              </div>

              <div className="grid gap-1.5">
                <Label>전화</Label>
                <Input
                  value={newCompanyPhone}
                  onChange={(e) => setNewCompanyPhone(e.target.value)}
                  placeholder="예: 02-1234-5678"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setAddOpen(false)}>
                취소
              </Button>
              <Button onClick={handleCreate} disabled={!canCreate}>
                추가
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Sheet */}
        <CompanyDetailSheet
          company={selectedCompany}
          open={sheetOpen}
          onOpenChange={(o) => {
            setSheetOpen(o);
            if (!o) setSelectedCompany(null);
          }}
          onCompanyUpdated={handleUpdated}
          onCompanyDeleted={async () => {
            setSheetOpen(false);
            setSelectedCompany(null);
            await loadCompanies();
          }}
        />
      </div>
    </AppShell>
  );
}
