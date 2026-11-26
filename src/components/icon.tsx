import {
  ArrowLeftRight, Banknote, Bus, CalendarDays, CalendarRange, Car, ChartLine, CircleDot, Coffee, CreditCard, Dumbbell, Flag, Gift, Hammer, HeartPulse,
  Hourglass, House, Landmark, Laptop, LifeBuoy, Lock, PartyPopper, PiggyBank, Plane, Receipt, Repeat, Salad, Scissors, Settings, Shield, ShoppingBag,
  ShoppingCart, Smartphone, Sparkles, Tag, Target, Tent, Ticket, TrendingUp, TriangleAlert, Triangle, UtensilsCrossed, Wallet, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

/** Icon + color for a category, a kind of thing, or one of the emoji the app used to show. */
const MAP: Record<string, [LucideIcon, string]> = {
  // Categories
  Dining: [UtensilsCrossed, "#f59e6b"],
  Groceries: [ShoppingCart, "#7dd3a0"],
  Coffee: [Coffee, "#d4a373"],
  Shopping: [ShoppingBag, "#f28bb5"],
  Transport: [Bus, "#6cb8f0"],
  Entertainment: [Ticket, "#b49cf7"],
  Gifts: [Gift, "#f37a8c"],
  "Personal care": [Scissors, "#e58ce6"],
  Health: [HeartPulse, "#f87171"],
  Travel: [Plane, "#5fb8e8"],
  Celebrations: [PartyPopper, "#f5c94f"],
  Home: [House, "#5ec8b8"],
  Housing: [House, "#5ec8b8"],
  Car: [Car, "#8fa8c8"],
  Utilities: [Zap, "#f5c94f"],
  Subscriptions: [Repeat, "#8f9cf7"],
  Insurance: [Shield, "#8fa8c8"],
  Fitness: [Dumbbell, "#a3d977"],
  Debt: [Landmark, "#c49a8a"],
  Savings: [PiggyBank, "#e9c46a"],
  Salary: [Banknote, "#7ad3a0"],
  Income: [Banknote, "#7ad3a0"],
  "Card payment": [CreditCard, "#9aa7b4"],
  Transfer: [ArrowLeftRight, "#9aa7b4"],
  Fees: [Receipt, "#c49a8a"],
  Services: [Wrench, "#8fa8c8"],
  // Kinds
  plan: [CalendarDays, "#6cb8f0"],
  income: [Banknote, "#7ad3a0"],
  spend: [Receipt, "#f59e6b"],
  bill: [Receipt, "#f59e6b"],
  save: [LifeBuoy, "#e9c46a"],
  bank: [Landmark, "#7ad3a0"],
  card: [CreditCard, "#e9c46a"],
  cash: [Wallet, "#7ad3a0"],
  lock: [Lock, "#e9c46a"],
  goal: [Target, "#f37a8c"],
  // The emoji they replace
  "💰": [Banknote, "#7ad3a0"],
  "💵": [Wallet, "#7ad3a0"],
  "🏦": [Landmark, "#7ad3a0"],
  "💳": [CreditCard, "#e9c46a"],
  "🔁": [Repeat, "#8f9cf7"],
  "🎯": [Target, "#f37a8c"],
  "🛟": [LifeBuoy, "#e9c46a"],
  "🔒": [Lock, "#e9c46a"],
  "📅": [CalendarDays, "#6cb8f0"],
  "🎟️": [Ticket, "#b49cf7"],
  "⚠": [TriangleAlert, "#f5c94f"],
  "↔️": [ArrowLeftRight, "#9aa7b4"],
  "🧾": [Receipt, "#f59e6b"],
  "⚙": [Settings, "#9aa7b4"],
  "🍽️": [UtensilsCrossed, "#f59e6b"],
  "🏕️": [Tent, "#7dd3a0"],
  "💻": [Laptop, "#8f9cf7"],
  "🐷": [PiggyBank, "#e9c46a"],
  "🏠": [House, "#5ec8b8"],
  "🧰": [Hammer, "#8fa8c8"],
  "🏁": [Flag, "#7ad3a0"],
  "✂️": [Scissors, "#6cb8f0"],
  "🥗": [Salad, "#7dd3a0"],
  "🏷️": [Tag, "#9aa7b4"],
  "📱": [Smartphone, "#8f9cf7"],
  "🔧": [Wrench, "#8fa8c8"],
  "🛒": [ShoppingCart, "#7dd3a0"],
  "☕": [Coffee, "#d4a373"],
  "🛍️": [ShoppingBag, "#f28bb5"],
  "🚌": [Bus, "#6cb8f0"],
  "🎁": [Gift, "#f37a8c"],
  "💇": [Scissors, "#e58ce6"],
  "💊": [HeartPulse, "#f87171"],
  "✈️": [Plane, "#5fb8e8"],
  "🎉": [PartyPopper, "#f5c94f"],
  "🚗": [Car, "#8fa8c8"],
  "⚡": [Zap, "#f5c94f"],
  "🏋️": [Dumbbell, "#a3d977"],
  "💸": [Sparkles, "#f5c94f"],
  "📆": [CalendarRange, "#6cb8f0"],
  "📈": [TrendingUp, "#f59e6b"],
  "🔺": [Triangle, "#f87171"],
  "⏳": [Hourglass, "#7dd3a0"],
  "📊": [ChartLine, "#6cb8f0"],
};

const SIZE = { xs: ["h-5 w-5 rounded-md", 12], sm: ["h-7 w-7 rounded-lg", 15], md: ["h-9 w-9 rounded-xl", 18], lg: ["h-11 w-11 rounded-2xl", 22] } as const;

/** A tinted rounded square with a line icon: pops without looking like phone emoji. */
export function Glyph({ name, size = "sm", bare = false, className = "" }: { name: string | null | undefined; size?: keyof typeof SIZE; bare?: boolean; className?: string }) {
  const [Icon, color] = MAP[name ?? ""] ?? MAP[(name ?? "").replace(/️/g, "")] ?? MAP[`${name}️`] ?? [CircleDot, "#9aa7b4"];
  const [box, px] = SIZE[size];
  if (bare) return <Icon aria-hidden size={px} color={color} strokeWidth={2.2} className={`inline-block shrink-0 align-[-2px] ${className}`} />;
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center align-middle ${box} ${className}`} style={{ background: `${color}26`, color }}>
      <Icon size={px} strokeWidth={2.2} />
    </span>
  );
}

/** Renders a string icon (emoji or name) as a Glyph; anything else as is. */
export function asGlyph(icon: React.ReactNode, size: keyof typeof SIZE = "sm") {
  return typeof icon === "string" ? <Glyph name={icon} size={size} /> : icon;
}
