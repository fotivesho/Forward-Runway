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

export const iconFor = (category?: string | null) => (category && CATEGORY_ICON[category]) || "•";
