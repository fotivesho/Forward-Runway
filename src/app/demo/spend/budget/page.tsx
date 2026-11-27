import { redirect } from "next/navigation";

/** This moved: budget now lives in Money's Month tab. */
export default function Page() {
  redirect("/demo/spend");
}
