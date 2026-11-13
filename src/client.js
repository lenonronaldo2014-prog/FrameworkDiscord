import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';

export class SetupError extends Error {}

export function loadEnv() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env é opcional: as variáveis podem vir do ambiente.
  }
}

/** Faz login e devolve { client, guild } com cargos, canais e o membro do bot em cache. */
export async function connect({ guildId } = {}) {
  loadEnv();
  const token = process.env.DISCORD_TOKEN;
  const id = guildId ?? process.env.DISCORD_GUILD_ID;
  if (!token) throw new SetupError('DISCORD_TOKEN não definido. Copie .env.example para .env e preencha (veja docs/SETUP-BOT.md).');
  if (!id) throw new SetupError('DISCORD_GUILD_ID não definido. Ative o Modo Desenvolvedor, clique com o botão direito no servidor e "Copiar ID".');

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const ready = new Promise((resolve) => client.once(Events.ClientReady, resolve));
  try {
    await client.login(token);
  } catch (err) {
    throw new SetupError(err.code === 'TokenInvalid' ? 'DISCORD_TOKEN inválido. Gere um novo em Developer Portal > Bot > Reset Token.' : err.message);
  }
  await ready;

  let guild;
  try {
    guild = await client.guilds.fetch(id);
  } catch {
    await client.destroy();
    throw new SetupError(`O bot não está no servidor ${id}. Convide-o com o link de docs/SETUP-BOT.md.`);
  }
  await Promise.all([guild.roles.fetch(), guild.channels.fetch(), guild.members.fetchMe()]);
  return { client, guild };
}

export const REQUIRED_PERMISSIONS = ['ManageGuild', 'ManageRoles', 'ManageChannels', 'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'];

export function missingPermissions(guild) {
  const perms = guild.members.me.permissions;
  if (perms.has(PermissionFlagsBits.Administrator)) return [];
  return REQUIRED_PERMISSIONS.filter((name) => !perms.has(PermissionFlagsBits[name]));
}
