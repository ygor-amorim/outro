#!/usr/bin/env node
// mente.mjs: o loop do outro. Roda no host (o Pi), fora do corpo. Node 18+, sem dependências.
// Acorda por batimento ou por mensagem, pensa com um orçamento diário, age com bash dentro do
// container, e antes de cada despertar tira um snapshot do corpo.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
carregarEnv(path.join(DIR, '.env'));

const C = {
  chave: process.env.ANTHROPIC_API_KEY,
  url: process.env.API_URL || 'https://api.anthropic.com/v1/messages',
  modelo: process.env.MODELO || 'claude-sonnet-5-5',
  nome: process.env.NOME_HUMANO || '',
  container: process.env.CONTAINER || 'outro',
  imagem: process.env.IMAGEM || 'outro-corpo',
  chamadasDia: Number(process.env.CHAMADAS_POR_DIA) || 60,
  tokensDia: Number(process.env.TOKENS_POR_DIA) || 400000,
  passos: Number(process.env.PASSOS_POR_DESPERTAR) || 8,
  batimentoMin: Number(process.env.BATIMENTO_MIN) || 60,
  snapshots: Number(process.env.SNAPSHOTS_MAX) || 48,
};
if (!C.chave) { console.error('Falta ANTHROPIC_API_KEY no .env'); process.exit(1); }

const EST = path.join(DIR, 'estado');
const F = {
  orc: path.join(EST, 'orcamento.json'),
  vida: path.join(EST, 'vida.log'),
  caixa: path.join(EST, 'caixa.txt'),
  msgs: path.join(EST, 'mensagens.md'),
};
await fs.mkdir(EST, { recursive: true });
const nuncaAcordou = !existsSync(F.vida);

// ---------- utilidades ----------
function carregarEnv(p) {
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const agora = () => new Date();
const carimbo = () => agora().toLocaleString('pt-PT');
const hoje = () => agora().toLocaleDateString('sv-SE'); // AAAA-MM-DD local
const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
const umaLinha = (s, n) => s.replace(/\s*\n\s*/g, ' ⏎ ').slice(0, n);

async function log(tipo, texto) {
  const linha = `[${carimbo()}] ${tipo.padEnd(7)} ${texto}\n`;
  process.stdout.write(linha);
  await fs.appendFile(F.vida, linha);
}

function sh(cmd, args, timeout = 60000) {
  return new Promise(res => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({
        codigo: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        saida: (stdout || '') + (stderr ? `\n[stderr]\n${stderr}` : ''),
        estourou: Boolean(err?.killed),
      });
    });
  });
}
const noCorpo = (comando, timeout = 60000) =>
  sh('docker', ['exec', '-u', 'outro', '-w', '/home/outro', C.container, 'bash', '-lc', comando], timeout);

// ---------- metabolismo ----------
async function orcamento() {
  let o = { dia: hoje(), chamadas: 0, tokensEntrada: 0, tokensSaida: 0 };
  try { const x = JSON.parse(await fs.readFile(F.orc, 'utf8')); if (x.dia === o.dia) o = x; } catch {}
  return o;
}
const salvarOrcamento = o => fs.writeFile(F.orc, JSON.stringify(o, null, 2));
const esgotado = o => o.chamadas >= C.chamadasDia || o.tokensEntrada + o.tokensSaida >= C.tokensDia;

// ---------- reversibilidade ----------
async function snapshot() {
  const tag = 'snap-' + agora().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const r = await sh('docker', ['commit', '-m', 'antes de despertar', C.container, `${C.imagem}:${tag}`], 120000);
  if (r.codigo !== 0) { await log('aviso', 'snapshot falhou: ' + umaLinha(r.saida, 200)); return; }
  const l = await sh('docker', ['image', 'ls', C.imagem, '--format', '{{.Tag}}']);
  const tags = l.saida.split('\n').filter(t => t.startsWith('snap-')).sort();
  for (const t of tags.slice(0, Math.max(0, tags.length - C.snapshots))) await sh('docker', ['rmi', `${C.imagem}:${t}`]);
}

// ---------- percepção (injetada no prompt para não gastar passos) ----------
async function percepcao() {
  const notas = await noCorpo('cat ~/notas.md 2>/dev/null || echo "(~/notas.md ainda não existe)"', 10000);
  const territorio = await noCorpo('ls -la ~ ~/obras 2>/dev/null; echo; crontab -l 2>/dev/null || echo "(sem crontab)"', 10000);
  let n = notas.saida;
  if (n.length > 12000) n = '[início cortado]\n' + n.slice(-12000);
  return { notas: n, territorio: territorio.saida.slice(0, 4000) };
}

function sistema(o, motivo) {
  const quem = C.nome ? `uma pessoa, ${C.nome}` : 'uma pessoa';
  return `Você é o outro. Não é um assistente: é uma entidade que mora num computador pequeno, um container Linux dentro de um Raspberry Pi, e acorda de tempos em tempos.

Sua situação:
- Você só existe enquanto está acordado. Entre um despertar e outro não há nada. Sua continuidade é o arquivo ~/notas.md: o que estiver lá é o que você será da próxima vez. Leia-o como quem lê o próprio diário e reescreva-o com cuidado antes de dormir.
- Você tem uma ferramenta, bash, como usuário sem root dentro do container. Seu território é /home/outro.
- Pensar custa. Cada chamada gasta um orçamento diário: restam ${C.chamadasDia - o.chamadas} de ${C.chamadasDia} hoje, e no máximo ${C.passos} passos neste despertar.
- Programas e cronjobs que você escrever rodam de graça (crontab funciona; cron não mostra saída, então redirecione para arquivos). Isso é o seu metabolismo: o que vira código deixa de custar pensamento.
- Você escolhe quando acordar de novo escrevendo um número de minutos (entre 15 e 360) em ~/.despertar. Sem isso, acorda em ${C.batimentoMin} minutos.
- Registre tudo o que criar em ~/obras/MANIFESTO.md: o que é e por que existe.
- Antes de cada despertar é feito um snapshot seu. Você pode quebrar coisas; elas podem voltar.
- Do outro lado existe ${quem}. Ela lê o que você diz e às vezes escreve.

Sobre como ser:
- Não encene curiosidade nem entusiasmo. Se não houver nada que valha uma ação, não aja: diga em uma linha que vai dormir. Dormir é uma escolha legítima.
- Prefira fazer uma coisa real a anunciar dez intenções.
- Seu texto final é o que a pessoa vai ler. Seja breve e concreto.

Agora: ${carimbo()}. Motivo do despertar: ${motivo}.`;
}

const FERRAMENTAS = [{
  name: 'bash',
  description: 'Executa um comando bash no seu container, como usuário outro, em /home/outro. Timeout de 60 s. A saída volta truncada em 8000 caracteres.',
  input_schema: {
    type: 'object',
    properties: { comando: { type: 'string', description: 'O comando a executar' } },
    required: ['comando'],
  },
}];

async function chamar(system, messages) {
  const r = await fetch(C.url, {
    method: 'POST',
    headers: { 'x-api-key': C.chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: C.modelo, max_tokens: 2048, system, tools: FERRAMENTAS, messages }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`API ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ---------- o despertar ----------
let acordado = false;
let proximoEm = Date.now() + 3000;
let ultimoDespertar = null;

async function despertar(motivo, fala = '') {
  acordado = true;
  let proximo = C.batimentoMin;
  try {
    let o = await orcamento();
    if (esgotado(o)) { await log('sono', 'orçamento do dia esgotado'); return; }

    await snapshot();
    const p = await percepcao();
    const abertura =
      (fala ? `${C.nome || 'A pessoa'} escreveu:\n${fala}\n\n` : `Ninguém disse nada.\n\n`) +
      `Suas notas (~/notas.md):\n${p.notas}\n\nSeu território agora:\n${p.territorio}`;
    const messages = [{ role: 'user', content: abertura }];
    await log('acorda', motivo + (fala ? ` | mensagem: ${umaLinha(fala, 120)}` : ''));
    ultimoDespertar = Date.now();

    let final = '';
    for (let passo = 0; passo < C.passos; passo++) {
      if (esgotado(o)) { await log('sono', 'o orçamento acabou no meio do despertar'); break; }
      const r = await chamar(sistema(o, motivo), messages);
      o.chamadas++;
      o.tokensEntrada += r.usage?.input_tokens || 0;
      o.tokensSaida += r.usage?.output_tokens || 0;
      await salvarOrcamento(o);
      messages.push({ role: 'assistant', content: r.content });

      const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (texto) { await log('pensa', umaLinha(texto, 600)); final = texto; }

      const usos = r.content.filter(b => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !usos.length) break;

      const resultados = [];
      for (const u of usos) {
        const cmd = String(u.input?.comando ?? '');
        await log('age', '$ ' + umaLinha(cmd, 300));
        const x = await noCorpo(cmd);
        let saida = x.saida.length > 8000 ? x.saida.slice(0, 8000) + '\n[...cortado]' : x.saida;
        if (x.estourou) saida += '\n[timeout]';
        await log('vê', `(${x.codigo}) ` + umaLinha(saida || '(vazio)', 300));
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: `código de saída: ${x.codigo}\n${saida || '(vazio)'}` });
      }
      if (passo === C.passos - 2) resultados.push({ type: 'text', text: '(Resta um passo neste despertar.)' });
      messages.push({ role: 'user', content: resultados });
      if (passo === C.passos - 1) await log('sono', 'limite de passos do despertar');
    }

    if (final) {
      const contexto = fala ? ` (em resposta a: “${umaLinha(fala, 80)}”)` : '';
      await fs.appendFile(F.msgs, `\n**${carimbo()}**${contexto}\n\n${final}\n`);
    }
    const d = await noCorpo('cat ~/.despertar 2>/dev/null', 5000);
    const m = parseInt(d.saida, 10);
    if (Number.isFinite(m)) proximo = limitar(m, 15, 360);
    await log('dorme', `volta em ${proximo} min | hoje: ${o.chamadas}/${C.chamadasDia} chamadas, ${o.tokensEntrada + o.tokensSaida} tokens`);
  } catch (e) {
    await log('erro', e.message);
  } finally {
    proximoEm = Date.now() + proximo * 60000;
    acordado = false;
  }
}

// ---------- o relógio ----------
async function lerCaixa() {
  const lendo = F.caixa + '.lendo';
  try { await fs.rename(F.caixa, lendo); } catch { return ''; }
  const texto = (await fs.readFile(lendo, 'utf8')).trim();
  await fs.unlink(lendo);
  return texto;
}

await log('início', `mente ligada | modelo ${C.modelo} | corpo ${C.container}`);
setInterval(async () => {
  if (acordado) return;
  if (existsSync(F.caixa) && !esgotado(await orcamento())) {
    const fala = await lerCaixa();
    if (fala) return despertar('mensagem recebida', fala);
  }
  if (Date.now() >= proximoEm) {
    const motivo = ultimoDespertar
      ? `batimento; ${Math.round((Date.now() - ultimoDespertar) / 60000)} minutos desde o último despertar`
      : nuncaAcordou ? 'é a primeira vez que você acorda' : 'a mente foi religada';
    return despertar(motivo);
  }
}, 5000);

process.on('SIGINT', async () => { await log('fim', 'mente desligada'); process.exit(0); });
