import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import YAML from 'yaml';
import {
  PRIVATE_DENY,
  READONLY_DENY,
  canonicalPermission,
  suggestPermission,
  toBits,
} from './permissions.js';

const schemaPath = fileURLToPath(new URL('../schema/blueprint.schema.json', import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validateSchema = new Ajv({ allErrors: true, useDefaults: true }).compile(schema);

export const EVERYONE = '@everyone';
const TEXT_LIKE = new Set(['text', 'announcement', 'forum']);
const VOICE_LIKE = new Set(['voice', 'stage']);
const COMMUNITY_ONLY = new Set(['announcement', 'stage']);

// Limites da API do Discord.
const MAX_ROLES = 250;
const MAX_CHANNELS = 500;
const MAX_PER_CATEGORY = 50;

export class BlueprintError extends Error {
  constructor(errors) {
    super(`Blueprint inválido:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.errors = errors;
  }
}

/** O Discord força nomes de canais de texto para minúsculas e sem espaços. */
export function discordChannelName(name, type) {
  if (!TEXT_LIKE.has(type)) return name.trim();
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function isVoiceLike(type) {
  return VOICE_LIKE.has(type);
}

export function loadBlueprint(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new BlueprintError([`arquivo não encontrado: ${file} (use "npm run init" para criar um)`]);
  }
  let data;
  try {
    data = YAML.parse(raw);
  } catch (err) {
    throw new BlueprintError([`YAML inválido: ${err.message}`]);
  }
  return parseBlueprint(data);
}

/** Valida o objeto e devolve { blueprint, warnings }, com o blueprint normalizado. */
export function parseBlueprint(data) {
  if (!validateSchema(data)) {
    throw new BlueprintError(validateSchema.errors.map(formatAjvError));
  }

  const errors = [];
  const warnings = [];

  const roleNames = new Set();
  for (const role of data.roles ?? []) {
    if (role.name === EVERYONE) errors.push(`roles: "${EVERYONE}" é configurado em "everyone", não em "roles"`);
    if (roleNames.has(role.name)) errors.push(`roles: cargo duplicado "${role.name}"`);
    roleNames.add(role.name);
    checkPermissions(role.permissions, `cargo "${role.name}"`, errors);
  }
  if (roleNames.size > MAX_ROLES) errors.push(`roles: máximo de ${MAX_ROLES} cargos`);
  checkPermissions(data.everyone?.permissions, 'everyone', errors);

  const checkOverwrites = (overwrites = [], where) => {
    for (const ow of overwrites) {
      if (ow.role !== EVERYONE && !roleNames.has(ow.role)) {
        errors.push(`${where}: permissions referencia o cargo "${ow.role}", que não existe em "roles"`);
      }
      checkPermissions(ow.allow, where, errors);
      checkPermissions(ow.deny, where, errors);
      const denied = new Set((ow.deny ?? []).map(canonicalPermission));
      const both = (ow.allow ?? []).filter((p) => denied.has(canonicalPermission(p)));
      if (both.length) errors.push(`${where}: "${ow.role}" tem ${both.join(', ')} em allow e deny ao mesmo tempo`);
    }
  };

  const seenCategories = new Set();
  const seenChannels = new Set();
  const textChannels = new Set();
  const voiceChannels = new Set();
  let channelCount = 0;
  let usesCommunity = false;

  const checkChannel = (channel, parentName) => {
    const type = channel.type ?? 'text';
    const where = `canal "${channel.name}"`;
    const key = `${parentName ?? ''}/${type}/${discordChannelName(channel.name, type)}`;
    if (seenChannels.has(key)) errors.push(`${where}: duplicado na mesma categoria`);
    seenChannels.add(key);
    channelCount++;

    if (TEXT_LIKE.has(type) && /[A-Z\s]/.test(channel.name.trim())) {
      warnings.push(`${where}: o Discord salvará como "${discordChannelName(channel.name, type)}"`);
    }
    if (COMMUNITY_ONLY.has(type)) usesCommunity = true;
    if (!isVoiceLike(type) && (channel.userLimit !== undefined || channel.bitrate !== undefined)) {
      errors.push(`${where}: userLimit/bitrate só valem para canais de voz ou palco`);
    }
    if (type === 'voice' && channel.topic !== undefined) {
      errors.push(`${where}: canais de voz não têm topic`);
    }
    if (channel.messages?.length && !['text', 'announcement'].includes(type)) {
      errors.push(`${where}: messages só são suportadas em canais text ou announcement`);
    }
    if (type === 'text' || type === 'announcement') textChannels.add(discordChannelName(channel.name, type));
    if (type === 'voice') voiceChannels.add(channel.name.trim());
    checkOverwrites(channel.permissions, where);
  };

  for (const category of data.categories ?? []) {
    if (seenCategories.has(category.name)) errors.push(`categoria duplicada "${category.name}"`);
    seenCategories.add(category.name);
    channelCount++;
    checkOverwrites(category.permissions, `categoria "${category.name}"`);
    if ((category.channels?.length ?? 0) > MAX_PER_CATEGORY) {
      errors.push(`categoria "${category.name}": máximo de ${MAX_PER_CATEGORY} canais`);
    }
    for (const channel of category.channels ?? []) checkChannel(channel, category.name);
  }
  for (const channel of data.channels ?? []) checkChannel(channel, null);
  if (channelCount > MAX_CHANNELS) errors.push(`máximo de ${MAX_CHANNELS} canais + categorias`);

  const { systemChannel, afkChannel } = data.server;
  if (systemChannel && !textChannels.has(discordChannelName(systemChannel, 'text'))) {
    errors.push(`server.systemChannel: canal de texto "${systemChannel}" não existe no blueprint`);
  }
  if (afkChannel && !voiceChannels.has(afkChannel.trim())) {
    errors.push(`server.afkChannel: canal de voz "${afkChannel}" não existe no blueprint`);
  }
  if (usesCommunity) {
    warnings.push('canais announcement/stage exigem o modo Comunidade ativo no servidor (Configurações > Ativar Comunidade)');
  }

  if (errors.length) throw new BlueprintError(errors);
  return { blueprint: normalize(data), warnings };
}

function checkPermissions(names = [], where, errors) {
  for (const name of names) {
    if (canonicalPermission(name)) continue;
    const hint = suggestPermission(name);
    errors.push(`${where}: permissão desconhecida "${name}"${hint.length ? ` (quis dizer ${hint.join(', ')}?)` : ''}`);
  }
}

function formatAjvError(err) {
  const path = err.instancePath.replace(/^\//, '').replaceAll('/', '.') || '(raiz)';
  if (err.keyword === 'additionalProperties') return `${path}: campo desconhecido "${err.params.additionalProperty}"`;
  if (err.keyword === 'enum') return `${path}: deve ser um de ${err.params.allowedValues.join(', ')}`;
  return `${path}: ${err.message}`;
}

/**
 * Overwrites são representados como Map<nomeDoCargo, { allow: bigint, deny: bigint }>.
 * Retorna null quando o canal deve apenas sincronizar com a categoria.
 */
function buildOverwrites(node, base) {
  const hasOwn = node.private || node.readonly || node.permissions?.length;
  if (!hasOwn) return base ? null : new Map();

  const result = new Map();
  for (const [role, ow] of base ?? []) result.set(role, { ...ow });

  const apply = (role, allow, deny) => {
    const current = result.get(role) ?? { allow: 0n, deny: 0n };
    current.allow = (current.allow & ~deny) | allow;
    current.deny = (current.deny & ~allow) | deny;
    result.set(role, current);
  };

  if (node.private) apply(EVERYONE, 0n, PRIVATE_DENY);
  if (node.readonly) apply(EVERYONE, 0n, READONLY_DENY);
  for (const ow of node.permissions ?? []) apply(ow.role, toBits(ow.allow), toBits(ow.deny));
  return result;
}

function normalizeChannel(channel, categoryOverwrites) {
  const type = channel.type ?? 'text';
  return {
    name: discordChannelName(channel.name, type),
    type,
    topic: channel.topic,
    nsfw: channel.nsfw,
    slowmode: channel.slowmode,
    userLimit: channel.userLimit,
    bitrate: channel.bitrate,
    overwrites: buildOverwrites(channel, categoryOverwrites),
    messages: channel.messages ?? [],
  };
}

function normalize(data) {
  return {
    server: {
      ...data.server,
      systemChannel: data.server.systemChannel && discordChannelName(data.server.systemChannel, 'text'),
      afkChannel: data.server.afkChannel?.trim(),
    },
    everyonePermissions: data.everyone?.permissions ? toBits(data.everyone.permissions) : null,
    roles: (data.roles ?? []).map((role) => ({
      name: role.name,
      color: role.color ? parseInt(role.color.slice(1), 16) : 0,
      hoist: role.hoist ?? false,
      mentionable: role.mentionable ?? false,
      permissions: toBits(role.permissions),
    })),
    categories: (data.categories ?? []).map((category) => {
      const overwrites = buildOverwrites(category, null);
      return {
        name: category.name,
        overwrites,
        channels: (category.channels ?? []).map((ch) => normalizeChannel(ch, overwrites)),
      };
    }),
    channels: (data.channels ?? []).map((ch) => normalizeChannel(ch, null)),
  };
}
