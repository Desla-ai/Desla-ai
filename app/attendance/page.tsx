"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

import { formatPhone } from "@/lib/format"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import {
  CheckCircle2,
  XCircle,
  Delete,
  CornerDownLeft,
  Phone,
  Building2,
  AlertTriangle,
  Clock,
  Loader2,
  UserX,
  Users,
} from "lucide-react"

type CheckinState =
  | "input"
  | "success"
  | "not_found"
  | "already_assigned"
  | "already_checked_in"
  | "error"

type KioskConfig = {
  officeId: string
  orgName: string
  officePhone?: string | null
}

type KioskCheckinResult =
  | { ok: true; worker: { id: string; name: string; phone: string | null } }
  | { ok: false; error: string }

const FALLBACK_CONFIG: KioskConfig = {
  officeId: "",
  orgName: "출근 키오스크",
  officePhone: null,
}

function getOfficeHelpText(officePhone?: string | null) {
  return officePhone ? `사무소 문의: ${officePhone}` : "사무소에 문의하세요"
}

export default function AttendanceKioskPage() {
  const searchParams = useSearchParams()
  const officeId = searchParams.get("officeId") ?? ""

  const [config, setConfig] = useState<KioskConfig>(FALLBACK_CONFIG)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const [phoneNumber, setPhoneNumber] = useState("")
  const [checkinState, setCheckinState] = useState<CheckinState>("input")
  const [checkedInWorker, setCheckedInWorker] = useState<{ name: string; phone: string | null } | null>(null)

  const [submitting, setSubmitting] = useState(false)

  const now = new Date()
  const formattedDate = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
  const formattedTime = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })

  useEffect(() => {
    let ignore = false

    const load = async () => {
      setConfigError(null)

      if (!officeId) {
        setConfig(FALLBACK_CONFIG)
        setConfigError("키오스크 링크에 officeId가 없습니다.")
        return
      }

      setLoadingConfig(true)
      try {
        const res = await fetch(`/api/kiosk/config?officeId=${encodeURIComponent(officeId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        })
        if (!res.ok) throw new Error(await res.text().catch(() => ""))

        const data = (await res.json()) as { ok: boolean; config: KioskConfig }
        if (!data?.ok || !data?.config) throw new Error("Invalid response")

        if (!ignore) setConfig(data.config)
      } catch (e) {
        console.error(e)
        if (!ignore) {
          setConfig(FALLBACK_CONFIG)
          setConfigError("사무실 정보를 불러오지 못했습니다. 링크를 다시 확인해주세요.")
        }
      } finally {
        if (!ignore) setLoadingConfig(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [officeId])

  const cleanPhone = useMemo(() => phoneNumber.replace(/\D/g, ""), [phoneNumber])

  const displayPhone =
    phoneNumber.length > 3
      ? phoneNumber.length > 7
        ? `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7)}`
        : `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`
      : phoneNumber

  const numpadKeys = useMemo(
    () => [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
      ["clear", "0", "delete"],
    ],
    []
  )

  const resetToInput = useCallback(() => {
    setPhoneNumber("")
    setCheckinState("input")
    setCheckedInWorker(null)
  }, [])

  const handleKeyPress = useCallback(
    (key: string) => {
      if (phoneNumber.length < 11) setPhoneNumber((prev) => prev + key)
    },
    [phoneNumber.length]
  )

  const handleDelete = useCallback(() => {
    setPhoneNumber((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    resetToInput()
  }, [resetToInput])

  const handleSubmit = useCallback(async () => {
    if (cleanPhone.length < 10) return

    if (!officeId) {
      toast.error("키오스크 링크(officeId)가 없습니다.")
      return
    }
    if (configError) {
      toast.error(configError)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/kiosk/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ officeId, phone: cleanPhone }),
      })

      // 안전하게: 텍스트로 먼저 받고 JSON 파싱
      const raw = await res.text()
      let data: KioskCheckinResult | null = null
      try {
        data = raw ? (JSON.parse(raw) as KioskCheckinResult) : null
      } catch {
        data = null
      }

      // 실패 분기(여기서 state를 정확히 세팅)
      if (!res.ok) {
        const code = (data as any)?.error

        if (code === "WORKER_NOT_FOUND") {
          setCheckinState("not_found")
          return
        }
        if (code === "WORKER_ALREADY_ASSIGNED") {
          setCheckinState("already_assigned")
          return
        }
        if (code === "WORKER_ALREADY_CHECKED_IN") {
          setCheckinState("already_checked_in")
          return
        }

        console.error("[kiosk/checkin] failed", { status: res.status, raw, data })
        setCheckinState("error")
        toast.error(`출근 처리 실패 (${res.status})`)
        return
      }

      // 성공
      if (!data || (data as any).ok !== true || !(data as any).worker) {
        console.error("[kiosk/checkin] invalid response", { raw, data })
        toast.error("서버 응답 형식이 올바르지 않습니다.")
        setCheckinState("error")
        return
      }

      const worker = (data as any).worker as { id: string; name: string; phone: string | null }
      setCheckedInWorker({ name: worker.name, phone: worker.phone })
      setCheckinState("success")
      toast.success("출근 처리되었습니다")
    } catch (e) {
      console.error("[kiosk/checkin] exception", e)
      setCheckinState("error")
      toast.error("출근 처리 중 네트워크/서버 오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
    }
  }, [cleanPhone, officeId, configError])

  // ====== 결과 화면들 ======

  if (checkinState === "success" && checkedInWorker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-status-progress p-6">
              <CheckCircle2 className="h-20 w-20 text-status-progress-foreground" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-bold">{checkedInWorker.name}</h1>
              {checkedInWorker.phone ? (
                <p className="text-2xl text-muted-foreground">{formatPhone(checkedInWorker.phone)}</p>
              ) : null}
            </div>

            <div className="rounded-lg bg-status-progress/20 px-8 py-4">
              <p className="text-3xl font-semibold text-status-progress-foreground">출근 완료</p>
            </div>

            <p className="text-lg text-muted-foreground">
              {new Date().toLocaleString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            <Button
              size="lg"
              variant="outline"
              onClick={handleClear}
              className="mt-4 h-14 px-8 text-lg bg-transparent"
            >
              확인
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (checkinState === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-destructive/10 p-6">
              <UserX className="h-20 w-20 text-destructive" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">등록되지 않은 번호입니다</h1>
              <p className="text-xl text-muted-foreground">{displayPhone}</p>
            </div>

            <div className="rounded-lg bg-muted px-8 py-4">
              <p className="text-lg text-muted-foreground">{getOfficeHelpText(config.officePhone)}</p>
            </div>

            <Button size="lg" onClick={resetToInput} className="mt-4 h-14 px-8 text-lg">
              다시 입력
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (checkinState === "already_assigned") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-amber-500/10 p-6">
              <Users className="h-20 w-20 text-amber-600" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">이미 배치된 인원입니다</h1>
              <p className="text-xl text-muted-foreground">{displayPhone}</p>
            </div>

            <div className="rounded-lg bg-muted px-8 py-4">
              <p className="text-lg text-muted-foreground">
                이미 배치된 인원은 키오스크 출근이 불가합니다. {getOfficeHelpText(config.officePhone)}
              </p>
            </div>

            <Button size="lg" onClick={resetToInput} className="mt-4 h-14 px-8 text-lg">
              다시 입력
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (checkinState === "already_checked_in") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-amber-500/10 p-6">
              <XCircle className="h-20 w-20 text-amber-600" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">이미 출근 처리된 번호입니다</h1>
              <p className="text-xl text-muted-foreground">{displayPhone}</p>
            </div>

            <div className="rounded-lg bg-muted px-8 py-4">
              <p className="text-lg text-muted-foreground">
                오늘 이미 출근 처리되었습니다. 문제가 있으면 {getOfficeHelpText(config.officePhone)}
              </p>
            </div>

            <Button size="lg" onClick={resetToInput} className="mt-4 h-14 px-8 text-lg">
              다시 입력
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (checkinState === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-destructive/10 p-6">
              <XCircle className="h-20 w-20 text-destructive" />
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">출근 처리에 실패했습니다</h1>
              <p className="text-xl text-muted-foreground">{displayPhone}</p>
            </div>

            <div className="rounded-lg bg-muted px-8 py-4">
              <p className="text-lg text-muted-foreground">{getOfficeHelpText(config.officePhone)}</p>
            </div>

            <Button size="lg" onClick={resetToInput} className="mt-4 h-14 px-8 text-lg">
              다시 입력
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ====== 입력 화면 ======

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-8">
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{config.orgName}</h1>
        </div>

        <div className="flex items-center justify-center gap-4 text-muted-foreground">
          <span>{formattedDate}</span>
          <Badge variant="secondary" className="text-base font-mono">
            <Clock className="mr-1 h-4 w-4" />
            {formattedTime}
          </Badge>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          {loadingConfig && (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              사무실 정보 불러오는 중...
            </span>
          )}
          {!loadingConfig && configError && <span className="text-destructive">{configError}</span>}
          {!loadingConfig && !configError && officeId && <span className="text-muted-foreground">Office: {officeId}</span>}
        </div>

        {!officeId && (
          <Alert className="mt-4 max-w-xl text-left">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>키오스크 링크가 필요합니다</AlertTitle>
            <AlertDescription>
              <code className="px-1 py-0.5 bg-muted rounded">/attendance?officeId=...</code> 형태로 접속해야 합니다.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="w-full max-w-xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5" />
              출근 처리
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border-2 border-border bg-muted/30 p-4 text-center">
              <p
                className={cn(
                  "font-mono text-3xl font-bold tracking-wider transition-opacity",
                  phoneNumber ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {displayPhone || "010-0000-0000"}
              </p>
            </div>

            <div className="grid gap-2">
              {numpadKeys.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-3 gap-2">
                  {row.map((key) => {
                    if (key === "clear") {
                      return (
                        <Button
                          key={key}
                          variant="outline"
                          size="lg"
                          onClick={handleClear}
                          className="h-14 text-lg bg-transparent"
                        >
                          C
                        </Button>
                      )
                    }
                    if (key === "delete") {
                      return (
                        <Button
                          key={key}
                          variant="outline"
                          size="lg"
                          onClick={handleDelete}
                          className="h-14 text-lg bg-transparent"
                        >
                          <Delete className="h-5 w-5" />
                        </Button>
                      )
                    }
                    return (
                      <Button
                        key={key}
                        variant="secondary"
                        size="lg"
                        onClick={() => handleKeyPress(key)}
                        className="h-14 text-xl font-semibold"
                      >
                        {key}
                      </Button>
                    )
                  })}
                </div>
              ))}
            </div>

            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={cleanPhone.length < 10 || !officeId || !!configError || loadingConfig || submitting}
              className="h-14 text-xl font-semibold"
            >
              <CornerDownLeft className="mr-2 h-6 w-6" />
              {submitting ? "처리 중..." : "출근 처리"}
            </Button>

            <div className="text-xs text-muted-foreground">
              문제 발생 시 {getOfficeHelpText(config.officePhone)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
