import { PDFParse } from 'pdf-parse';
import fs from 'fs';

async function test() {
  try {
    const parser = new PDFParse({ data: fs.readFileSync('package.json') });
    const result = await parser.getText();
    console.log(result.text.slice(0, 50));
  } catch (e) {
    console.error(e.message);
  }
}
test();
