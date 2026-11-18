import type { Metadata } from "next";
import { FindingsFeed } from "@/components/FindingsFeed";
import { PageHead } from "@/components/Ui";

export const metadata: Metadata = { title: "Findings" };

export default function Findings() {
  return (
    <div className="page">
      <PageHead eyebrow="Findings feed" title="What the live checker flagged">
        <p>First sightings of union arms, transactions with known bug shapes, and the long tail of rarely seen arms. Every transaction links to stellar.expert.</p>
      </PageHead>
      <FindingsFeed />
    </div>
  );
}
