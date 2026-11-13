# Discord Forge — instruções para agentes de IA

Este repositório é um framework para **criar e manter servidores do Discord como código**.
Você (a IA) não cria canais clicando nem chamando a API diretamente: você escreve um
**blueprint** declarativo em `server.yaml`, e a CLI do projeto aplica esse blueprint no
servidor real. Siga este documento sempre que o usuário pedir para criar, montar, organizar,
configurar ou alterar um servidor/grupo/comunidade do Discord.

## Base padrão e identidade visual — Visual_01

O framework já possui uma estrutura padrão reutilizável chamada **Visual_01**, em
`templates/Visual_01.yaml`. Ao apresentar o projeto, informe que essa base está pronta
para personalizar e pode ser ampliada por comandos à IA. Visual_01 é o nome do estilo.

- Canais seguem `『📌』│audit`, com emoji entre `『』`, separador `│` e nome em inglês.
- Categorias seguem `▲───◇ IMPORTANT ◇───▲`, com nomes em inglês entre os ornamentos.
- A ordem padrão é IMPORTANT → MANAGEMENT → COMMUNITY (inclui voz) → STAFF → LOGS.
  MANAGEMENT, STAFF e LOGS são privadas. LOGS fica no final.
- A base não inclui as categorias Functions e Geral Devs nem seus canais de especialidades.
- As regras têm versões em português e inglês. Adapte seu conteúdo à comunidade.
- A base contém somente sete cargos: **Moderator, Support, Tester, Content Creator,
  Portuguese, English e Update Notifications**. Moderator tem permissões específicas
  de moderação. Support acessa a staff. Os demais identificam função, idioma ou interesse.
- Na entrevista, peça uma ideia da estrutura de cargos desejada. Se o usuário escolher
  a base existente ou delegar a escolha, use esses sete cargos como proposta inicial.
  Cargos adicionais podem ser incluídos quando solicitados. Nenhum cargo da base recebe
  Administrator. Owner e cargos de desenvolvimento não fazem parte da base padrão.
- Cargos não são atribuídos automaticamente por esse framework. Logs automáticos,
  seleção de idiomas, notificações e comandos dependem de outro bot ou configuração manual.
- Em servidor existente, exporte primeiro. Exclusões e renomeações exigem cuidado com o
  histórico: o framework identifica itens pelo nome e renomear no YAML cria outro item.
  A ausência de uma área na base não autoriza sua exclusão do servidor real.
- Para compartilhar o projeto, forneça a base Visual_01 e o .env.example vazio.
  Não inclua .env com credenciais nem use o server.yaml de uma comunidade como base genérica.

## Estilo alternativo — Visual_02

O template `templates/Visual_02.yaml` reproduz a segunda referência visual do usuário.
Use `npm run init -- Visual_02` quando esse estilo for solicitado.

- Categorias simples, sem ornamentos: Game Important, Server Important, Community,
  Game Related, Content Creator, Tester e staff.
- Canais usam `╭「🎮」game-news` na abertura, `│「👀」sneak-peeks` no meio e
  `╰「🎴」polls` no encerramento de cada categoria. Nomes em inglês, com portuguese-chat.
- Usa os mesmos sete cargos da base Visual_01. Content Creator, Tester e staff são
  áreas privadas. Moderator e Support têm acesso para atendimento e moderação.
  admin-chat fica restrito a Moderator dentro dessa proposta de sete cargos.
- Suggestions, bug-report, tester-suggestions e tester-bugs são fóruns conforme a referência.
  Confira o modo Comunidade antes de aplicar e proponha canais de texto se o servidor
  não comportar fóruns. CC-VC é voz.
- A estrutura segue a print. O conteúdo das regras e integrações deve ser preparado
  conforme o pedido antes de publicar.

## Fluxo obrigatório

### 1. Entender o servidor (entrevista curta)

Se o pedido do usuário não deixar claro, pergunte **em uma única mensagem** (no máximo 5 perguntas):

1. **Propósito**: comunidade, gaming/clã, estudos/turma, empresa/time, criador de conteúdo, outro?
2. **Nome do servidor** e idioma dos canais.
3. **Tamanho esperado** (10, 100, 10 mil membros?) — define quanto de moderação e estrutura criar.
4. **Hierarquia**: quem administra, se terá moderadores, cargos especiais (VIP, níveis, departamentos, times).
5. **Áreas privadas**: algo que só certos cargos podem ver?

Se o usuário já deu detalhes suficientes ou pediu para você decidir, **não pergunte**: escolha
padrões sensatos e diga quais escolheu.

### 2. Partir de um template

Rode `npm run templates`. A base padrão é **Visual_01**, salvo se o usuário pedir outra.
Crie com `npm run init -- Visual_01`. Para outro template, copie com
`npm run init -- <template>` (use `--force` se `server.yaml` já existir **e** o usuário concordar).
Se nenhum servir, adapte Visual_01 ou use `minimal` se o pedido exigir uma estrutura mínima.

Se o usuário já tem um servidor e quer reorganizá-lo, primeiro rode `npm run export -- --out server.yaml`
para capturar o estado atual e edite a partir dele.

### 3. Escrever o blueprint

Edite `server.yaml` de acordo com o que o usuário quer. Referência completa do formato:
[docs/BLUEPRINT.md](docs/BLUEPRINT.md). Schema formal: [schema/blueprint.schema.json](schema/blueprint.schema.json).
Lista de permissões: [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

### 4. Validar até passar

```bash
npm run validate -- server.yaml --json
```

Corrija todos os erros e rode de novo. Avisos (`warnings`) não bloqueiam, mas leia-os. **Nunca
entregue um blueprint que não passou na validação.**

### 5. Mostrar o plano

Se existir um `.env` com `DISCORD_TOKEN` e `DISCORD_GUILD_ID`, rode:

```bash
npm run check          # confirma token, acesso e permissões do bot
npm run plan -- --json # lista o que será criado/alterado, sem alterar nada
```

Resuma o plano para o usuário em linguagem natural (quantos cargos, categorias, canais e o que muda).

Se não houver `.env`, explique como configurar o bot apontando para
[docs/SETUP-BOT.md](docs/SETUP-BOT.md) e pare aqui: o blueprint está pronto para ser aplicado depois.

### 6. Aplicar (somente com confirmação)

`npm run apply` altera o servidor real. **Só rode depois que o usuário aprovar o plano.**
Em ambiente não interativo use `npm run apply -- --yes`.

- **Nunca use `--prune` sem o usuário pedir explicitamente** para apagar o que não está no blueprint.
  Ele remove canais (com todo o histórico de mensagens) e cargos — é irreversível.
- O apply é idempotente: se falhar no meio, corrija e rode de novo; o que já foi feito é mantido.

## Boas práticas de design de servidor

Aplique estas regras ao montar o blueprint, a menos que o usuário peça outra coisa:

- **Comece enxuto.** Servidores pequenos com 40 canais parecem vazios. Para menos de 50 membros,
  prefira 3–5 categorias e 8–15 canais. Dá para crescer depois.
- **Ordem das categorias**: informações (somente leitura) → conversa → tópicos específicos → voz → staff.
- **Canais de informação** (`regras`, `anuncios`, `boas-vindas`) usam `readonly: true` na categoria
  ou no canal. Publique as regras com `messages` + `pin: true`.
- **Staff** em categoria `private: true`, liberando `ViewChannel` só para os cargos da staff.
- **Hierarquia de cargos**: o primeiro da lista é o mais alto. Deixe um único cargo com
  `Administrator`; moderadores recebem permissões específicas (`KickMembers`, `ModerateMembers`,
  `ManageMessages`...), nunca `Administrator`.
- **Cargos cosméticos** (níveis, interesses) não precisam de `permissions`.
- **`hoist: true`** apenas para cargos que devem aparecer separados na lista de membros (staff, VIP).
- **Nomes de canais de texto** em minúsculas com hífen: `bate-papo`, não `Bate Papo`. Emojis são permitidos.
- **Slowmode** em canais propensos a spam: apresentações (60), divulgação (21600), memes (5).
- **Fórum** (`type: forum`) para dúvidas, sugestões e suporte: cada assunto vira um post.
- **`announcement` e `stage`** só funcionam com o modo Comunidade ativo. Se não souber se está ativo,
  use `text` com `readonly: true` e `voice` no lugar.
- Configure `systemChannel` (onde aparecem as entradas) e, se houver muita voz, um `afkChannel`.
- Em servidores grandes ou públicos use `verificationLevel: medium` ou maior.

## Regras para você, a IA

- Edite **apenas** o blueprint (`server.yaml` ou o arquivo indicado pelo usuário). Não altere `src/`
  para resolver um pedido de servidor; se o framework não suportar algo, diga isso ao usuário.
- Nunca leia, imprima ou peça para o usuário colar o `DISCORD_TOKEN` na conversa. Ele fica só no `.env`.
- Nunca rode `apply` ou `apply --prune` sem aprovação explícita do plano.
- Recursos fora do escopo do blueprint (bots de boas-vindas, automod, tickets, níveis por XP, reaction
  roles, webhooks, emojis, onboarding): explique que precisam de um bot dedicado ou configuração manual
  no Discord e, se fizer sentido, deixe os canais correspondentes prontos no blueprint.

## Comandos

| Comando | O que faz | Precisa de bot? |
| --- | --- | --- |
| `npm run templates` | Lista templates | não |
| `npm run init -- <template>` | Cria `server.yaml` a partir de um template | não |
| `npm run validate -- [arquivo] [--json]` | Valida o blueprint | não |
| `npm run check` | Testa token, acesso e permissões | sim |
| `npm run plan -- [arquivo] [--json] [--prune]` | Mostra o que mudaria (dry-run) | sim |
| `npm run apply -- [arquivo] [--yes] [--prune]` | Aplica no servidor | sim |
| `npm run export -- [--out arquivo]` | Gera blueprint do servidor atual | sim |
| `npm test` | Testes do framework | não |
