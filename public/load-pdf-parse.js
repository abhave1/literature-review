// This script loads pdf-parse from CDN and makes it available globally
// It's loaded via a script tag in the HTML head

(async function() {
  try {
    // Import pdf-parse ES module
    const module = await import('https://cdn.jsdelivr.net/npm/pdf-parse@2.4.5/dist/pdf-parse/web/pdf-parse.es.js');

    // Expose PDFParse globally
    window.PDFParse = module.PDFParse;

    console.log('PDFParse loaded from CDN and available globally');
  } catch (error) {
    console.error('Failed to load PDFParse from CDN:', error);
  }
})();
