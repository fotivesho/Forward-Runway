import { redirect } from "next/navigation";

/** Merged into Spend. Old links keep working. */
export default function Page() {
  redirect("/demo/spend/transactions");
}
