import { NextRequest, NextResponse } from 'next/server';
import { asuAimlClient } from '@/lib/asu-aiml-client';
import {
  buildBatchScreeningSystemPrompt,
  buildBatchArticlesPrompt,
  type ScreeningRubrics,
  type BatchArticleInput,
} from '@/lib/screening/default-rubrics';
import {
  parseBatchScreeningResponse,
  hasNoAbstract,
  type ScreeningResult,
  type ScreeningDecision,
} from '@/lib/screening/response-parser';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

interface BatchScreeningRequest {
  articles: {
    id: string;
    title: string;
    abstract: string;
    year: string;
    journal: string;
  }[];
  rubrics: ScreeningRubrics;
}

interface BatchScreeningResponse {
  success: boolean;
  results: ScreeningResult[];
  batchSize: number;
  processedCount: number;
  error?: string;
}

/**
 * POST /api/screening
 * Screen a batch of articles (10-15 recommended) based on title, abstract, year, and journal
 */
export async function POST(request: NextRequest): Promise<NextResponse<BatchScreeningResponse>> {
  try {
    const body: BatchScreeningRequest = await request.json();
    const { articles, rubrics } = body;

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          results: [],
          batchSize: 0,
          processedCount: 0,
          error: 'No articles provided',
        },
        { status: 400 }
      );
    }

    console.log(`Batch screening ${articles.length} articles...`);

    // Separate articles with and without abstracts
    const articlesWithAbstract: BatchArticleInput[] = [];
    const noAbstractResults: ScreeningResult[] = [];
    const now = new Date().toISOString();

    articles.forEach((article, index) => {
      if (hasNoAbstract(article.abstract)) {
        noAbstractResults.push({
          articleId: article.id,
          decision: 'NoAbstract',
          rulesUsed: 'NoAbstract',
          explanation: 'Abstract is missing or insufficient for screening.',
          rawResponse: '',
          processedAt: now,
          parseSuccess: true,
        });
      } else {
        articlesWithAbstract.push({
          index: articlesWithAbstract.length, // Sequential index for batch
          id: article.id,
          title: article.title,
          abstract: article.abstract,
          year: article.year,
          journal: article.journal,
        });
      }
    });

    // If all articles have no abstract, return early
    if (articlesWithAbstract.length === 0) {
      return NextResponse.json({
        success: true,
        results: noAbstractResults,
        batchSize: articles.length,
        processedCount: noAbstractResults.length,
      });
    }

    // Build prompts for articles with abstracts
    const systemPrompt = buildBatchScreeningSystemPrompt(rubrics);
    const userPrompt = buildBatchArticlesPrompt(articlesWithAbstract);

    // Call the LLM
    const result = await asuAimlClient.query(userPrompt, {
      model_provider: 'gcp-deepmind',
      model_name: 'geminiflash2',
      model_params: {
        temperature: 0.2, // Lower temperature for consistent JSON output
      },
      systemPrompt,
    });

    const rawResponse = result.response || String(result);

    // Parse the batch response
    const articleIds = articlesWithAbstract.map(a => a.id);
    const { results: batchResults, parseSuccess, parseError } = parseBatchScreeningResponse(
      rawResponse,
      articleIds
    );

    if (!parseSuccess) {
      console.error(`Batch parse failed: ${parseError}`);
    }

    // Combine results: noAbstract results + batch results
    // We need to maintain original order
    const allResults: ScreeningResult[] = [];
    let batchIndex = 0;
    let noAbstractIndex = 0;

    for (const article of articles) {
      if (hasNoAbstract(article.abstract)) {
        allResults.push(noAbstractResults[noAbstractIndex++]);
      } else {
        allResults.push(batchResults[batchIndex++]);
      }
    }

    const successCount = allResults.filter(r => r.parseSuccess).length;
    console.log(`Batch screening complete: ${successCount}/${articles.length} successful`);

    return NextResponse.json({
      success: true,
      results: allResults,
      batchSize: articles.length,
      processedCount: allResults.length,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Batch screening API error:', errorMsg);

    return NextResponse.json(
      {
        success: false,
        results: [],
        batchSize: 0,
        processedCount: 0,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
