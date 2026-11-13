import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { BlueprintError, loadBlueprint, parseBlueprint } from '../src/blueprint.js';

const errorsOf = (data) => {
  try {
    parseBlueprint(data);
  } catch (err) {
    if (err instanceof BlueprintError) return err.errors;
    throw err;
  }
  return [];
};

test('todos os templates são válidos', () => {
  for (const file of readdirSync('templates')) loadBlueprint(`templates/${file}`);
});

test('campos desconhecidos e tipos inválidos são rejeitados', () => {
  const errors = errorsOf({ server: { name: 'Teste' }, categories: [{ name: 'A', channels: [{ name: 'a', type: 'video', foo: 1 }] }] });
  assert.ok(errors.some((e) => e.includes('campo desconhecido "foo"')));
  assert.ok(errors.some((e) => e.includes('deve ser um de')));
});

test('permissão inválida sugere a correta', () => {
  const [error] = errorsOf({ server: { name: 'Teste' }, roles: [{ name: 'Mod', permissions: ['Kick'] }] });
  assert.match(error, /KickMembers/);
});

test('permissões aceitam variações de caixa', () => {
  const { blueprint } = parseBlueprint({ server: { name: 'Teste' }, roles: [{ name: 'Mod', permissions: ['kick_members'] }] });
  assert.equal(blueprint.roles[0].permissions, PermissionFlagsBits.KickMembers);
});

test('referência a cargo inexistente é erro', () => {
  const errors = errorsOf({ server: { name: 'Teste' }, categories: [{ name: 'A', permissions: [{ role: 'Fantasma', allow: ['ViewChannel'] }] }] });
  assert.match(errors[0], /Fantasma/);
});

test('systemChannel precisa existir', () => {
  const errors = errorsOf({ server: { name: 'Teste', systemChannel: 'nada' } });
  assert.match(errors[0], /systemChannel/);
});

test('nomes de canais de texto são normalizados como o Discord faz', () => {
  const { blueprint, warnings } = parseBlueprint({ server: { name: 'Teste' }, channels: [{ name: 'Bate Papo' }, { name: 'Sala 1', type: 'voice' }] });
  assert.equal(blueprint.channels[0].name, 'bate-papo');
  assert.equal(blueprint.channels[1].name, 'Sala 1');
  assert.equal(warnings.length, 1);
});

test('canal herda overwrites da categoria e aplica os próprios por cima', () => {
  const { blueprint } = parseBlueprint({
    server: { name: 'Teste' },
    roles: [{ name: 'Mod' }],
    categories: [
      {
        name: 'Staff',
        private: true,
        permissions: [{ role: 'Mod', allow: ['ViewChannel'] }],
        channels: [{ name: 'chat' }, { name: 'logs', readonly: true }],
      },
    ],
  });
  const [chat, logs] = blueprint.categories[0].channels;
  assert.equal(chat.overwrites, null, 'sem permissões próprias = sincroniza com a categoria');
  assert.equal(logs.overwrites.get('Mod').allow, PermissionFlagsBits.ViewChannel);
  const everyone = logs.overwrites.get('@everyone');
  assert.ok(everyone.deny & PermissionFlagsBits.ViewChannel);
  assert.ok(everyone.deny & PermissionFlagsBits.SendMessages);
});
