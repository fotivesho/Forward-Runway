/** An emoji per spending category, used across Spend and the calendar. */
export const CATEGORY_ICON: Record<string, string> = {
  Dining: "🍽️",
  Groceries: "🛒",
  Coffee: "☕",
  Shopping: "🛍️",
  Transport: "🚌",
  Entertainment: "🎟️",
  Gifts: "🎁",
  "Personal care": "💇",
  Health: "💊",
  Travel: "✈️",
  Celebrations: "🎉",
  Home: "🏠",
  Car: "🚗",
  Housing: "🏠",
  Utilities: "⚡",
  Subscriptions: "🔁",
  Fitness: "🏋️",
  Debt: "🏦",
  Savings: "🐷",
  Salary: "💰",
  Income: "💰",
  "Card payment": "💳",
  Transfer: "↔️",
  Fees: "🏦",
  Services: "🧰",
};
/**
 * Money that moves between your own accounts (a card payment, a transfer to savings) is never
 * spending: the purchases it pays for already counted, once, when you made them.
 */
export const NOT_SPENDING = new Set(["Card payment", "Transfer"]);
export const isNotSpending = (category?: string | null) => !!category && NOT_SPENDING.has(category);

/** Money in with one of these (or no category) is income; money in under a spending category is a refund. */
export const INCOME_CATEGORIES = new Set(["Income", "Salary", "Interest", "Other"]);
export const isRefund = (t: { direction: "in" | "out"; category?: string | null }) =>
  t.direction === "in" && !!t.category && !INCOME_CATEGORIES.has(t.category) && !NOT_SPENDING.has(t.category);

export const iconFor = (category?: string | null) => (category && CATEGORY_ICON[category]) || "•";

/** Everyday spending first, then bills, then money that isn't spending. */
export const CATEGORY_LIST = [
  "Dining", "Groceries", "Coffee", "Shopping", "Transport", "Entertainment", "Personal care", "Health", "Travel", "Gifts", "Celebrations", "Home", "Car",
  "Housing", "Utilities", "Subscriptions", "Insurance", "Debt", "Fees", "Services", "Savings",
  "Income", "Card payment", "Transfer", "Other",
];
