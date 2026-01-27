"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/lib/app-store"
import { formatPhone } from "@/lib/format"
import {
  CheckCircle2,
  XCircle,
  Delete,
  CornerDownLeft,
  Phone,
  Building2,
  AlertTriangle,
  MapPin,
  Wifi,
  KeyRound,
  Clock,
  Shield,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type CheckinState = "input" | "verifying" | "success" | "error" | "validation_failed"
type VerificationMethod = "gps" | "wifi" | "pin"

// Office verification configuration (stubs for pluggable implementation)
const OFFICE_CONFIG = {
  orgName: "데슬라 인력사무소",
  gps: {
    enabled: true,
    latitude: 37.5665,
    longitude: 126.978,
    radiusMeters: 100,
  },
  wifi: {
    enabled: true,
    allowedSSIDs: ["DESLA_OFFICE", "DESLA_OFFICE_5G"],
  },
  pin: {
    enabled: true,
    code: "1234", // In production, this would be securely stored
  },
}

export default function AttendanceKioskPage() {
  const { state, updateWorker } = useAppStore()

  const [phoneNumber, setPhoneNumber] = useState("")
  const [checkinState, setCheckinState] = useState<CheckinState>("input")
  const [checkedInWorker, setCheckedInWorker] = useState<typeof state.workers[0] | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Verification state
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>("pin")
  const [pinInput, setPinInput] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  const currentDate = new Date()
  const formattedDate = currentDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  })
  const formattedTime = currentDate.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })

  const handleKeyPress = useCallback(
    (key: string) => {
      if (phoneNumber.length < 11) {
        setPhoneNumber((prev) => prev + key)
      }
    },
    [phoneNumber.length]
  )

  const handleDelete = useCallback(() => {
    setPhoneNumber((prev) => prev.slice(0, -1))
  }, [])

  const handleClear = useCallback(() => {
    setPhoneNumber("")
    setCheckinState("input")
    setCheckedInWorker(null)
    setValidationError(null)
  }, [])

  // Verification handlers (stubs - actual implementation would use browser APIs)
  const handleGPSVerification = async (): Promise<boolean> => {
    setIsVerifying(true)
    // Stub: In production, use navigator.geolocation
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsVerifying(false)
        // Simulate success for demo
        const success = Math.random() > 0.3 // 70% success rate for demo
        if (success) {
          setIsVerified(true)
          toast.success("GPS 위치 검증 완료")
        } else {
          setValidationError("사무실 범위 밖입니다. 사무실 내에서 다시 시도해주세요.")
        }
        resolve(success)
      }, 1500)
    })
  }

  const handleWiFiVerification = async (): Promise<boolean> => {
    setIsVerifying(true)
    // Stub: In production, would need native app or special browser APIs
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsVerifying(false)
        // Simulate - Wi-Fi detection not available in browsers
        setValidationError("Wi-Fi 검증은 앱에서만 가능합니다. PIN 또는 GPS를 사용해주세요.")
        resolve(false)
      }, 1000)
    })
  }

  const handlePINVerification = (): boolean => {
    if (pinInput === OFFICE_CONFIG.pin.code) {
      setIsVerified(true)
      toast.success("PIN 검증 완료")
      return true
    }
    setValidationError("PIN이 올바르지 않습니다.")
    setPinInput("")
    return false
  }

  const handleVerify = async () => {
    setValidationError(null)

    switch (verificationMethod) {
      case "gps":
        await handleGPSVerification()
        break
      case "wifi":
        await handleWiFiVerification()
        break
      case "pin":
        handlePINVerification()
        break
    }
  }

  const handleSubmit = useCallback(() => {
    if (phoneNumber.length < 10) return

    // Check verification first
    if (!isVerified) {
      setCheckinState("validation_failed")
      setValidationError("먼저 사무실 검증을 완료해주세요.")
      return
    }

    const cleanPhone = phoneNumber.replace(/\D/g, "")
    const worker = state.workers.find((w) => w.phone === cleanPhone)

    if (worker) {
      // Update worker status to 출근 (if currently 미출근)
      if (worker.status === "미출근") {
        updateWorker({
          ...worker,
          status: "출근",
          lastAttendance: new Date().toISOString().split("T")[0],
        })
        toast.success("출근 처리되었습니다")
      }
      setCheckedInWorker(worker)
      setCheckinState("success")
    } else {
      setCheckinState("error")
    }
  }, [phoneNumber, state.workers, updateWorker, isVerified])

  const numpadKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["clear", "0", "delete"],
  ]

  // Format phone for display
  const displayPhone =
    phoneNumber.length > 3
      ? phoneNumber.length > 7
        ? `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7)}`
        : `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3)}`
      : phoneNumber

  // Success screen
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
              <p className="text-2xl text-muted-foreground">{formatPhone(checkedInWorker.phone)}</p>
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

  // Error screen
  if (checkinState === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="flex flex-col items-center gap-6 p-12">
            <div className="rounded-full bg-destructive/10 p-6">
              <XCircle className="h-20 w-20 text-destructive" />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold">등록되지 않은 번호입니다</h1>
              <p className="text-xl text-muted-foreground">{displayPhone}</p>
            </div>
            <div className="rounded-lg bg-muted px-8 py-4">
              <p className="text-lg text-muted-foreground">사무소에 문의하세요</p>
            </div>
            <Button size="lg" onClick={handleClear} className="mt-4 h-14 px-8 text-lg">
              다시 입력
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Main input screen with office verification
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-8">
      {/* Header with org name and datetime */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{OFFICE_CONFIG.orgName}</h1>
        </div>
        <div className="flex items-center justify-center gap-4 text-muted-foreground">
          <span>{formattedDate}</span>
          <Badge variant="secondary" className="text-base font-mono">
            <Clock className="mr-1 h-4 w-4" />
            {formattedTime}
          </Badge>
        </div>
      </div>

      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
        {/* Office Verification Section */}
        <Card className={cn(isVerified && "border-status-progress")}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" />
              사무실 출근 검증
              {isVerified && (
                <Badge className="ml-auto bg-status-progress text-status-progress-foreground">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  검증완료
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isVerified ? (
              <div className="flex flex-col items-center py-8 text-center">
                <CheckCircle2 className="h-16 w-16 text-status-progress-foreground mb-4" />
                <p className="text-lg font-medium">사무실 검증이 완료되었습니다</p>
                <p className="text-sm text-muted-foreground mt-1">
                  이제 전화번호를 입력하여 출근 처리하세요
                </p>
              </div>
            ) : (
              <>
                <Tabs
                  value={verificationMethod}
                  onValueChange={(v) => {
                    setVerificationMethod(v as VerificationMethod)
                    setValidationError(null)
                  }}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pin" className="gap-1">
                      <KeyRound className="h-4 w-4" />
                      PIN
                    </TabsTrigger>
                    <TabsTrigger value="gps" className="gap-1">
                      <MapPin className="h-4 w-4" />
                      GPS
                    </TabsTrigger>
                    <TabsTrigger value="wifi" className="gap-1">
                      <Wifi className="h-4 w-4" />
                      Wi-Fi
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pin" className="space-y-4 pt-4">
                    <div>
                      <Label htmlFor="pin-input">관리자 PIN 입력</Label>
                      <Input
                        id="pin-input"
                        type="password"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        placeholder="PIN 코드 입력"
                        className="mt-2 text-center text-2xl tracking-widest"
                      />
                    </div>
                    <Button className="w-full" onClick={handleVerify} disabled={!pinInput}>
                      PIN 검증
                    </Button>
                  </TabsContent>

                  <TabsContent value="gps" className="space-y-4 pt-4">
                    <div className="rounded-lg bg-muted p-4 text-center">
                      <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        현재 위치가 사무실 반경 {OFFICE_CONFIG.gps.radiusMeters}m 이내인지 확인합니다
                      </p>
                    </div>
                    <Button className="w-full" onClick={handleVerify} disabled={isVerifying}>
                      {isVerifying ? "위치 확인 중..." : "GPS 검증"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="wifi" className="space-y-4 pt-4">
                    <div className="rounded-lg bg-muted p-4 text-center">
                      <Wifi className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        허용된 Wi-Fi 네트워크에 연결되어 있는지 확인합니다
                      </p>
                      <div className="mt-2 flex flex-wrap justify-center gap-2">
                        {OFFICE_CONFIG.wifi.allowedSSIDs.map((ssid) => (
                          <Badge key={ssid} variant="outline">
                            {ssid}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleVerify} disabled={isVerifying}>
                      {isVerifying ? "확인 중..." : "Wi-Fi 검증"}
                    </Button>
                  </TabsContent>
                </Tabs>

                {validationError && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>검증 실패</AlertTitle>
                    <AlertDescription>{validationError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Phone Input Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5" />
              출근 처리
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Phone Number Display */}
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

            {/* Numpad */}
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

            {/* Submit Button */}
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={phoneNumber.length < 10 || !isVerified}
              className="h-14 text-xl font-semibold"
            >
              <CornerDownLeft className="mr-2 h-6 w-6" />
              출근 처리
            </Button>

            {!isVerified && phoneNumber.length >= 10 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>먼저 왼쪽에서 사무실 검증을 완료해주세요.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
