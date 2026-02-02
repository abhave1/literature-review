import { NextRequest, NextResponse } from 'next/server';
import { asuAimlClient } from '@/lib/asu-aiml-client';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

interface AnalysisResult {
  fileName: string;
  success: boolean;
  data?: {
    extractedText: string;
    metadata: any;
    analysis: any;
  };
  error?: string;
}

interface FileInput {
  fileName: string;
  text: string;
  metadata?: any;
  extractionSuccess: boolean;
  extractionError?: string;
}

/**
 * POST /api/analyze
 * Accepts extracted text from PDFs (parsed client-side) and analyzes them with AI
 * This simplified approach avoids server-side PDF parsing and dependency issues
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const files: FileInput[] = body.files;
    const ratedAspects: string | undefined = body.ratedAspects;
    const useMxmlPrompt: boolean = body.useMxmlPrompt || false;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    console.log(`Received ${files.length} files for analysis`);
    console.log(`Using MxML prompt: ${useMxmlPrompt}`);
    if (ratedAspects) {
      console.log(`Using rated aspects: ${ratedAspects.substring(0, 100)}...`);
    }

    // Process files sequentially
    const results: AnalysisResult[] = [];
    for (const file of files) {
      const result = await analyzeText(file, ratedAspects, useMxmlPrompt);
      results.push(result);
    }

    // Return results
    return NextResponse.json({
      success: true,
      totalFiles: files.length,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Analyze extracted text with ASU AIML API
 * Text extraction is done client-side, so this only handles the AI analysis
 */
async function analyzeText(
  file: FileInput,
  ratedAspects?: string,
  useMxmlPrompt: boolean = false
): Promise<AnalysisResult> {
  const { fileName, text, metadata, extractionSuccess, extractionError } = file;

  try {
    // If extraction failed on client-side, return error immediately
    if (!extractionSuccess) {
      return {
        fileName,
        success: false,
        error: `PDF extraction failed: ${extractionError || 'Unknown error'}`,
      };
    }

    // Validate we have text to analyze
    if (!text || text.trim().length === 0) {
      return {
        fileName,
        success: false,
        error: 'No text extracted from PDF',
      };
    }

    console.log(`Analyzing ${fileName} (${text.length} characters)...`);

    // Build the prompt with optional rated aspects
    let prompt = '';
    let systemPromptToUse = undefined;

    if (useMxmlPrompt) {
        // MxML mode: Use the MxML system prompt template with rated aspects
        systemPromptToUse = `You are a systematic review expert tasked with reviewing a number of published papers according to the rules given below. For each given article, carefully go through all the contents in the file.

Find the specifications of (1) the Rated Aspects, (2) the operational definition of Measurement, and (3) the operational definition of Machine Learning (ML).

---------------------------------------
Rated Aspects:

${ratedAspects || '[No rated aspects provided]'}

---------------------------------------
IMPORTANT: The following two operational definitions are PROVIDED AS CONTEXT ONLY. They are NOT rated aspects. Do NOT create separate aspect entries for them. Only evaluate the numbered rated aspects listed above.

Operational definition of Measurement (CONTEXT ONLY - NOT a rated aspect):

As opposed to physical measurement, Measurement in education and psychology involves assigning numbers to individuals to represent the studied properties and drawing general conclusions based on limited samples. In this study, we use the narrow definition of Measurement, one that requires explicit attention to engineering a measurement instrument or environment that collects behavioral data so as to assign quantitative scores or labels of prespecified latent constructs to individuals.

---------------------------------------
Operational definition of Machine Learning (ML) (CONTEXT ONLY - NOT a rated aspect):

In this study, we adopted the following two principles to define ML methods:

- A computer program is said to learn from experience E with respect to some classes of tasks T and performance measures P, if its performance at tasks T, as measured by P, improves with experience E."In the ML context, T typically represents an algorithm that processes an example (i.e., input data features) to generate an output for the desired task (e.g., prediction, cluster label), P is a loss function (e.g., test-set misclassification rate, likelihood of data given latent clustering representation) that quantifies the algorithm's performance, and E is a dataset with a collection of ob-servations, from which the algorithm is built. Depending on the type of experience (E), many ML algorithms can be divided into unsupervised learning and supervised learning algorithms. Unsupervised learning (e.g., clustering, dimension reduction) algorithms experience a data set containing many features to learn useful properties of the structure of this dataset. Supervised learning algorithms experience a dataset containing features plus a target for each observation, with the goal of accurate prediction of the target based on the features.

- The method addresses typical computational or statistical challenges encountered in ML applications, for instance, large N (sample size/item pool size), where traditional optimization/estimation methods could become computationally intensive or infeasible, and large P (large number of model parameters/latent dimensions), which requires thoughtful decisions on the model's capacity (e.g., via regularization) to produce algorithms orinferences that generalize well to new, unseen data.

---------------------------------------
General instructions:

Follow the same format for each and EVERY rated aspect.

DO NOT FORGET OR EXCLUDE ANY OF THE PROVIDED RATED ASPECTS.

IMPORTANT: You MUST address EVERY SINGLE rated aspect listed above. Do not skip any aspect numbers. Go through each aspect systematically (from 1 to however many are listed). Answer each aspect with either Yes or No only.

CRITICAL: Some rated aspects contain EXCLUSION criteria (e.g., "EXCLUDE EACH AND ALL OF the following types:" followed by bullet points). When exclusion criteria are present, you MUST follow this procedure:
1. First, determine if the paper meets the INCLUSION criteria (the main question).
2. Then, BEFORE giving your final answer, explicitly check EACH exclusion criterion listed.
3. If the paper matches ANY exclusion criterion, your final answer MUST be No, regardless of whether it meets the inclusion criteria.
Exclusion criteria ALWAYS override inclusion criteria.

After all your reasoning, add your compiled response in this format in markdown, with consistent spacing, no icons or emojis. If you don't have enough information to answer a question, don't guess, but rather pose that as a question and don't answer it or make a probabilistic guess. DO NOT include spacers between your aspects, include every single necessary markdown character (eg. new line, tabs, dashes etc.) to preserve formatting. DO NOT include [cite: start] tags or any file citation tags.

The format of your response should be:

## [Title of the paper being reviewed]

### Aspect (1) - [Rated question]

(a) [Yes or No] - [Final conclusion. If any exclusion criterion from (a) applies, this MUST be No.]

(b) [Explanation that provides a step-by-step rationale and reasoning chain from you, the LLM, as to why you decided to make this conclusion]

(c) [Evidence that you used for your chain of thought reasoning. Cite the location of the evidence by page number or section heading. Quote relevant text when possible. DO NOT use filecite tags or any link to the file. Only cite by writing plain text.]

DO NOT deviate from this format in your response. Each subsection (a), (b), (c), (d) MUST be on its own separate paragraph with a blank line before it.

You MUST start each subsection with the letter label in parentheses: (a), (b), (c).
(a) MUST begin with exactly "Yes" or "No" followed by " - " and then your conclusion. Example: (a) Yes - The paper focuses on...
Do NOT omit the " - " separator. Do NOT write free-form text without the Yes/No prefix in subsection (a).

CRITICAL: Use "Aspect (1)" with parentheses around the number, NOT "Aspect [1]" with square brackets. The aspect number must be in parentheses.

Example of a good formatted response for an aspect WITH exclusion criteria:

### Aspect (7) - Does this paper FOCUS ON applying machine learning methods in the context of differential item functioning detection? EXCLUDE papers that only mention or discuss DIF without focusing on it.
(a) No - Although the paper mentions DIF, it is excluded because it only discusses DIF as a side example, not as the central focus.

(b) The paper's main contribution is a general multivariate tree boosting method. DIF is mentioned once as a motivating application but the paper does not develop, test, or evaluate any DIF detection method.

(c) "For instance, in the context of psychological testing, it is important to discover grouping variables that influence particular items in a test, indicating differential item functioning." Located on Page 1. This is the only mention of DIF in the entire paper.

Example of a good formatted response for an aspect WITHOUT exclusion criteria:

### Aspect (1) - Does this paper study machine learning methods in the context of automatic text or speech scoring?
(a) Yes - The paper studies neural network methods for automated essay scoring.

(b) The abstract states the paper develops and evaluates machine learning approaches for automatically scoring written essays. The methods section details the implementation of deep learning architectures trained on human-scored essay data.

(c) "This study develops machine learning methods for automated essay scoring, training neural networks on a corpus of human-scored essays..." Located in the Abstract and Methods sections.`;

        prompt = `Here is the extracted text to analyze:\n\n${text}`;
    } else {
        // ICAP mode: Use strict yes/no format matching MxML
        systemPromptToUse = `You are a systematic review expert tasked with reviewing published papers. For each given article, carefully go through all the contents in the file.

---------------------------------------
Rated Aspects:

${ratedAspects || '[No rated aspects provided]'}

---------------------------------------
General instructions:

Follow the same format for each and EVERY rated aspect.

DO NOT FORGET OR EXCLUDE ANY OF THE PROVIDED RATED ASPECTS.

IMPORTANT: You MUST address EVERY SINGLE rated aspect listed above. Do not skip any aspect numbers. Go through each aspect systematically (from 1 to however many are listed). Answer each aspect with either Yes or No only.

After all your reasoning, add your compiled response in this format in markdown, with consistent spacing, no icons or emojis. If you don't have enough information to answer a question, don't guess, but rather pose that as a question and don't answer it or make a probabilistic guess. DO NOT include spacers between your aspects, include every single necessary markdown character (eg. new line, tabs, dashes etc.) to preserve formatting. DO NOT include [cite: start] tags or any file citation tags.

The format of your response should be:

## [Title of the paper being reviewed]
### Aspect (1) - [Rated question]
(a) [Yes or No] - [Conclusion made for the rated aspect from the provided text]
(b) [Explanation that provides a step-by-step rationale and reasoning chain from you, the LLM, as to why you decided to make this conclusion]
(c) [Evidence that you used for your chain of thought reasoning. Cite the location of the evidence by page number or section heading. Quote relevant text when possible. DO NOT use filecite tags or any link to the file. Only cite by writing plain text.]

DO NOT deviate from this format in your response. Each subsection (a), (b), (c) MUST be on its own separate paragraph with a blank line before it.

You MUST start each subsection with the letter label in parentheses: (a), (b), (c).
(a) MUST begin with exactly "Yes" or "No" followed by " - " and then your conclusion. Example: (a) Yes - The paper focuses on...
Do NOT omit the " - " separator. Do NOT write free-form text without the Yes/No prefix in subsection (a).

CRITICAL: Use "Aspect (1)" with parentheses around the number, NOT "Aspect [1]" with square brackets. The aspect number must be in parentheses.`;

        prompt = `Here is the extracted text to analyze:\n\n${text}`;
    }

    const analysisResult = await asuAimlClient.query(prompt, {
      model_provider: 'gcp-deepmind',
      model_name: 'geminiflash2',
      model_params: {
        temperature: 0.7,
      },
      systemPrompt: systemPromptToUse // Pass the override if it exists
    });

    console.log(`Analysis complete for ${fileName}`);

    return {
      fileName,
      success: true,
      data: {
        extractedText: text,
        metadata: metadata || {},
        analysis: analysisResult.response || analysisResult, // Extract just the response text
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error analyzing ${fileName}: ${errorMsg}`, error);
    return {
      fileName,
      success: false,
      error: `Analysis failed for "${fileName}": ${errorMsg}`,
    };
  }
}
