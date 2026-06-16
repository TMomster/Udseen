// Quick test for chain method call parsing
import { parseScript } from './src/renderer/engine/parser/index.js';

const result = parseScript('bg.fit().begin();');
console.log('Success:', result.success);
if (result.success) {
  console.log('Statements:', JSON.stringify(result.ast.statements, null, 2));
} else {
  console.log('Error:', result.error);
}
