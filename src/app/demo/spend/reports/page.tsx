import { redirect } from "next/navigation";

/** This moved: reports now lives in Money's Trends tab. */
export default function Page() {
  redirect("/demo/spend/trends");
}
