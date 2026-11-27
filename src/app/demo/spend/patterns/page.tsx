import { redirect } from "next/navigation";

/** This moved: patterns now lives in Money's Trends tab. */
export default function Page() {
  redirect("/demo/spend/trends");
}
