import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

// On Vercel the slim @sparticuz/chromium binary is used. Locally the full `puppeteer`
// devDependency supplies its own Chrome; it is imported lazily so it is never bundled.
export async function renderPdf(html: string) {
  const browser = process.env.VERCEL
    ? await puppeteerCore.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
    : await (await import('puppeteer')).default.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } });
  } finally { await browser.close(); }
}
