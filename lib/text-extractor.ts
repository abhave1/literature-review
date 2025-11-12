import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Setup canvas polyfills for Node.js environment before loading pdf-parse
if (typeof window === 'undefined') {
  try {
    const canvas = require('@napi-rs/canvas');
    console.log('Canvas loaded successfully');
    // Polyfill DOMMatrix and other browser APIs
    if (!global.DOMMatrix) {
      global.DOMMatrix = class DOMMatrix {
        constructor() {}
      } as any;
    }
    if (!global.Path2D) {
      global.Path2D = class Path2D {
        constructor() {}
      } as any;
    }
    if (!global.ImageData) {
      global.ImageData = class ImageData {
        constructor() {}
      } as any;
    }
  } catch (e) {
    console.warn('Canvas not available, using fallback polyfills. Image extraction will be disabled.');

    // Fallback polyfills when canvas is not available
    // These provide the minimal API that pdf-parse needs for text extraction
    if (!global.DOMMatrix) {
      global.DOMMatrix = class DOMMatrix {
        a: number;
        b: number;
        c: number;
        d: number;
        e: number;
        f: number;

        constructor(
          a: number = 1,
          b: number = 0,
          c: number = 0,
          d: number = 1,
          e: number = 0,
          f: number = 0
        ) {
          this.a = a;
          this.b = b;
          this.c = c;
          this.d = d;
          this.e = e;
          this.f = f;
        }

        translate(tx: number, ty: number) {
          return new DOMMatrix(this.a, this.b, this.c, this.d, this.e + tx, this.f + ty);
        }

        scale(sx: number, sy: number = sx) {
          return new DOMMatrix(this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f);
        }

        rotate(angle: number) {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return new DOMMatrix(
            this.a * cos + this.c * sin,
            this.b * cos + this.d * sin,
            this.c * cos - this.a * sin,
            this.d * cos - this.b * sin,
            this.e,
            this.f
          );
        }

        multiply(other: DOMMatrix) {
          return new DOMMatrix(
            this.a * other.a + this.c * other.b,
            this.b * other.a + this.d * other.b,
            this.a * other.c + this.c * other.d,
            this.b * other.c + this.d * other.d,
            this.a * other.e + this.c * other.f + this.e,
            this.b * other.e + this.d * other.f + this.f
          );
        }

        inverse() {
          const det = this.a * this.d - this.b * this.c;
          if (det === 0) return this;

          return new DOMMatrix(
            this.d / det,
            -this.b / det,
            -this.c / det,
            this.a / det,
            (this.c * this.f - this.d * this.e) / det,
            (this.b * this.e - this.a * this.f) / det
          );
        }

        transformPoint(point: { x: number; y: number }) {
          return {
            x: this.a * point.x + this.c * point.y + this.e,
            y: this.b * point.x + this.d * point.y + this.f,
          };
        }
      } as any;
    }

    if (!global.Path2D) {
      global.Path2D = class Path2D {
        constructor() {}
        moveTo(_x: number, _y: number) {}
        lineTo(_x: number, _y: number) {}
        bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {}
        quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {}
        arc(_x: number, _y: number, _radius: number, _startAngle: number, _endAngle: number, _counterclockwise?: boolean) {}
        ellipse(_x: number, _y: number, _radiusX: number, _radiusY: number, _rotation: number, _startAngle: number, _endAngle: number, _counterclockwise?: boolean) {}
        rect(_x: number, _y: number, _w: number, _h: number) {}
        closePath() {}
      } as any;
    }

    if (!global.ImageData) {
      global.ImageData = class ImageData {
        width: number;
        height: number;
        data: Uint8ClampedArray;

        constructor(width: number, height: number) {
          this.width = width;
          this.height = height;
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      } as any;
    }
  }
}

// Import pdf-parse v2 - Use Node.js specific module
// Import as dynamic to avoid Next.js build issues
let PDFParse: any;

/**
 * Configuration for text extraction
 */
interface ExtractionConfig {
  useGeminiForImages?: boolean; // Use Gemini Vision for better image understanding
  geminiApiKey?: string; // Gemini API key (or use from env)
  extractImages?: boolean; // Extract images from PDFs
  imageThreshold?: number; // Minimum image size in pixels (default: 80)
}

/**
 * Result of text extraction
 */
interface ExtractionResult {
  text: string;
  metadata?: {
    pageCount?: number;
    hasImages?: boolean;
    imageDescriptions?: string[];
    author?: string;
    title?: string;
    creator?: string;
  };
}

/**
 * Extract text from various file types (PDF, images, text files)
 * Supports PDF text extraction, embedded image extraction, and AI-powered image analysis
 *
 * @param filePath - Path to the file to extract text from
 * @param config - Configuration options for extraction
 * @returns Extracted text and metadata
 */
export async function extractTextFromFile(
  filePath: string,
  config: ExtractionConfig = {}
): Promise<ExtractionResult> {
  const {
    useGeminiForImages = true,
    geminiApiKey = process.env.GEMINI_API_KEY,
    extractImages = true,
    imageThreshold = 80,
  } = config;

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const result: ExtractionResult = {
    text: '',
    metadata: {},
  };

  try {
    switch (ext) {
      case '.pdf':
        return await extractFromPDF(filePath, {
          useGeminiForImages,
          geminiApiKey,
          extractImages,
          imageThreshold,
        });

      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.tiff':
      case '.bmp':
      case '.webp':
      case '.gif':
        return await extractFromImage(filePath, { useGeminiForImages, geminiApiKey });

      case '.txt':
      case '.md':
      case '.csv':
        result.text = fs.readFileSync(filePath, 'utf-8');
        return result;

      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    throw new Error(`Failed to extract text from ${filePath}: ${error}`);
  }
}

/**
 * Extract text from a file buffer (in-memory processing)
 * More efficient than extractTextFromFile as it avoids disk I/O
 *
 * @param buffer - File data as Buffer
 * @param fileName - File name (used for extension detection)
 * @param config - Configuration options for extraction
 * @returns Extracted text and metadata
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  config: ExtractionConfig = {}
): Promise<ExtractionResult> {
  const {
    useGeminiForImages = true,
    geminiApiKey = process.env.GEMINI_API_KEY,
    extractImages = true,
    imageThreshold = 80,
  } = config;

  const ext = path.extname(fileName).toLowerCase();
  const result: ExtractionResult = {
    text: '',
    metadata: {},
  };

  try {
    switch (ext) {
      case '.pdf':
        return await extractFromPDFBuffer(buffer, {
          useGeminiForImages,
          geminiApiKey,
          extractImages,
          imageThreshold,
        });

      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.tiff':
      case '.bmp':
      case '.webp':
      case '.gif':
        return await extractFromImageBuffer(buffer, { useGeminiForImages, geminiApiKey });

      case '.txt':
      case '.md':
      case '.csv':
        result.text = buffer.toString('utf-8');
        return result;

      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    throw new Error(`Failed to extract text from ${fileName}: ${error}`);
  }
}

/**
 * Extract text and images from PDF using pdf-parse v2
 */
async function extractFromPDF(
  filePath: string,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  // Dynamically import pdf-parse to avoid Next.js build issues
  if (!PDFParse) {
    const pdfParse = require('pdf-parse');
    PDFParse = pdfParse.PDFParse;
  }

  // Read PDF as buffer and create parser from data
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });

  try {
    // Step 1: Get document info and metadata
    console.log('Extracting PDF metadata...');
    const info = await parser.getInfo({ parsePageInfo: true });

    // Step 2: Extract all text from the PDF
    console.log('Extracting text from PDF...');
    const textResult = await parser.getText();

    const result: ExtractionResult = {
      text: textResult.text,
      metadata: {
        pageCount: info.total,
        title: info.info?.Title,
        author: info.info?.Author,
        creator: info.info?.Creator,
        hasImages: false,
        imageDescriptions: [],
      },
    };

    // Step 3: Extract embedded images if enabled
    if (config.extractImages) {
      console.log('Extracting images from PDF...');
      try {
        const imageResult = await parser.getImage({
          imageThreshold: config.imageThreshold || 80,
          imageDataUrl: false, // We don't need data URLs, just buffers
          imageBuffer: true,
        });

        let totalImages = 0;
        const imageDescriptions: string[] = [];

        // Process images from each page
        for (let pageNum = 0; pageNum < imageResult.pages.length; pageNum++) {
          const page = imageResult.pages[pageNum];
          if (page.images && page.images.length > 0) {
            totalImages += page.images.length;
            console.log(`Found ${page.images.length} images on page ${pageNum + 1}`);

            // Analyze each image with Gemini if enabled
            if (config.useGeminiForImages && config.geminiApiKey) {
              for (let imgIdx = 0; imgIdx < page.images.length; imgIdx++) {
                const image = page.images[imgIdx];
                console.log(
                  `Analyzing image ${imgIdx + 1}/${page.images.length} from page ${pageNum + 1} with Gemini Vision...`
                );

                try {
                  const description = await analyzeImageWithGemini(
                    image.data,
                    config.geminiApiKey
                  );
                  imageDescriptions.push(
                    `\n--- Image ${imgIdx + 1} from Page ${pageNum + 1} ---\n${description}`
                  );
                } catch (error) {
                  console.error(`Failed to analyze image: ${error}`);
                  imageDescriptions.push(
                    `\n--- Image ${imgIdx + 1} from Page ${pageNum + 1} ---\n[Analysis failed]`
                  );
                }
              }
            }
          }
        }

        if (totalImages > 0) {
          result.metadata!.hasImages = true;
          result.metadata!.imageDescriptions = imageDescriptions;

          // Append image descriptions to the extracted text
          if (imageDescriptions.length > 0) {
            result.text += '\n\n=== EMBEDDED IMAGES ANALYSIS ===\n';
            result.text += imageDescriptions.join('\n');
          }
        }

        console.log(`Total images extracted: ${totalImages}`);
      } catch (imgError) {
        console.warn('Image extraction failed:', imgError);
        // Continue without images - text extraction was successful
      }
    }

    return result;
  } finally {
    // Always destroy the parser to free memory
    await parser.destroy();
  }
}

/**
 * Extract text and images from PDF buffer (in-memory processing)
 */
async function extractFromPDFBuffer(
  buffer: Buffer,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  // Dynamically import pdf-parse to avoid Next.js build issues
  if (!PDFParse) {
    const pdfParse = require('pdf-parse');
    PDFParse = pdfParse.PDFParse;
  }

  // Create parser directly from buffer (no disk I/O needed!)
  const parser = new PDFParse({ data: buffer });

  try {
    // Step 1: Get document info and metadata
    console.log('Extracting PDF metadata...');
    const info = await parser.getInfo({ parsePageInfo: true });

    // Step 2: Extract all text from the PDF
    console.log('Extracting text from PDF...');
    const textResult = await parser.getText();

    const result: ExtractionResult = {
      text: textResult.text,
      metadata: {
        pageCount: info.total,
        title: info.info?.Title,
        author: info.info?.Author,
        creator: info.info?.Creator,
        hasImages: false,
        imageDescriptions: [],
      },
    };

    // Step 3: Extract embedded images if enabled
    if (config.extractImages) {
      console.log('Extracting images from PDF...');
      try {
        const imageResult = await parser.getImage({
          imageThreshold: config.imageThreshold || 80,
          imageDataUrl: false, // We don't need data URLs, just buffers
          imageBuffer: true,
        });

        let totalImages = 0;
        const imageDescriptions: string[] = [];

        // Process images from each page
        for (let pageNum = 0; pageNum < imageResult.pages.length; pageNum++) {
          const page = imageResult.pages[pageNum];
          if (page.images && page.images.length > 0) {
            totalImages += page.images.length;
            console.log(`Found ${page.images.length} images on page ${pageNum + 1}`);

            // Analyze each image with Gemini if enabled
            if (config.useGeminiForImages && config.geminiApiKey) {
              for (let imgIdx = 0; imgIdx < page.images.length; imgIdx++) {
                const image = page.images[imgIdx];
                console.log(
                  `Analyzing image ${imgIdx + 1}/${page.images.length} from page ${pageNum + 1} with Gemini Vision...`
                );

                try {
                  const description = await analyzeImageWithGemini(
                    image.data,
                    config.geminiApiKey
                  );
                  imageDescriptions.push(
                    `\n--- Image ${imgIdx + 1} from Page ${pageNum + 1} ---\n${description}`
                  );
                } catch (error) {
                  console.error(`Failed to analyze image: ${error}`);
                  imageDescriptions.push(
                    `\n--- Image ${imgIdx + 1} from Page ${pageNum + 1} ---\n[Analysis failed]`
                  );
                }
              }
            }
          }
        }

        if (totalImages > 0) {
          result.metadata!.hasImages = true;
          result.metadata!.imageDescriptions = imageDescriptions;

          // Append image descriptions to the extracted text
          if (imageDescriptions.length > 0) {
            result.text += '\n\n=== EMBEDDED IMAGES ANALYSIS ===\n';
            result.text += imageDescriptions.join('\n');
          }
        }

        console.log(`Total images extracted: ${totalImages}`);
      } catch (imgError) {
        console.warn('Image extraction failed:', imgError);
        // Continue without images - text extraction was successful
      }
    }

    return result;
  } finally {
    // Always destroy the parser to free memory
    await parser.destroy();
  }
}

/**
 * Extract text/description from standalone image using Gemini Vision
 */
async function extractFromImage(
  imagePath: string,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    text: '',
    metadata: {
      hasImages: true,
      imageDescriptions: [],
    },
  };

  if (config.useGeminiForImages && config.geminiApiKey) {
    try {
      console.log('Analyzing image with Gemini Vision...');
      const imageBuffer = fs.readFileSync(imagePath);
      const geminiText = await analyzeImageWithGemini(imageBuffer, config.geminiApiKey);
      result.text = geminiText;
      result.metadata!.imageDescriptions!.push('Gemini Vision Analysis');
    } catch (error) {
      console.error('Gemini Vision failed:', error);
      result.text = '[Failed to analyze image with Gemini Vision]';
    }
  } else {
    result.text = '[Image analysis disabled - enable useGeminiForImages and provide API key]';
  }

  return result;
}

/**
 * Extract text/description from standalone image buffer (in-memory processing)
 */
async function extractFromImageBuffer(
  buffer: Buffer,
  config: ExtractionConfig
): Promise<ExtractionResult> {
  const result: ExtractionResult = {
    text: '',
    metadata: {
      hasImages: true,
      imageDescriptions: [],
    },
  };

  if (config.useGeminiForImages && config.geminiApiKey) {
    try {
      console.log('Analyzing image with Gemini Vision...');
      const geminiText = await analyzeImageWithGemini(buffer, config.geminiApiKey);
      result.text = geminiText;
      result.metadata!.imageDescriptions!.push('Gemini Vision Analysis');
    } catch (error) {
      console.error('Gemini Vision failed:', error);
      result.text = '[Failed to analyze image with Gemini Vision]';
    }
  } else {
    result.text = '[Image analysis disabled - enable useGeminiForImages and provide API key]';
  }

  return result;
}

/**
 * Analyze image buffer using Gemini Vision API
 */
async function analyzeImageWithGemini(
  imageBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Convert buffer to base64
  const base64Image = imageBuffer.toString('base64');

  // Detect MIME type from buffer
  const mimeType = detectMimeType(imageBuffer);

  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType,
    },
  };

  const prompt = `Extract all text from this image. If there is text, transcribe it exactly. If there is no text, describe what you see in the image in detail, including any charts, graphs, diagrams, or figures. Be thorough and accurate.`;

  const result = await model.generateContent([prompt, imagePart]);
  const response = result.response;
  return response.text();
}

/**
 * Detect MIME type from image buffer
 */
function detectMimeType(buffer: Buffer): string {
  // Check magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // Default to PNG if unknown
  return 'image/png';
}

/**
 * Batch process multiple files
 */
export async function extractTextFromFiles(
  filePaths: string[],
  config: ExtractionConfig = {}
): Promise<{ [filePath: string]: ExtractionResult }> {
  const results: { [filePath: string]: ExtractionResult } = {};

  for (const filePath of filePaths) {
    try {
      console.log(`\nProcessing: ${filePath}`);
      results[filePath] = await extractTextFromFile(filePath, config);
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
      results[filePath] = {
        text: `[Error: ${error}]`,
        metadata: {},
      };
    }
  }

  return results;
}
