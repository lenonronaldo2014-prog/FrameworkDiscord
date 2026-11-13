# Discord Forge

**Servidores do Discord como código, feitos por qualquer IA.**

Peça para sua IA favorita "montar um servidor de Discord para X". Ela lê as instruções do
framework, escreve um blueprint (`server.yaml`) com cargos, categorias, canais, permissões e
mensagens, valida, mostra o plano e — com a sua aprovação — aplica tudo no servidor real.

```
você ──pede──▶ IA ──escreve──▶ server.yaml ──npm run apply──▶ servidor no Discord
                 ▲                  │
                 └── AGENTS.md      └── validate / plan (nada muda até você aprovar)
```

Funciona com Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Codex, ChatGPT e qualquer
agente que leia arquivos do projeto: as instruções ficam em [AGENTS.md](AGENTS.md) e cada ferramenta
tem um arquivo apontando para ele.

## Começando

Requer Node.js 20.12+.

```bash
npm install
```

Depois, na sua IA, com esta pasta aberta:

- **Claude Code:** `/criar-servidor comunidade de fotografia com área VIP`
- **Qualquer outra:** cole o prompt de [prompts/criar-servidor.md](prompts/criar-servidor.md)

Para aplicar no Discord você precisa de um bot (uma vez só, ~3 min): [docs/SETUP-BOT.md](docs/SETUP-BOT.md).

## Sem IA

```bash
npm run templates              # Visual_01, Visual_02 e outros templates
npm run init -- Visual_01      # cria server.yaml com a base padrão
# edite server.yaml
npm run validate               # valida o arquivo
npm run plan                   # mostra o que vai mudar no servidor
npm run apply                  # aplica (pede confirmação)
```

Já tem um servidor? `npm run export -- --out server.yaml` gera o blueprint dele para você versionar e editar.

## Estilos reutilizáveis

- **Visual_01** usa canais como `『📌』│audit` e categorias como `▲───◇ IMPORTANT ◇───▲`.
- **Visual_02** usa categorias simples e canais como `╭「🎮」game-news`, `│「👀」sneak-peeks` e `╰「🎴」polls`.

Ambos incluem os cargos Moderator, Support, Tester, Content Creator, Portuguese,
English e Update Notifications. A IA adapta a estrutura à sua comunidade e pode acrescentar
canais e cargos conforme seus pedidos. Visual_02 inclui fóruns que exigem modo Comunidade.

Cada pessoa deve configurar seu próprio bot e servidor conforme [docs/SETUP-BOT.md](docs/SETUP-BOT.md).
O `.env` com credenciais e o `server.yaml` local são ignorados pelo Git para compartilhar
o framework com segurança. Os templates públicos ficam em `templates/`.

## Exemplo de blueprint

```yaml
server:
  name: Clube do Livro
  systemChannel: boas-vindas

roles:
  - name: Organizador
    color: "#e67e22"
    hoist: true
    permissions: [Administrator]
  - name: Leitor

categories:
  - name: 📌 Início
    readonly: true
    channels:
      - name: boas-vindas
      - name: regras
        messages:
          - embed: { title: Regras, description: "Sem spoilers fora de #spoilers." }
            pin: true
  - name: 📚 Leituras
    channels:
      - name: livro-do-mes
      - name: spoilers
      - name: Encontro
        type: voice
```

Formato completo: [docs/BLUEPRINT.md](docs/BLUEPRINT.md) · Permissões: [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

## Garantias

- **Nada muda sem plano.** `apply` sempre mostra o plano e pede confirmação.
- **Idempotente.** Rodar `apply` de novo com o mesmo arquivo não faz nada; se falhar no meio, rode de novo.
- **Não destrutivo por padrão.** Canais e cargos que não estão no blueprint são mantidos.
  Só são removidos com `--prune`, explicitamente.
- **Mensagens não duplicam.** Regras e boas-vindas são publicadas uma vez.

## Estrutura

```
AGENTS.md              instruções para a IA (CLAUDE.md, GEMINI.md, .cursor, .github... apontam aqui)
prompts/               prompt universal para colar em qualquer IA
.claude/commands/      comando /criar-servidor do Claude Code
schema/                JSON Schema do blueprint (autocomplete no editor)
templates/             blueprints prontos
docs/                  formato, permissões e setup do bot
src/
  cli.js               comandos
  blueprint.js         leitura, validação e normalização
  reconcile.js         compara blueprint × servidor e aplica as diferenças
  export.js            servidor → blueprint
  client.js            conexão com o Discord
test/                  testes com um servidor falso em memória (npm test)
```

## Fora do escopo (por enquanto)

O blueprint cuida da **estrutura** do servidor. Comportamento em tempo real — boas-vindas
automáticas, automod, tickets, XP, reaction roles — precisa de um bot rodando continuamente.
