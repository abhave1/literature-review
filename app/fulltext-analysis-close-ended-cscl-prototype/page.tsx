import MxmlAnalyzer from '@/components/MxmlAnalyzer';

export default function FulltextCloseEndedCSCLPage() {
  return (
    <MxmlAnalyzer
      title="AI-Assisted Literature Review Toolset"
      subtitle="Step 3: Article Full-text Analysis, Close-Ended Questions"
      promptMode="cscl-close"
      showUpload={true}
      showJournalType={false}
      hideSystemPrompt={true}
      enableLocalPdfAdd={true}
      navLinks={[
        { href: '/metadata-screening-cscl-prototype', label: '← Step 1: Screening' },
        { href: '/fulltext-analysis-open-ended-cscl-prototype', label: '← Step 2: Open-Ended' },
      ]}
      ratedAspectsLabel="Rated Aspects"
      ratedAspectsDescription='Enter your rated aspects below. You can enter multiple rated aspects to be analyzed simultaneously. Each rated aspect must be listed on a separate line, led by "(#)". Note this bot handles close-ended questions. Your rated aspects must be phrased as close-ended questions, leading to a Yes/No/Maybe answer.'
      ratedAspectsPlaceholder={"(1) Does the paper report empirical studies comparing ICAP modes?\n(2) Does the paper extend the ICAP theory in a new direction?"}
      fileCategories={[
        { key: 'cscl-lab', label: 'CSCL Articles', folderKey: 'cscl-lab', blobPrefix: 'CSCL-lab/' },
      ]}
    />
  );
}
