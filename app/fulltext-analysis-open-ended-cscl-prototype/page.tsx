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
      navLinks={[
        { href: '/metadata-screening-cscl-prototype', label: '← Step 1: Screening' },
        { href: '/fulltext-analysis-close-ended-cscl-prototype', label: 'Step 3: Close-Ended →' },
      ]}
      ratedAspectsLabel="Rated Aspects"
      ratedAspectsDescription='Enter your rated aspects below. You can enter multiple rated aspects to be analyzed simultaneously. Each rated aspect must be listed on a separate line, led by "(#)". Note this bot handles open-ended questions. Your rated aspects can be phrased freely.'
      ratedAspectsPlaceholder={"(1) What class(es) of machine learning or AI method(s) does this study involve (e.g., RAG, supervised fine-tuning, agentic AI, prompt engineering)? Exclude the methods that are only briefly discussed in the introduction or discussion sections of the article."}
      fileCategories={[
        { key: 'cscl-lab', label: 'CSCL Articles', folderKey: 'cscl-lab', blobPrefix: 'CSCL-lab/' },
      ]}
    />
  );
}
