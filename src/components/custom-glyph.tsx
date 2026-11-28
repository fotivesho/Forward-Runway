"use client";

import { createContext, useContext, useState } from "react";
import { CircleDot } from "lucide-react";
import { GlyphView, styleFor } from "./icon";

type Style = { icon?: string | null; color?: string | null };
type Ctx = { styles: Record<string, Style>; add: (name: string, s: Style) => void; hidden: string[] };
const CategoryStyles = createContext<Ctx>({ styles: {}, add: () => {}, hidden: [] });

/** Your own categories' symbols and colors, for every icon on the page (and ones made just now). */
export function CategoryStylesProvider({ styles, hidden = [], children }: { styles: Record<string, Style>; hidden?: string[]; children: React.ReactNode }) {
  const [extra, setExtra] = useState<Record<string, Style>>({});
  return (
    <CategoryStyles.Provider value={{ styles: { ...styles, ...extra }, add: (name, s) => setExtra((e) => ({ ...e, [name]: s })), hidden }}>
      {children}
    </CategoryStyles.Provider>
  );
}

export const useCategoryStyles = () => useContext(CategoryStyles);

export function CustomGlyph({ name, size, bare, className }: { name: string; size?: "xs" | "sm" | "md" | "lg"; bare?: boolean; className?: string }) {
  const { styles } = useContext(CategoryStyles);
  return <GlyphView style={styleFor(name, styles[name]) ?? [CircleDot, "#9aa7b4"]} size={size} bare={bare} className={className} />;
}
