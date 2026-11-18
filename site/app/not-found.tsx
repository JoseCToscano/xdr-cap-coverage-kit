import Link from "next/link";
import { PageHead } from "@/components/Ui";

export default function NotFound() {
  return (
    <PageHead eyebrow="404" title="No such ledger here">
      <p><Link href="/">Back to the live view</Link></p>
    </PageHead>
  );
}
