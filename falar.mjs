#!/usr/bin/env node
// Deixa uma mensagem na caixa do outro e espera a resposta por alguns minutos.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const EST = path.join(DIR, 'estado');
const MSGS = path.join(EST, 'mensagens.md');
const msg = process.argv.slice(2).join(' ').trim();
if (!msg) { console.log('uso: node falar.mjs "sua mensagem"'); process.exit(1); }

await fs.mkdir(EST, { recursive: true });
const tamanho = async () => { try { return (await fs.stat(MSGS)).size; } catch { return 0; } };
const antes = await tamanho();
await fs.appendFile(path.join(EST, 'caixa.txt'), msg + '\n');
console.log('entregue. esperando resposta (até 5 min)...\n');

for (let i = 0; i < 150; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const agora = await tamanho();
  if (agora > antes) {
    const fh = await fs.open(MSGS);
    const buf = Buffer.alloc(agora - antes);
    await fh.read(buf, 0, buf.length, antes);
    await fh.close();
    console.log(buf.toString().trim());
    process.exit(0);
  }
}
console.log('nada ainda. talvez esteja dormindo sem orçamento; veja estado/vida.log.');
