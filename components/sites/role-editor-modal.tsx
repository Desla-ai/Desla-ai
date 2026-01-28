"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Worker, Role, defaultRoles } from "@/lib/mock-data"
import { useAppStore } from "@/lib/app-store"
import { Plus, X, Check } from "lucide-react"

interface RoleEditorModalProps {
  worker: Worker | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (workerId: string, roles: Role[]) => void
}

const colorPalette = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#a855f7", "#f43f5e", "#0ea5e9", "#22c55e",
]

export function RoleEditorModal({ worker, open, onOpenChange, onSave }: RoleEditorModalProps) {
  const { addRole } = useAppStore()

  const [selectedRoles, setSelectedRoles] = useState<Role[]>(worker?.roles || [])
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isCreatingRole, setIsCreatingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(colorPalette[0])
  const [customColor, setCustomColor] = useState("")

  const handleToggleRole = (role: Role) => {
    setSelectedRoles((prev) => {
      const exists = prev.find((r) => r.id === role.id)
      if (exists) {
        return prev.filter((r) => r.id !== role.id)
      }
      return [...prev, role]
    })
  }

  const handleAddNewRole = async () => {
    if (!newRoleName.trim()) return
    if (isCreatingRole) return
    setIsCreatingRole(true)
    try {
      const createdRole = await addRole({
        name: newRoleName.trim(),
        color: (customColor || newRoleColor).trim(),
      })
      setSelectedRoles((prev) => [...prev, createdRole])
      setNewRoleName("")
      setIsAddingNew(false)
      setCustomColor("")
    } finally {
      setIsCreatingRole(false)
    }
  }



  const handleSave = () => {
    if (worker) {
      onSave(worker.id, selectedRoles)
    }
    onOpenChange(false)
  }

  // Reset state when worker changes
  if (worker && selectedRoles !== worker.roles && !open) {
    setSelectedRoles(worker.roles)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>역할 편집 - {worker?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {/* Selected Roles */}
          <div>
            <Label className="mb-2 block text-sm">선택된 역할</Label>
            <div className="flex flex-wrap gap-2">
              {selectedRoles.length === 0 ? (
                <span className="text-sm text-muted-foreground">선택된 역할이 없습니다</span>
              ) : (
                selectedRoles.map((role) => (
                  <Badge
                    key={role.id}
                    style={{ backgroundColor: role.color, color: "#fff" }}
                    className="flex items-center gap-1 pr-1"
                  >
                    {role.name}
                    <button
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className="ml-1 rounded-full hover:bg-white/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          {/* Available Roles */}
          <div>
            <Label className="mb-2 block text-sm">사용 가능한 역할</Label>
            <div className="flex flex-wrap gap-2">
              {defaultRoles.map((role) => {
                const isSelected = selectedRoles.some((r) => r.id === role.id)
                return (
                  <Badge
                    key={role.id}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer"
                    style={isSelected ? { backgroundColor: role.color, color: "#fff" } : {}}
                    onClick={() => handleToggleRole(role)}
                  >
                    {isSelected && <Check className="mr-1 h-3 w-3" />}
                    {role.name}
                  </Badge>
                )
              })}
            </div>
          </div>

          {/* Add New Role */}
          {isAddingNew ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <Label className="text-sm">새 역할 추가</Label>
              <Input
                placeholder="역할 이름"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
              <div>
                <Label className="mb-2 block text-sm">색상 선택</Label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {colorPalette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="h-6 w-6 rounded-full ring-offset-2 transition-all hover:scale-110"
                      style={{
                        backgroundColor: color,
                        boxShadow: newRoleColor === color ? "0 0 0 2px currentColor" : undefined,
                      }}
                      onClick={() => {
                        setNewRoleColor(color)
                        setCustomColor("")
                      }}
                    >
                      {newRoleColor === color && !customColor && (
                        <Check className="mx-auto h-3 w-3 text-white" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={customColor || newRoleColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="h-8 w-12 cursor-pointer p-0"
                  />
                  <span className="text-xs text-muted-foreground">또는 직접 선택</span>
                </div>
              </div>
              {/* Preview */}
              {newRoleName && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">미리보기:</span>
                  <Badge style={{ backgroundColor: customColor || newRoleColor, color: "#fff" }}>
                    {newRoleName}
                  </Badge>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddNewRole} disabled={!newRoleName.trim()}>
                  추가
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsAddingNew(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setIsAddingNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              새 역할 추가
            </Button>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
