import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import YAML from 'yaml';
import { loadBlueprint, parseBlueprint } from '../src/blueprint.js';
import { exportGuild } from '../src/export.js';
import { reconcile } from '../src/reconcile.js';
import { createFakeGuild } from './fake-guild.js';

const changes = (actions) => actions.filter((a) => a.kind !== 'note');

for (const file of readdirSync('templates')) {
  test(`${file}: aplica sem falhas e uma segunda execução não muda nada`, async () => {
    const { blueprint } = loadBlueprint(`templates/${file}`);
    const guild = createFakeGuild();

    const planned = changes(await reconcile(guild, blueprint, { dryRun: true }));
    assert.equal(guild.log.length, 0, 'dry-run não pode alterar o servidor');
    assert.ok(planned.length > 0);

    const applied = await reconcile(guild, blueprint, { dryRun: false });
    assert.deepEqual(applied.filter((a) => a.status === 'failed'), []);

    const again = changes(await reconcile(guild, blueprint, { dryRun: true }));
    assert.deepEqual(again, [], 'o servidor deveria estar igual ao blueprint');
  });
}

test('cargos ficam na ordem do blueprint, abaixo do bot', async () => {
  const { blueprint } = loadBlueprint('templates/comunidade.yaml');
  const guild = createFakeGuild();
  await reconcile(guild, blueprint, { dryRun: false });
  const names = [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => r.name);
  assert.deepEqual(names, blueprint.roles.map((r) => r.name));
  const bot = guild.members.me.roles.highest;
  assert.ok([...guild.roles.cache.values()].every((r) => r === bot || r.position < bot.position));
});

test('mudanças no blueprint geram apenas as alterações necessárias', async () => {
  const base = YAML.parse(await import('node:fs').then((fs) => fs.readFileSync('templates/minimal.yaml', 'utf8')));
  const guild = createFakeGuild();
  await reconcile(guild, parseBlueprint(base).blueprint, { dryRun: false });

  base.categories[1].channels[0].topic = 'Novo tópico';
  base.roles.push({ name: 'Novo Cargo' });
  const actions = changes(await reconcile(guild, parseBlueprint(base).blueprint, { dryRun: true }));
  assert.deepEqual(
    actions.map((a) => `${a.op} ${a.kind} ${a.name}`),
    ['create role Novo Cargo', 'update order cargos', 'update channel 💬 Conversa / geral'],
  );
});

test('--prune remove o que não está no blueprint; sem ele, só avisa', async () => {
  const guild = createFakeGuild();
  await guild.channels.create({ name: 'antigo', type: 0 });
  await guild.roles.create({ name: 'Velho' });
  const { blueprint } = parseBlueprint({ server: { name: 'Teste' }, channels: [{ name: 'geral' }] });

  const kept = await reconcile(guild, blueprint, { dryRun: false });
  assert.ok(kept.some((a) => a.kind === 'note' && a.name.includes('--prune')));
  assert.ok(guild.channels.cache.some((c) => c.name === 'antigo'));

  await reconcile(guild, blueprint, { dryRun: false, prune: true });
  assert.ok(!guild.channels.cache.some((c) => c.name === 'antigo'));
  assert.ok(!guild.roles.cache.some((r) => r.name === 'Velho'));
  assert.ok(guild.roles.cache.some((r) => r.managed), 'cargo do bot é preservado');
});

test('export gera um blueprint que reaplica sem mudanças', async () => {
  const { blueprint } = loadBlueprint('templates/gaming.yaml');
  const guild = createFakeGuild();
  await reconcile(guild, blueprint, { dryRun: false });

  const exported = parseBlueprint(YAML.parse(exportGuild(guild))).blueprint;
  const actions = changes(await reconcile(guild, exported, { dryRun: true }));
  assert.deepEqual(actions, []);
});
