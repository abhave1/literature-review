import MxmlAnalyzer from '@/components/MxmlAnalyzer';

export default function FulltextOpenEndedCSCLPage() {
  return (
    <MxmlAnalyzer
      title="AI-Assisted Literature Review Toolset"
      subtitle="Step 2: Article Full-text Analysis, Open-Ended Questions"
      promptMode="cscl-open"
      showUpload={true}
      showJournalType={false}
      hideSystemPrompt={true}
      enableLocalPdfAdd={true}
      ratedAspectsLabel="Rated Aspects"
      ratedAspectsDescription='Enter your rated aspects below. You can enter multiple rated aspects to be analyzed simultaneously. Each rated aspect must be listed on a separate line, led by "(#)". Note this bot handles open-ended questions. Your rated aspects can be phrased freely.'
      ratedAspectsPlaceholder={"(1) What collaborative learning strategies does this paper employ?\n(2) How does the paper measure learning outcomes in CSCL settings?\n(3) What technology platforms are used for collaboration?"}
      fileCategories={[
        { key: 'cscl-lab', label: 'CSCL Articles', folderKey: 'cscl-lab', blobPrefix: 'CSCL-lab/' },
      ]}
    />
  );
}
