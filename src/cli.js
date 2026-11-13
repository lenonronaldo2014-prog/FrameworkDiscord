#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';
import { BlueprintError, loadBlueprint } from './blueprint.js';
import { SetupError, connect, missingPermissions } from './client.js';
import { exportGuild } from './export.js';
import { reconcile } from './reconcile.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));
const DEFAULT_FILE = 'server.yaml';

const HELP = `
discord-forge — servidores do Discord como código

Uso: npm run <comando> -- [opções]

Comandos:
  templates                 Lista os templates disponíveis
  init [template]           Cria server.yaml a partir de um template (padrão: minimal)
  validate [arquivo]        Valida o blueprint sem conectar ao Discord
  check                     Testa token, acesso ao servidor e permissões do bot
  plan [arquivo]            Mostra o que seria alterado no servidor (não altera nada)
  apply [arquivo]           Aplica o blueprint no servidor
  export                    Gera um blueprint a partir do servidor atual

Opções:
  --out <arquivo>           Destino de init/export
  --guild <id>              Sobrescreve DISCORD_GUILD_ID
  --prune                   (plan/apply) remove canais e cargos que não estão no blueprint
  --yes, -y                 (apply) não pede confirmação
  --force                   (init) sobrescreve o arquivo existente
  --json                    (validate/plan) saída em JSON, útil para IAs
`;

const SYMBOLS = {
  create: ['+', 'green'],
  update: ['~', 'yellow'],
  delete: ['-', 'red'],
  warn: ['!', 'magenta'],
  info: ['i', 'cyan'],
};

const KIND_LABELS = {
  server: 'servidor',
  role: 'cargo',
  order: 'ordem',
  category: 'categoria',
  channel: 'canal',
  message: 'mensagem',
};

function printAction(action) {
  const [symbol, color] = SYMBOLS[action.op];
  if (action.kind === 'note') {
    console.log(styleText(color, `  ${symbol} ${action.name}`));
    return;
  }
  const detail = action.detail ? styleText('dim', ` (${action.detail})`) : '';
  const failed = action.status === 'failed' ? styleText('red', ` ✗ ${action.error}`) : '';
  console.log(`  ${styleText(color, symbol)} ${KIND_LABELS[action.kind].padEnd(9)} ${action.name}${detail}${failed}`);
}

function summarize(actions) {
  const count = (op) => actions.filter((a) => a.op === op && a.kind !== 'note').length;
  const failed = actions.filter((a) => a.status === 'failed').length;
  const parts = [`${count('create')} a criar`, `${count('update')} a alterar`, `${count('delete')} a remover`];
  return { changes: count('create') + count('update') + count('delete'), failed, text: parts.join(', ') };
}

function readBlueprint(file, json) {
  const { blueprint, warnings } = loadBlueprint(file);
  if (!json) for (const w of warnings) console.log(styleText('yellow', `  ! ${w}`));
  return { blueprint, warnings };
}

async function withGuild(values, fn) {
  const { client, guild } = await connect({ guildId: values.guild });
  try {
    return await fn(guild);
  } finally {
    await client.destroy();
  }
}

const commands = {
  templates() {
    for (const file of readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.yaml'))) {
      const firstLine = readFileSync(TEMPLATES_DIR + file, 'utf8').split('\n').find((l) => l.startsWith('# ') && !l.includes('yaml-language-server'));
      console.log(`  ${file.replace('.yaml', '').padEnd(12)} ${styleText('dim', firstLine?.slice(2) ?? '')}`);
    }
  },

  init([template = 'minimal'], values) {
    const source = `${TEMPLATES_DIR}${template}.yaml`;
    const out = values.out ?? DEFAULT_FILE;
    if (!existsSync(source)) throw new SetupError(`template "${template}" não existe. Rode "npm run templates".`);
    if (existsSync(out) && !values.force) throw new SetupError(`${out} já existe. Use --force para sobrescrever.`);
    // Templates apontam para ../schema; o blueprint fica na raiz do projeto.
    writeFileSync(out, readFileSync(source, 'utf8').replace('$schema=../schema/', '$schema=./schema/'));
    console.log(styleText('green', `✓ ${out} criado a partir do template "${template}".`));
  },

  validate([file = DEFAULT_FILE], values) {
    const { blueprint, warnings } = readBlueprint(file, values.json);
    const channels = blueprint.categories.reduce((n, c) => n + c.channels.length, blueprint.channels.length);
    if (values.json) {
      console.log(JSON.stringify({ valid: true, warnings, roles: blueprint.roles.length, categories: blueprint.categories.length, channels }));
      return;
    }
    console.log(styleText('green', `✓ ${file} válido: ${blueprint.roles.length} cargos, ${blueprint.categories.length} categorias, ${channels} canais.`));
  },

  async check(_, values) {
    await withGuild(values, async (guild) => {
      const me = guild.members.me;
      console.log(styleText('green', `✓ Conectado como ${me.user.tag} no servidor "${guild.name}" (${guild.memberCount} membros)`));
      const missing = missingPermissions(guild);
      if (missing.length) console.log(styleText('red', `✗ Permissões faltando: ${missing.join(', ')}`));
      else console.log(styleText('green', '✓ Permissões do bot OK'));
      const higher = guild.roles.cache.filter((r) => r.position > me.roles.highest.position && !r.managed);
      if (higher.size) {
        console.log(styleText('yellow', `! Cargos acima do bot (não poderão ser editados): ${higher.map((r) => r.name).join(', ')}`));
      }
      const community = guild.features.includes('COMMUNITY');
      console.log(`${community ? '✓' : 'i'} Modo Comunidade: ${community ? 'ativo' : 'inativo (canais announcement/stage indisponíveis)'}`);
    });
  },

  async plan([file = DEFAULT_FILE], values) {
    const { blueprint } = readBlueprint(file, values.json);
    await withGuild(values, async (guild) => {
      const actions = await reconcile(guild, blueprint, { dryRun: true, prune: values.prune });
      if (values.json) {
        console.log(JSON.stringify({ guild: guild.name, actions }));
        return;
      }
      console.log(`Plano para "${guild.name}":`);
      for (const action of actions) printAction(action);
      const { changes, text } = summarize(actions);
      console.log(changes ? `\n${text}. Rode "npm run apply" para aplicar.` : styleText('green', '\n✓ O servidor já está igual ao blueprint.'));
    });
  },

  async apply([file = DEFAULT_FILE], values) {
    const { blueprint } = readBlueprint(file);
    await withGuild(values, async (guild) => {
      const planned = await reconcile(guild, blueprint, { dryRun: true, prune: values.prune });
      console.log(`Plano para "${guild.name}":`);
      for (const action of planned) printAction(action);
      const { changes, text } = summarize(planned);
      if (!changes) {
        console.log(styleText('green', '\n✓ O servidor já está igual ao blueprint.'));
        return;
      }
      console.log(`\n${text}.`);

      if (!values.yes) {
        if (!process.stdin.isTTY) throw new SetupError('confirmação necessária: rode com --yes em ambientes não interativos.');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(values.prune ? styleText('red', 'Aplicar, INCLUINDO remoções? (s/N) ') : 'Aplicar? (s/N) ');
        rl.close();
        if (!/^s(im)?$/i.test(answer.trim())) {
          console.log('Cancelado.');
          return;
        }
      }

      console.log('\nAplicando...');
      const actions = await reconcile(guild, blueprint, { dryRun: false, prune: values.prune, onAction: printAction });
      const { failed } = summarize(actions);
      if (failed) {
        console.log(styleText('red', `\n✗ Concluído com ${failed} falha(s). Corrija e rode apply de novo: o que já foi feito é mantido.`));
        process.exitCode = 1;
      } else {
        console.log(styleText('green', '\n✓ Servidor atualizado.'));
      }
    });
  },

  async export(_, values) {
    const out = values.out ?? 'exported.yaml';
    await withGuild(values, async (guild) => {
      writeFileSync(out, exportGuild(guild));
      console.log(styleText('green', `✓ Blueprint de "${guild.name}" salvo em ${out}.`));
    });
  },
};

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      guild: { type: 'string' },
      prune: { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      force: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [name, ...args] = positionals;
  if (!name || values.help || !commands[name]) {
    console.log(HELP);
    if (name && !commands[name]) process.exitCode = 1;
    return;
  }
  await commands[name](args, values);
}

main().catch((err) => {
  if (err instanceof BlueprintError && process.argv.includes('--json')) {
    console.log(JSON.stringify({ valid: false, errors: err.errors }));
  } else if (err instanceof BlueprintError || err instanceof SetupError) {
    console.error(styleText('red', `✗ ${err.message}`));
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});
