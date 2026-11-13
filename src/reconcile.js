import {
  ChannelType,
  GuildDefaultMessageNotifications,
  GuildVerificationLevel,
  OverwriteType,
} from 'discord.js';
import { EVERYONE } from './blueprint.js';

export const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  announcement: ChannelType.GuildAnnouncement,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum,
};

const VERIFICATION = {
  none: GuildVerificationLevel.None,
  low: GuildVerificationLevel.Low,
  medium: GuildVerificationLevel.Medium,
  high: GuildVerificationLevel.High,
  very_high: GuildVerificationLevel.VeryHigh,
};

const NOTIFICATIONS = {
  all: GuildDefaultMessageNotifications.AllMessages,
  mentions: GuildDefaultMessageNotifications.OnlyMentions,
};

const REASON = 'discord-forge: aplicando blueprint';

/** Lista de ações. Em dry-run apenas registra; caso contrário executa e registra o resultado. */
class Plan {
  constructor(dryRun, onAction) {
    this.dryRun = dryRun;
    this.onAction = onAction;
    this.actions = [];
  }

  async run(op, kind, name, detail, fn) {
    const action = { op, kind, name, detail, status: this.dryRun ? 'planned' : 'done' };
    let result;
    if (!this.dryRun) {
      try {
        result = await fn();
      } catch (err) {
        action.status = 'failed';
        action.error = err.message;
      }
    }
    this.push(action);
    return result;
  }

  note(op, message) {
    this.push({ op, kind: 'note', name: message, status: 'info' });
  }

  push(action) {
    this.actions.push(action);
    this.onAction?.(action);
  }
}

/**
 * Leva o servidor ao estado descrito pelo blueprint.
 * Com dryRun=true nada é alterado: o retorno descreve o que seria feito.
 */
export async function reconcile(guild, bp, { dryRun = true, prune = false, onAction } = {}) {
  const plan = new Plan(dryRun, onAction);
  const me = guild.members.me;
  const botId = guild.client.user.id;

  // Servidor
  const serverEdits = {};
  const serverChanges = [];
  const { server } = bp;
  if (guild.name !== server.name) {
    serverEdits.name = server.name;
    serverChanges.push(`nome "${guild.name}" → "${server.name}"`);
  }
  if (server.verificationLevel && guild.verificationLevel !== VERIFICATION[server.verificationLevel]) {
    serverEdits.verificationLevel = VERIFICATION[server.verificationLevel];
    serverChanges.push(`verificação → ${server.verificationLevel}`);
  }
  if (server.defaultNotifications && guild.defaultMessageNotifications !== NOTIFICATIONS[server.defaultNotifications]) {
    serverEdits.defaultMessageNotifications = NOTIFICATIONS[server.defaultNotifications];
    serverChanges.push(`notificações → ${server.defaultNotifications}`);
  }
  if (server.afkTimeout && guild.afkTimeout !== server.afkTimeout) {
    serverEdits.afkTimeout = server.afkTimeout;
    serverChanges.push(`afkTimeout → ${server.afkTimeout}s`);
  }
  if (serverChanges.length) {
    await plan.run('update', 'server', guild.name, serverChanges.join(', '), () => guild.edit({ ...serverEdits, reason: REASON }));
  }

  // @everyone
  const everyone = guild.roles.everyone;
  if (bp.everyonePermissions !== null && everyone.permissions.bitfield !== bp.everyonePermissions) {
    await plan.run('update', 'role', EVERYONE, 'permissões', () => everyone.setPermissions(bp.everyonePermissions, REASON));
  }

  // Cargos
  const roleIds = new Map([[EVERYONE, guild.id]]);
  const claimedRoles = new Set();
  const unmanagedRoles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed);
  let createdRoles = 0;

  for (const desired of bp.roles) {
    const current = unmanagedRoles.find((r) => r.name === desired.name && !claimedRoles.has(r.id));
    if (!current) {
      createdRoles++;
      const role = await plan.run('create', 'role', desired.name, null, () =>
        guild.roles.create({
          name: desired.name,
          colors: { primaryColor: desired.color },
          hoist: desired.hoist,
          mentionable: desired.mentionable,
          permissions: desired.permissions,
          reason: REASON,
        }),
      );
      if (role) {
        roleIds.set(desired.name, role.id);
        claimedRoles.add(role.id);
      }
      continue;
    }

    claimedRoles.add(current.id);
    roleIds.set(desired.name, current.id);
    const changes = [];
    if (current.colors.primaryColor !== desired.color) changes.push('cor');
    if (current.hoist !== desired.hoist) changes.push('hoist');
    if (current.mentionable !== desired.mentionable) changes.push('mentionable');
    if (current.permissions.bitfield !== desired.permissions) changes.push('permissões');
    if (!changes.length) continue;
    if (current.position >= me.roles.highest.position) {
      plan.note('warn', `cargo "${desired.name}" está acima do cargo do bot e não pode ser editado; arraste o cargo do bot para o topo`);
      continue;
    }
    await plan.run('update', 'role', desired.name, changes.join(', '), () =>
      current.edit({
        colors: { primaryColor: desired.color },
        hoist: desired.hoist,
        mentionable: desired.mentionable,
        permissions: desired.permissions,
        reason: REASON,
      }),
    );
  }

  const orderedRoles = bp.roles.map((r) => guild.roles.cache.get(roleIds.get(r.name))).filter(Boolean);
  if ((dryRun && createdRoles > 0) || isOutOfOrder(orderedRoles, (r) => -r.position)) {
    await plan.run('update', 'order', 'cargos', 'hierarquia conforme o blueprint', () => {
      const top = me.roles.highest.position;
      return guild.roles.setPositions(orderedRoles.map((role, i) => ({ role, position: Math.max(1, top - 1 - i) })));
    });
  }

  const resolveOverwrites = (map) => {
    const list = [];
    let complete = true;
    for (const [roleName, { allow, deny }] of map) {
      const id = roleIds.get(roleName);
      if (!id) complete = false;
      else if (allow || deny) list.push({ id, type: OverwriteType.Role, allow, deny });
    }
    return { list, complete };
  };

  const setOverwrites = (channel, list) => {
    // Overwrites de membros específicos não são gerenciados pelo blueprint: preserva.
    const members = channel.permissionOverwrites.cache
      .filter((o) => o.type === OverwriteType.Member)
      .map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield }));
    return channel.permissionOverwrites.set([...members, ...list], REASON);
  };

  // Categorias
  const claimedChannels = new Set();
  const categories = new Map();
  const changedCategories = new Set();

  for (const desired of bp.categories) {
    const current = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === desired.name && !claimedChannels.has(c.id),
    );
    const { list, complete } = resolveOverwrites(desired.overwrites);
    if (!current) {
      changedCategories.add(desired.name);
      const created = await plan.run('create', 'category', desired.name, null, () =>
        guild.channels.create({ name: desired.name, type: ChannelType.GuildCategory, permissionOverwrites: list, reason: REASON }),
      );
      if (created) {
        categories.set(desired.name, created);
        claimedChannels.add(created.id);
      }
      continue;
    }
    claimedChannels.add(current.id);
    categories.set(desired.name, current);
    if (!complete || !sameOverwrites(current, list)) {
      changedCategories.add(desired.name);
      await plan.run('update', 'category', desired.name, 'permissões', () => setOverwrites(current, list));
    }
  }

  // Canais
  const desiredChannels = [
    ...bp.categories.flatMap((cat) => cat.channels.map((channel) => ({ channel, parentName: cat.name }))),
    ...bp.channels.map((channel) => ({ channel, parentName: null })),
  ];
  const matches = matchChannels(guild, desiredChannels, categories, claimedChannels);
  const channelsByParent = new Map();
  const textByName = new Map();
  const voiceByName = new Map();

  for (const entry of desiredChannels) {
    const { channel: desired, parentName } = entry;
    const parent = parentName ? categories.get(parentName) : null;
    const label = parentName ? `${parentName} / ${desired.name}` : desired.name;
    let current = matches.get(entry);

    if (!current) {
      const overwrites = desired.overwrites && resolveOverwrites(desired.overwrites).list;
      current = await plan.run('create', 'channel', label, desired.type, () =>
        guild.channels.create({
          name: desired.name,
          type: CHANNEL_TYPES[desired.type],
          parent: parent?.id,
          topic: desired.topic,
          nsfw: desired.nsfw,
          rateLimitPerUser: desired.slowmode,
          userLimit: desired.userLimit,
          bitrate: desired.bitrate,
          permissionOverwrites: overwrites ?? undefined,
          reason: REASON,
        }),
      );
    } else {
      const edits = {};
      const changes = [];
      const check = (key, currentValue, desiredValue, label = key) => {
        if (desiredValue !== undefined && (currentValue ?? null) !== desiredValue) {
          edits[key] = desiredValue;
          changes.push(label);
        }
      };
      check('topic', current.topic, desired.topic);
      check('nsfw', current.nsfw, desired.nsfw);
      check('rateLimitPerUser', current.rateLimitPerUser, desired.slowmode, 'slowmode');
      check('userLimit', current.userLimit, desired.userLimit);
      check('bitrate', current.bitrate, desired.bitrate);

      const moving = parentName ? current.parentId !== parent?.id : current.parentId !== null;
      if (moving) {
        edits.parent = parent?.id ?? null;
        changes.push(parentName ? `mover para "${parentName}"` : 'remover da categoria');
      }
      if (changes.length) {
        const channel = current;
        await plan.run('update', 'channel', label, changes.join(', '), () => channel.edit({ ...edits, reason: REASON }));
      }

      if (desired.overwrites === null) {
        const outOfSync = moving || changedCategories.has(parentName) || !current.permissionsLocked;
        if (outOfSync) {
          const channel = current;
          await plan.run('update', 'channel', label, 'sincronizar permissões com a categoria', () =>
            // Relê o canal: edições anteriores podem ter mudado a categoria.
            guild.channels.cache.get(channel.id).lockPermissions(),
          );
        }
      } else {
        const { list, complete } = resolveOverwrites(desired.overwrites);
        if (!complete || !sameOverwrites(current, list)) {
          const channel = current;
          await plan.run('update', 'channel', label, 'permissões', () => setOverwrites(channel, list));
        }
      }
    }

    if (current) {
      claimedChannels.add(current.id);
      if (!channelsByParent.has(parentName)) channelsByParent.set(parentName, []);
      channelsByParent.get(parentName).push(current);
      if (desired.type === 'text' || desired.type === 'announcement') textByName.set(desired.name, current);
      if (desired.type === 'voice') voiceByName.set(desired.name, current);
    }
    entry.current = current;
  }

  // Ordem
  const orderedCategories = bp.categories.map((c) => categories.get(c.name)).filter(Boolean);
  if (isOutOfOrder(orderedCategories, (c) => c.rawPosition)) {
    await plan.run('update', 'order', 'categorias', 'ordem conforme o blueprint', () =>
      guild.channels.setPositions(orderedCategories.map((channel, i) => ({ channel, position: i }))),
    );
  }
  for (const [parentName, children] of channelsByParent) {
    if (!parentName) continue;
    // O Discord exibe canais de texto antes dos de voz, então cada grupo é comparado separadamente.
    const texts = children.filter((c) => !isVoiceChannel(c));
    const voices = children.filter(isVoiceChannel);
    if (isOutOfOrder(texts, (c) => c.rawPosition) || isOutOfOrder(voices, (c) => c.rawPosition)) {
      await plan.run('update', 'order', parentName, 'ordem dos canais', () =>
        guild.channels.setPositions(children.map((channel, i) => ({ channel, position: i }))),
      );
    }
  }

  // Mensagens
  for (const { channel: desired, parentName, current } of desiredChannels) {
    if (!desired.messages.length) continue;
    const existing = new Set();
    if (current) {
      try {
        const recent = await current.messages.fetch({ limit: 100 });
        for (const m of recent.values()) {
          if (m.author.id === botId) existing.add(signature(m.content, m.embeds[0]));
        }
      } catch {
        // Canal recém-criado em dry-run ou sem acesso ao histórico.
      }
    }
    const label = parentName ? `${parentName} / ${desired.name}` : desired.name;
    for (const message of desired.messages) {
      if (existing.has(signature(message.content, message.embed))) continue;
      const preview = (message.embed?.title ?? message.content ?? '').split('\n')[0].slice(0, 50);
      await plan.run('create', 'message', label, preview, async () => {
        if (!current) throw new Error('canal não existe');
        const sent = await current.send(messagePayload(message));
        if (message.pin) await sent.pin(REASON);
      });
    }
  }

  // Canais especiais do servidor (dependem dos canais já existirem)
  const channelEdits = {};
  const channelChanges = [];
  if (server.systemChannel) {
    const channel = textByName.get(server.systemChannel);
    if (!channel || guild.systemChannelId !== channel.id) {
      channelEdits.systemChannel = channel?.id;
      channelChanges.push(`systemChannel → #${server.systemChannel}`);
    }
  }
  if (server.afkChannel) {
    const channel = voiceByName.get(server.afkChannel);
    if (!channel || guild.afkChannelId !== channel.id) {
      channelEdits.afkChannel = channel?.id;
      channelChanges.push(`afkChannel → ${server.afkChannel}`);
    }
  }
  if (channelChanges.length) {
    await plan.run('update', 'server', guild.name, channelChanges.join(', '), () => guild.edit({ ...channelEdits, reason: REASON }));
  }

  // Itens fora do blueprint
  const extraChannels = guild.channels.cache.filter((c) => !c.isThread() && !claimedChannels.has(c.id));
  const extraRoles = guild.roles.cache.filter(
    (r) => r.id !== guild.id && !r.managed && !claimedRoles.has(r.id),
  );
  if (prune) {
    const sorted = [...extraChannels.values()].sort((a, b) => Number(a.type === ChannelType.GuildCategory) - Number(b.type === ChannelType.GuildCategory));
    for (const channel of sorted) {
      const kind = channel.type === ChannelType.GuildCategory ? 'category' : 'channel';
      await plan.run('delete', kind, channel.name, null, () => channel.delete(REASON));
    }
    for (const role of extraRoles.values()) {
      if (role.position >= me.roles.highest.position) {
        plan.note('warn', `cargo "${role.name}" está acima do bot e não pode ser removido`);
        continue;
      }
      await plan.run('delete', 'role', role.name, null, () => role.delete(REASON));
    }
  } else if (extraChannels.size || extraRoles.size) {
    plan.note('info', `${extraChannels.size} canal(is) e ${extraRoles.size} cargo(s) existem no servidor mas não no blueprint (mantidos; use --prune para remover)`);
  }

  return plan.actions;
}

/**
 * Associa cada canal desejado a um canal existente. Primeiro pela combinação exata
 * (nome, tipo, categoria); depois, só por nome e tipo, para detectar canais que mudaram de categoria.
 */
function matchChannels(guild, desiredChannels, categories, claimed) {
  const matches = new Map();
  const candidates = guild.channels.cache.filter((c) => !c.isThread() && c.type !== ChannelType.GuildCategory);
  const pick = (entry, sameParent) => {
    const parentId = entry.parentName ? categories.get(entry.parentName)?.id : null;
    const found = candidates.find(
      (c) =>
        !claimed.has(c.id) &&
        c.type === CHANNEL_TYPES[entry.channel.type] &&
        c.name === entry.channel.name &&
        (!sameParent || (parentId !== undefined && c.parentId === parentId)),
    );
    if (found) {
      claimed.add(found.id);
      matches.set(entry, found);
    }
  };
  for (const entry of desiredChannels) pick(entry, true);
  for (const entry of desiredChannels) if (!matches.has(entry)) pick(entry, false);
  return matches;
}

function isVoiceChannel(channel) {
  return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
}

function isOutOfOrder(items, key) {
  const sorted = [...items].sort((a, b) => key(a) - key(b));
  return items.some((item, i) => item !== sorted[i]);
}

function sameOverwrites(channel, list) {
  const current = channel.permissionOverwrites.cache.filter((o) => o.type === OverwriteType.Role);
  if (current.size !== list.length) return false;
  return list.every((d) => {
    const o = current.get(d.id);
    return o && o.allow.bitfield === d.allow && o.deny.bitfield === d.deny;
  });
}

function signature(content, embed) {
  return JSON.stringify([(content ?? '').trim(), embed?.title ?? '', (embed?.description ?? '').trim()]);
}

function messagePayload(message) {
  const payload = {};
  if (message.content) payload.content = message.content;
  if (message.embed) {
    const { title, description, color, footer, fields } = message.embed;
    payload.embeds = [
      {
        title,
        description,
        color: color ? parseInt(color.slice(1), 16) : undefined,
        footer: footer ? { text: footer } : undefined,
        fields,
      },
    ];
  }
  return payload;
}
