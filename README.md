# PDF Analysis Tool

A Next.js web application for uploading and analyzing PDF files using ASU AIML Platform API with parallel processing capabilities.

## Features

- **Drag & Drop Upload**: Easy file upload interface supporting multiple PDFs
- **Parallel Processing**: Process multiple PDF files simultaneously for faster results
- **Text Extraction**: Extracts text from PDFs using pdf-parse v2
- **Image Analysis**: Optional Gemini Vision integration for analyzing embedded images
- **AI-Powered Analysis**: Sends extracted content to ASU AIML API for analysis
- **Real-time Progress**: Visual feedback during processing
- **Results Export**: Download analysis results as JSON

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **File Upload**: react-dropzone
- **PDF Processing**: pdf-parse v2
- **Image Analysis**: Google Generative AI (Gemini) - Optional
- **API**: ASU AIML Platform

## Prerequisites

- Node.js 20.x or higher
- ASU AIML API token
- (Optional) Google Gemini API key for enhanced image analysis

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Edit `.env.local` and add your API keys:
```env
ASU_AIML_TOKEN=your_actual_token_here
GEMINI_API_KEY=your_gemini_key_here  # Optional
```

## Running the Application

### Development Mode
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Production Build
```bash
npm run build
npm start
```

## Usage

1. **Upload Files**
   - Drag and drop PDF files onto the upload area, or click to select files
   - Multiple files can be uploaded at once
   - Only PDF files are accepted

2. **Analyze**
   - Click the "Analyze" button to start processing
   - Files are processed in parallel for faster results
   - Progress is shown in real-time

3. **View Results**
   - Each file's results are displayed in separate cards
   - View extracted text, metadata, and analysis results
   - Download all results as JSON for further processing

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ASU_AIML_TOKEN` | Yes | Bearer token for ASU AIML API |
| `GEMINI_API_KEY` | No | Google Gemini API key for image analysis |
| `ASU_AIML_PROJECT_TOKEN` | No | Project owner token for file management |
| `ASU_AIML_BASE_URL` | No | Custom REST API URL |
| `ASU_AIML_WS_BASE_URL` | No | Custom WebSocket URL |

### Image Analysis

The application can analyze images embedded in PDFs:
- **Without Gemini API**: Basic image metadata extraction
- **With Gemini API**: Enhanced AI-powered image analysis and text extraction

## API Endpoints

### POST `/api/analyze`

Accepts multipart/form-data with PDF files and returns analysis results.

## Troubleshooting

### Error: "ASU_AIML_TOKEN environment variable is required"
- Make sure you've created `.env.local` and added your ASU AIML token

### PDF processing fails
- Check that the PDF is not corrupted
- Verify your ASU AIML token is valid
- Check the console for detailed error messages

### Image analysis not working
- Ensure `GEMINI_API_KEY` is set in `.env.local`
- Image analysis is optional - the app works without it
