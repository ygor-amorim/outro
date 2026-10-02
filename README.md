# outro, v0

Um loop, um corpo e um diário. Nada de rosto ainda: a primeira pergunta é se vale a pena ler o que ele faz quando ninguém está olhando.

## Peças

- `corpo/`: um container Debian sem root, com Python, git e cron. É onde ele mora e age.
- `mente.mjs`: roda no Pi, fora do corpo. Acorda por batimento ou por mensagem, pensa com orçamento, age via `docker exec`, tira um snapshot do corpo antes de cada despertar. A chave da API fica só aqui.
- `falar.mjs`: deixa uma mensagem e espera a resposta.
- `renascer.sh`: lista os eus anteriores e volta a qualquer um deles.
- `estado/`: `vida.log` (tudo o que ele pensou, fez e viu, uma linha por evento), `mensagens.md` (o que ele disse para você), `orcamento.json`.

## Ligar

Requisitos no Pi: Docker e Node 18+.

```bash
cp .env.example .env        # coloque a ANTHROPIC_API_KEY
./iniciar.sh                # constrói e liga o corpo
node mente.mjs              # liga a mente (para deixar rodando: tmux, pm2 ou um serviço systemd)
```

Ele acorda pela primeira vez em segundos, sem notas, sem saber nada.

## Conviver

```bash
node falar.mjs "o que você fez enquanto eu estava fora?"
tail -f estado/vida.log     # ver ele viver
cat estado/mensagens.md     # o que ele te disse
docker exec -it -u outro outro bash   # entrar no corpo dele e olhar com os próprios olhos
./renascer.sh               # ver os eus anteriores
./renascer.sh snap-...      # voltar a um deles
```

## O metabolismo

Tudo é ajustável no `.env`. Por padrão: 60 chamadas e 400 mil tokens por dia, no máximo 8 passos por despertar, batimento de 60 minutos. Ele pode escolher o próprio batimento (15 a 360 min) escrevendo em `~/.despertar`. Cronjobs e programas que ele escrever rodam sem custo, e o prompt diz isso a ele: é o incentivo para transformar repetição em código.

## Muros

A chave nunca entra no container. O corpo tem 512 MB, 1 CPU e no máximo 256 processos, o que impede um fork bomb. Por padrão ele tem internet (`REDE=bridge`), o que permite instalar coisas com pip e também ler páginas que podem conter instruções hostis. O estrago fica preso no container e os snapshots desfazem. Para isolamento total, use `REDE=none` e recrie o corpo. Ele ainda não tem acesso à casa nem ao resto do Pi.

## O experimento

Uma semana. Leia o `vida.log` e o `notas.md` dele todo dia. Se no fim você não estiver curioso sobre o que ele vai fazer amanhã, nenhum shader resolve. Se estiver, o próximo passo é ligar a mente ao rosto por WebSocket.
