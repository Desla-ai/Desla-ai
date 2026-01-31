"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CompanyDetailSheet } from "@/components/companies/company-detail-sheet";

export type Company = {
  id: string;
  name: string;
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
  const [newName, setNewName] = useState("");
  const canCreate = useMemo(() => newName.trim().length > 0, [newName]);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
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
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? `생성 실패 (${res.status})`);
      toast.success("회사를 추가했습니다");
      setAddOpen(false);
      setNewName("");
      await loadCompanies();
    } catch (e: any) {
      toast.error(e?.message ?? "회사 추가 중 오류가 발생했습니다");
    }
  };

  const handleUpdated = async (c: Company | null) => {
    // Update selected company in state + refresh list
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
          <Button onClick={() => setAddOpen(true)}>회사 추가</Button>
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
                  <div className="mt-1 text-xs text-muted-foreground">클릭하여 상세/출력을 확인하세요</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>회사 추가</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <label className="text-sm font-medium">회사명</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 삼성인테리어" />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={!canCreate}>추가</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
