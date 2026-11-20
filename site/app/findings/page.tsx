import type { Metadata } from "next";
import { FindingsFeed } from "@/components/FindingsFeed";
import { PageHead } from "@/components/Ui";

export const metadata: Metadata = { title: "Findings" };

export default function Findings() {
  return (
    <div className="page">
      <PageHead eyebrow="Live findings" title="What the live checker flagged">
        <p>Read from the live checker as it follows mainnet: union arms first seen by our checker, reader disagreements, transactions with known bug shapes, and the long tail of rarely seen arms. Every transaction links to stellar.expert.</p>
      </PageHead>
      <FindingsFeed />
    </div>
  );
}
