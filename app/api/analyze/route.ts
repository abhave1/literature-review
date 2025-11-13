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

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    console.log(`Received ${files.length} files for analysis`);
    if (ratedAspects) {
      console.log(`Using rated aspects: ${ratedAspects.substring(0, 100)}...`);
    }

    // Process all files in parallel
    const results = await Promise.all(
      files.map((file) => analyzeText(file, ratedAspects))
    );

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
async function analyzeText(file: FileInput, ratedAspects?: string): Promise<AnalysisResult> {
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
    let prompt = `From the extracted text below, according to your system prompt given to you, analyze the text and output your conclusion.`;

    if (ratedAspects) {
      prompt += `\n\nHere are your rated aspects:\n${ratedAspects}`;
    }

    prompt += `\n\nHere is the extracted text:\n${text}`;

    const analysisResult = await asuAimlClient.query(prompt, {
      model_provider: 'gcp-deepmind',
      model_name: 'geminiflash2',
      model_params: {
        temperature: 0.7,
      },
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
    console.error(`Error analyzing ${fileName}:`, error);
    return {
      fileName,
      success: false,
      error: String(error),
    };
  }
}
