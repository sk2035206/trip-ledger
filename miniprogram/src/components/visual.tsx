import { View, Text, Button, Input } from "@tarojs/components";
import { formatMoney } from "@ledger/trip-utils";

export type IconName =
  | "home"
  | "trip"
  | "people"
  | "category"
  | "plus"
  | "chevron"
  | "more"
  | "search"
  | "share"
  | "close"
  | "check"
  | "receipt"
  | "calendar"
  | "refresh"
  | "import";
export function Icon({ name }: { name: IconName }) {
  const glyphs: Partial<Record<IconName, string>> = {
    plus: "+",
    chevron: "›",
    more: "···",
    share: "↗",
    close: "×",
    check: "✓",
    refresh: "↻",
    import: "↓",
  };
  return (
    <View className={`icon icon-${name}`} ariaHidden>
      {glyphs[name] ? (
        <Text>{glyphs[name]}</Text>
      ) : (
        <>
          <View />
          <View />
          <View />
          <View />
        </>
      )}
    </View>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <View
      className={`avatar tone-${(name.codePointAt(0) ?? 0) % 4} ${small ? "avatar-small" : ""}`}
    >
      <Text>{name.slice(0, 1)}</Text>
    </View>
  );
}
export function MoreButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      className="more-button"
      ariaLabel={label}
      hoverClass="tap-soft"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Icon name="more" />
    </Button>
  );
}
export function SectionHeader({
  title,
  note,
  action,
  onAction,
}: {
  title: string;
  note?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="section-head">
      <View className="section-heading">
        <Text className="section-title">{title}</Text>
        {note && <Text className="section-note">{note}</Text>}
      </View>
      {action && (
        <Button className="text-button" onClick={onAction}>
          {action}
          <Icon name="chevron" />
        </Button>
      )}
    </View>
  );
}
export const mainTabs = ["工作台", "出行管理", "人员管理", "类别管理"];
const navIcons: IconName[] = ["home", "trip", "people", "category"];
export function BottomNav({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="bottom-nav">
      {mainTabs.map((tab, index) => (
        <Button
          key={tab}
          className={`nav-item ${value === tab ? "active" : ""}`}
          hoverClass="tap-soft"
          onClick={() => onChange(tab)}
        >
          <View className="nav-icon">
            <Icon name={navIcons[index]} />
          </View>
          <Text>{["工作台", "出行", "人员", "类别"][index]}</Text>
        </Button>
      ))}
    </View>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View className="search-box">
      <Icon name="search" />
      <Input
        value={value}
        placeholder={placeholder}
        placeholderClass="input-placeholder"
        onInput={(event) => onChange(event.detail.value)}
        confirmType="search"
      />
      <Button
        className={`search-clear ${value ? "" : "invisible"}`}
        ariaLabel="清空搜索"
        onClick={() => onChange("")}
      >
        <Icon name="close" />
      </Button>
    </View>
  );
}
export function AmountSummary({
  total,
  shared,
  travel,
  personal,
  label = "累计旅行费用",
  dark = false,
}: {
  total: number;
  shared: number;
  travel: number;
  personal: number;
  label?: string;
  dark?: boolean;
}) {
  const [whole, decimal] = formatMoney(total).split(".");
  return (
    <View className={`amount-summary ${dark ? "amount-dark" : ""}`}>
      <View className="summary-orbit" />
      <View className="summary-top">
        <Text className="summary-label">{label}</Text>
        <Icon name="trip" />
      </View>
      <View className="summary-amount">
        <Text className="currency">¥</Text>
        <Text>{whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</Text>
        {decimal && <Text className="decimal">.{decimal}</Text>}
      </View>
      <View className="summary-breakdown">
        {[
          { label: "公共费用", amount: shared },
          { label: "出行费用", amount: travel },
          { label: "个人费用", amount: personal },
        ].map((item, index) => (
          <View key={item.label}>
            <View className="summary-type">
              <View className={`color-dot color-${index}`} />
              <Text>{item.label}</Text>
            </View>
            <Text className="summary-value">{formatMoney(item.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
export function CategoryBars({
  items,
}: {
  items: { label: string; amount: number }[];
}) {
  const max = Math.max(...items.map((item) => item.amount), 1);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <View className="category-bars">
      {[...items]
        .sort((a, b) => b.amount - a.amount)
        .map((item, index) => (
          <View className="category-bar" key={item.label}>
            <View className="row between">
              <View className="row">
                <View className={`color-dot color-${index % 4}`} />
                <Text>{item.label}</Text>
              </View>
              <View className="row">
                <Text className="money">¥{formatMoney(item.amount)}</Text>
                <Text className="bar-percent">
                  {total ? Math.round((item.amount / total) * 100) : 0}%
                </Text>
              </View>
            </View>
            <View className="bar-track">
              <View
                className={`bar-fill color-${index % 4}`}
                style={{ width: `${Math.max(2, (item.amount / max) * 100)}%` }}
              />
            </View>
          </View>
        ))}
    </View>
  );
}
