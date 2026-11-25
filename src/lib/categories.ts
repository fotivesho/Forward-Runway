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
};
export const iconFor = (category?: string | null) => (category && CATEGORY_ICON[category]) || "•";
