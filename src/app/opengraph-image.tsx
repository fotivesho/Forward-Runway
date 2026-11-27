import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Runway Tomorrow. Budgets look back. Runway looks ahead.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Drawn once at build time.
export const dynamic = "force-static";

const font = (f: string) => readFile(join(process.cwd(), "src/app/_og", f));

const CREAM = "#f6efdc";
const PALE = "#ddefbf";
const INK = "#1f4531";

/** Plans on the little card: what it costs, and the verdict. */
const PLANS: Array<[string, string, string, string]> = [
  ["Dinner with Sam", "Fri", "~$70", "Fits"],
  ["Flights to Mia's wedding", "Dec 6", "~$640", "With a change"],
  ["Weekend at the lake", "Dec 9", "~$350", "Fits"],
];

/**
 * The picture people see when the link is shared: the promise in big serif type, and a slice of
 * the app floating beside it (safe to spend today, the line ahead, plans priced).
 */
export default async function Image() {
  const [serif, serifBold, sans, sansBold] = await Promise.all([
    font("gelasio-latin-500-normal.woff"),
    font("gelasio-latin-700-normal.woff"),
    font("inter-latin-500-normal.woff"),
    font("inter-latin-700-normal.woff"),
  ]);
  const line = "M0,92 L40,88 L62,40 L84,86 L170,84 L196,80 L218,28 L240,72 L300,70 L340,74";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "Inter",
          color: CREAM,
          background: "radial-gradient(900px 520px at 88% 8%, #2f6b47 0%, #1f4531 42%, #142a1d 100%)",
          padding: "64px 72px",
        }}
      >
        {/* soft glow + runway lines */}
        <div style={{ position: "absolute", left: -120, bottom: -180, width: 620, height: 620, borderRadius: 620, background: "rgba(221,239,191,0.06)", display: "flex" }} />
        <div style={{ position: "absolute", left: 72, right: 72, bottom: 54, height: 2, background: "linear-gradient(90deg, rgba(221,239,191,0.0), rgba(221,239,191,0.35), rgba(221,239,191,0.0))", display: "flex" }} />

        {/* left: the promise */}
        <div style={{ display: "flex", flexDirection: "column", width: 640, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 13, background: "#0f2017", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.08)" }}>
              <svg width="30" height="30" viewBox="0 0 30 30">
                <path d="M7 25 V15 Q7 8 14 8 H24" stroke={PALE} strokeWidth="4.5" fill="none" strokeLinecap="round" />
                <path d="M21 5 L26 8 L21 11" stroke={PALE} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>runway<span style={{ color: "#7fd39a" }}>.</span></span>
              <span style={{ fontSize: 13, letterSpacing: 6, color: "#b9cbb4", marginTop: 4 }}>TOMORROW</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Gelasio", fontWeight: 500, fontSize: 64, lineHeight: 1.08, letterSpacing: -1.2, display: "flex" }}>Budgets look back.</div>
            <div style={{ fontFamily: "Gelasio", fontWeight: 500, fontSize: 64, lineHeight: 1.08, letterSpacing: -1.2, color: PALE, display: "flex" }}>Runway looks ahead.</div>
            <div style={{ marginTop: 26, fontSize: 26, lineHeight: 1.4, color: "#c4d4bf", display: "flex", maxWidth: 560 }}>
              Your plans and your habits, turned into a budget for the month ahead.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "flex", fontSize: 20, fontWeight: 700, color: "#142a1d", background: PALE, padding: "10px 20px", borderRadius: 999 }}>Free beta</span>
            <span style={{ display: "flex", fontSize: 22, color: "#b9cbb4" }}>runwaytomorrow.com</span>
          </div>
        </div>

        {/* right: a slice of the app, floating */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <div
            style={{
              width: 390,
              display: "flex",
              flexDirection: "column",
              borderRadius: 34,
              background: "#fbf7ec",
              color: "#1d3324",
              boxShadow: "0 40px 80px -20px rgba(0,0,0,0.55)",
              transform: "rotate(-3deg)",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", padding: "24px 26px 18px", background: "linear-gradient(135deg, #2f6b47, #1f4531)", color: CREAM }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 16, color: "#c4d4bf" }}>Today's limit</span>
                <span style={{ display: "flex", fontSize: 13, color: PALE, background: "rgba(255,255,255,0.12)", padding: "4px 10px", borderRadius: 999 }}>On track</span>
              </div>
              <div style={{ fontFamily: "Gelasio", fontWeight: 700, fontSize: 66, lineHeight: 1.05, marginTop: 6, display: "flex" }}>$34.62</div>
              <svg width="338" height="100" viewBox="0 0 340 100" style={{ marginTop: 8 }}>
                <path d={`${line} L340,100 L0,100 Z`} fill="rgba(155,224,177,0.16)" />
                <line x1="0" x2="340" y1="96" y2="96" stroke="rgba(232,194,106,0.55)" strokeDasharray="3 6" />
                <path d={line} stroke="#9be0b1" strokeWidth="3" fill="none" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", padding: "16px 20px 20px", gap: 10 }}>
              {PLANS.map(([t, d, c, v]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 12, background: "#ffffff", borderRadius: 16, padding: "11px 14px", boxShadow: "0 1px 2px rgba(31,69,49,0.08)" }}>
                  <div style={{ width: 8, height: 34, borderRadius: 8, background: v === "Fits" ? "#2e7346" : "#c99a2e", display: "flex" }} />
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: INK }}>{t}</span>
                    <span style={{ fontSize: 13, color: "#6b7c6f" }}>{d}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: INK }}>{c}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: v === "Fits" ? "#2e7346" : "#9a6a00" }}>{v}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Gelasio", data: serif, weight: 500, style: "normal" },
        { name: "Gelasio", data: serifBold, weight: 700, style: "normal" },
        { name: "Inter", data: sans, weight: 500, style: "normal" },
        { name: "Inter", data: sansBold, weight: 700, style: "normal" },
      ],
    },
  );
}
