import type { PropsWithChildren, ReactNode } from "react";
import {
  View,
  Text,
  Button,
  Input,
  Textarea,
  Picker,
  ScrollView,
} from "@tarojs/components";
import { Icon } from "./visual";
import {
  confirmAction,
  copyDraft,
  refreshLedger,
  retrySave,
  useLedger,
} from "../lib/store";

export function Panel({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <View className="panel">
      <View className="panel-heading">
        <Text className="panel-title">{title}</Text>
        {subtitle && <Text className="panel-subtitle">{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}
export function Empty({ text = "暂无记录" }: { text?: string }) {
  return (
    <View className="empty">
      <View className="empty-illustration">
        <Icon name="receipt" />
      </View>
      <Text>{text}</Text>
    </View>
  );
}
export function Action({
  children,
  onClick,
  disabled,
  danger,
  secondary,
}: PropsWithChildren<{
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
}>) {
  return (
    <Button
      hoverClass="tap-soft"
      className={`action ${danger ? "danger" : secondary ? "secondary" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder = "",
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View className="field">
      <Text className="label">{label}</Text>
      {multiline ? (
        <Textarea
          className="textarea"
          value={value}
          placeholder={placeholder}
          maxlength={20000}
          onInput={(e) => onChange(e.detail.value)}
        />
      ) : (
        <View className={numeric ? "amount-input-wrap" : "input-wrap"}>
          {numeric && <Text className="amount-currency">¥</Text>}
          <Input
            className={numeric ? "input amount-input" : "input"}
            type={numeric ? "digit" : "text"}
            value={value}
            placeholder={numeric ? "0.00" : placeholder}
            placeholderClass="input-placeholder"
            cursorSpacing={32}
            confirmType="done"
            maxlength={numeric ? 14 : 300}
            onInput={(e) => onChange(e.detail.value)}
          />
        </View>
      )}
    </View>
  );
}
export function Select({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="field">
      <Text className="label">{label}</Text>
      <Picker
        mode="selector"
        range={values.map((v) => v.name)}
        value={Math.max(
          0,
          values.findIndex((v) => v.id === value),
        )}
        onChange={(e) => onChange(values[Number(e.detail.value)]?.id ?? "")}
      >
        <View className="input select">
          {values.find((v) => v.id === value)?.name ?? "请选择"} ▾
        </View>
      </Picker>
    </View>
  );
}
export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="field">
      <Text className="label">{label}</Text>
      <View className="row">
        <Picker
          mode="date"
          value={value}
          onChange={(e) => onChange(e.detail.value)}
        >
          <View className="input select">{value || "选择日期"} ▾</View>
        </Picker>
        {value && (
          <Action secondary onClick={() => onChange("")}>
            清除
          </Action>
        )}
      </View>
    </View>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  footer,
  compact = false,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  compact?: boolean;
}>) {
  return (
    <View className="sheet-mask" catchMove onClick={onClose}>
      <View
        className={`sheet ${compact ? "sheet-compact" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <View className="sheet-handle" />
        <View className="sheet-head">
          <Text className="panel-title">{title}</Text>
          <Button className="close" ariaLabel="关闭弹层" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </View>
        <ScrollView scrollY className="sheet-body" showScrollbar={false}>
          {children}
        </ScrollView>
        {footer && <View className="sheet-foot">{footer}</View>}
      </View>
    </View>
  );
}
export function SyncStatus() {
  const ledger = useLedger();
  return (
    <View className={`sync ${ledger.error ? "sync-warning" : ""}`}>
      <View className="header-row">
        <View className="sync-label header-main">
          <View
            className={`status-dot ${ledger.loading || ledger.saving ? "is-loading" : ""}`}
          />
          <Text>
            {ledger.loading
              ? "正在读取账本"
              : ledger.saving
                ? "正在保存"
                : ledger.error
                  ? ledger.dirty
                    ? "有修改尚未保存"
                    : "暂时无法连接账本"
                  : ledger.state
                    ? "云端数据已同步"
                    : "等待连接账本"}
          </Text>
        </View>
        <View className="header-actions">
          <Button
            className="sync-refresh"
            ariaLabel="刷新账本"
            disabled={ledger.saving || ledger.loading}
            onClick={() => void refreshLedger()}
          >
            <Icon name="refresh" />
          </Button>
        </View>
      </View>
      {ledger.error && (
        <View>
          <Text className="error">{ledger.error}</Text>
          <View className="actions">
            {ledger.dirty && !ledger.conflict && (
              <Action onClick={() => void retrySave()}>重试保存</Action>
            )}
            {ledger.dirty && (
              <Action secondary onClick={copyDraft}>
                复制草稿
              </Action>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
export function Chips({
  options,
  value,
  onChange,
  variant = "filter",
}: {
  options: string[];
  variant?: "filter" | "tabs";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView scrollX className="chips-scroll" showScrollbar={false}>
      <View
        className="chips"
        ariaRole={variant === "tabs" ? "tablist" : undefined}
      >
        {options.map((option) => (
          <Button
            key={option}
            className={`chip ${value === option ? "selected" : ""}`}
            hoverClass="none"
            ariaRole={variant === "tabs" ? "tab" : undefined}
            ariaSelected={value === option}
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}
export function MemberChoices({
  members,
  ids,
  onChange,
}: {
  members: { id: string; name: string }[];
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <View className="field">
      <View className="header-row member-choice-head">
        <Text className="label header-main">
          参与分摊人员 · {ids.length} 人
        </Text>
        <View className="header-actions">
          <Button
            className="text-button"
            onClick={() =>
              onChange(
                ids.length === members.length ? [] : members.map((m) => m.id),
              )
            }
          >
            {ids.length === members.length ? "清空" : "全选"}
          </Button>
        </View>
      </View>
      <View className="choices member-grid">
        {members.map((m) => (
          <Button
            key={m.id}
            className={`member-option ${ids.includes(m.id) ? "selected" : ""}`}
            ariaLabel={m.name}
            ariaSelected={ids.includes(m.id)}
            onClick={() =>
              onChange(
                ids.includes(m.id)
                  ? ids.filter((id) => id !== m.id)
                  : [...ids, m.id],
              )
            }
          >
            <View className="choice-check">
              {ids.includes(m.id) && <Icon name="check" />}
            </View>
            <Text className="member-choice-label">{m.name}</Text>
          </Button>
        ))}
      </View>
      {!members.length && (
        <Text className="muted">请先在人员标签中添加本次人员</Text>
      )}
    </View>
  );
}

export async function closeForm(
  dirty: boolean,
  busy: boolean,
  onClose: () => void,
) {
  if (busy) return;
  if (
    !dirty ||
    (await confirmAction("当前填写的内容尚未保存，确定放弃并关闭？"))
  )
    onClose();
}
