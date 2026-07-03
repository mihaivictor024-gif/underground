require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
} = require("discord.js");
const mongoose = require("mongoose");

const TicketCounterSchema = new mongoose.Schema({
  _id: { type: String, default: "counters" },
  support: { type: Number, default: 0 },
  raportare: { type: Number, default: 0 },
  staff_rec: { type: Number, default: 0 },
  appeal: { type: Number, default: 0 },
});
const TicketCounter = mongoose.model("TicketCounter", TicketCounterSchema);

const TicketSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  userId: String,
  type: String,
  number: String,
  messages: [{ author: String, content: String, time: String }],
  closedBy: String,
  closedAt: Date,
});
const Ticket = mongoose.model("Ticket", TicketSchema);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

function getDateStr() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function padNum(n) {
  return String(n).padStart(3, "0");
}

function isMod(member) {
  return (
    member.roles.cache.has(process.env.MOD_ROLE_ID) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

const recentMessages = new Map();
setInterval(() => recentMessages.clear(), 60_000);

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.channel.name) {
    const ticket = await Ticket.findOne({ channelId: message.channel.id });
    if (ticket) {
      ticket.messages.push({
        author: message.author.tag,
        content: message.content || "[fișier atașat]",
        time: getDateStr(),
      });
      await ticket.save();
    }
  }

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  const userMessages = recentMessages.get(key) || [];
  const filtered = userMessages.filter((t) => now - t < 5000);
  filtered.push(now);
  recentMessages.set(key, filtered);

  if (filtered.length >= 5) {
    try {
      await message.member.ban({
        reason: "🚨 Anti-Raid: Spam detectat automat",
      });
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#FF0000")
            .setTitle("🚨 Anti-Raid Activat")
            .setDescription(
              `**${message.author.tag}** a fost banat automat pentru spam/raid.`,
            )
            .setTimestamp(),
        ],
      });
    } catch (e) {
      console.error("Eroare ban anti-raid:", e);
    }
  }
});

client.on("guildMemberAdd", async (member) => {
  const unverifiedRole = member.guild.roles.cache.get(
    process.env.UNVERIFIED_ROLE_ID,
  );
  if (unverifiedRole) {
    try {
      await member.roles.add(unverifiedRole);
    } catch (e) {
      console.error(e);
    }
  }

  const channel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID,
  );
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle("👋 Membru Nou!")
    .setDescription(
      [
        `> Bine ai venit pe **${member.guild.name}**, <@${member.id}>!`,
        ``,
        `📌 Ești al **${member.guild.memberCount}**-lea membru.`,
        `🔐 Mergi la canalul de verificare pentru acces complet.`,
        `📜 Citește regulamentul înainte de orice altceva.`,
      ].join("\n"),
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .setFooter({
      text: member.guild.name,
      iconURL: member.guild.iconURL({ dynamic: true }),
    })
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

client.on("guildMemberRemove", async (member) => {
  const channel = member.guild.channels.cache.get(
    process.env.WELCOME_CHANNEL_ID,
  );
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor("#E74C3C")
    .setTitle("👋 Membru Plecat")
    .setDescription(
      [
        `> **${member.user.username}** a părăsit serverul.`,
        ``,
        `Ne pare rău să te vedem plecând. Sperăm să ne revezi curând!`,
      ].join("\n"),
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
    .setFooter({
      text: member.guild.name,
      iconURL: member.guild.iconURL({ dynamic: true }),
    })
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton() && interaction.customId === "verify_btn") {
    const memberRole = interaction.guild.roles.cache.get(
      process.env.VERIFIED_ROLE_ID,
    );
    const unverifiedRole = interaction.guild.roles.cache.get(
      process.env.UNVERIFIED_ROLE_ID,
    );

    if (!memberRole)
      return interaction.reply({
        content: "❌ Rolul de Membru nu a fost găsit. Contactează un admin.",
        ephemeral: true,
      });

    if (interaction.member.roles.cache.has(memberRole.id))
      return interaction.reply({
        content: "✅ Ești deja verificat!",
        ephemeral: true,
      });

    try {
      await interaction.member.roles.add(memberRole);
      if (
        unverifiedRole &&
        interaction.member.roles.cache.has(unverifiedRole.id)
      )
        await interaction.member.roles.remove(unverifiedRole);

      const embed = new EmbedBuilder()
        .setColor("#2ECC71")
        .setTitle("✅ Verificat cu succes!")
        .setDescription(
          [
            `Bun venit pe **${interaction.guild.name}**, <@${interaction.user.id}>!`,
            ``,
            `Ai primit acces complet la server.`,
            `Distrează-te și respectă regulamentul! 🎉`,
          ].join("\n"),
        )
        .setThumbnail(
          interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (e) {
      console.error("Eroare verificare:", e);
      return interaction.reply({
        content: "❌ Eroare la verificare. Contactează un admin.",
        ephemeral: true,
      });
    }
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "ticket_select"
  ) {
    await handleTicketSelect(interaction);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("ticket_")) {
    await handleTicketButton(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "setup-verify") return setupVerify(interaction);
  if (commandName === "setup-tickets") return setupTickets(interaction);
  if (commandName === "clear") return clearMessages(interaction);
});

async function handleTicketSelect(interaction) {
  const value = interaction.values[0];
  const types = {
    support: {
      name: "support",
      label: "Support General",
      emoji: "🎫",
      color: "#5865F2",
      cat: process.env.TICKET_CAT_SUPPORT,
    },
    raportare: {
      name: "raportare",
      label: "Reclamație Jucător",
      emoji: "❗",
      color: "#ED4245",
      cat: process.env.TICKET_CAT_RAPORTARE,
    },
    staff_rec: {
      name: "rec-staff",
      label: "Reclamație Staff",
      emoji: "⭐",
      color: "#9B59B6",
      cat: process.env.TICKET_CAT_STAFF,
    },
    appeal: {
      name: "appeal",
      label: "Appeal Ban",
      emoji: "🟡",
      color: "#F1C40F",
      cat: process.env.TICKET_CAT_APPEAL,
    },
  };

  const type = types[value];
  if (!type) return;

  const existingTicket = interaction.guild.channels.cache.find(
    (c) =>
      c.name.startsWith(type.name + "-") &&
      c.permissionOverwrites.cache.has(interaction.user.id),
  );
  if (existingTicket)
    return interaction.reply({
      content: `❌ Ai deja un ticket deschis: ${existingTicket}`,
      ephemeral: true,
    });

  const counters = await TicketCounter.findByIdAndUpdate(
    "counters",
    { $inc: { [value]: 1 } },
    { new: true, upsert: true },
  );

  const ticketNum = padNum(counters[value]);
  const channelName = `${type.name}-${ticketNum}`;

  try {
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: type.cat || null,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: process.env.STAFF_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
        {
          id: process.env.MOD_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });

    await Ticket.create({
      channelId: channel.id,
      userId: interaction.user.id,
      type: type.label,
      number: ticketNum,
      messages: [],
    });

    const embed = new EmbedBuilder()
      .setColor(type.color)
      .setTitle(`${type.emoji} ${type.label} — #${ticketNum}`)
      .setDescription(
        [
          `Salut <@${interaction.user.id}>! 👋`,
          ``,
          `📝 Descrie problema ta cât mai detaliat posibil.`,
          `📎 Atașează dovezi dacă este cazul.`,
          `⏳ Staff-ul va răspunde în curând.`,
          ``,
          `> Apasă **🔒 Închide** pentru a închide ticket-ul.`,
        ].join("\n"),
      )
      .addFields(
        {
          name: "👤 Deschis de",
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
        { name: "📋 Tip", value: type.label, inline: true },
        { name: "🔢 Număr", value: `#${ticketNum}`, inline: true },
        {
          name: "📅 Data",
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: false,
        },
      )
      .setFooter({ text: `Ticket #${ticketNum} • ${interaction.guild.name}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("🔒 Închide Ticket")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("✋ Preia Ticket")
        .setStyle(ButtonStyle.Success),
    );

    await channel.send({
      content: `<@${interaction.user.id}> | <@&${process.env.STAFF_ROLE_ID}>`,
      embeds: [embed],
      components: [row],
    });

    await interaction.reply({
      content: `✅ Ticket-ul **#${ticketNum}** a fost creat: ${channel}`,
      ephemeral: true,
    });
  } catch (e) {
    console.error("Eroare creare ticket:", e);
    await interaction.reply({
      content: "❌ Eroare la crearea ticket-ului. Contactează un admin.",
      ephemeral: true,
    });
  }
}

async function handleTicketButton(interaction) {
  if (interaction.customId === "ticket_close") {
    if (!isMod(interaction.member))
      return interaction.reply({
        content: "❌ Doar staff-ul poate închide ticket-ul.",
        ephemeral: true,
      });

    await interaction.reply({
      content: "🔒 Ticket-ul se închide în 5 secunde...",
    });

    try {
      const ticket = await Ticket.findOne({
        channelId: interaction.channel.id,
      });
      const logChannel = interaction.guild.channels.cache.get(
        process.env.TICKET_LOG_ID,
      );

      if (logChannel && ticket) {
        const transcriptLines =
          ticket.messages
            .map((m) => `[${m.time}] ${m.author}: ${m.content}`)
            .join("\n") || "Niciun mesaj.";
        const attachment = new AttachmentBuilder(
          Buffer.from(transcriptLines, "utf-8"),
          {
            name: `transcript-${interaction.channel.name}.txt`,
          },
        );

        const logEmbed = new EmbedBuilder()
          .setColor("#ED4245")
          .setTitle("🔒 Ticket Închis")
          .addFields(
            {
              name: "📋 Canal",
              value: `\`${interaction.channel.name}\``,
              inline: true,
            },
            {
              name: "👤 Deschis de",
              value: `<@${ticket.userId}>`,
              inline: true,
            },
            {
              name: "🛡️ Închis de",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
            { name: "📁 Tip", value: ticket.type || "N/A", inline: true },
            {
              name: "💬 Mesaje",
              value: `${ticket.messages.length}`,
              inline: true,
            },
            {
              name: "📅 Data",
              value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
              inline: true,
            },
          )
          .setFooter({ text: `Ticket #${ticket.number}` })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed], files: [attachment] });

        const archiveCat = interaction.guild.channels.cache.get(
          process.env.TICKET_CAT_ARCHIVE,
        );
        if (archiveCat) {
          await interaction.channel.setParent(archiveCat.id, {
            lockPermissions: false,
          });
          await interaction.channel.permissionOverwrites.set([
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: process.env.MOD_ROLE_ID,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages],
            },
            {
              id: process.env.STAFF_ROLE_ID,
              allow: [PermissionFlagsBits.ViewChannel],
              deny: [PermissionFlagsBits.SendMessages],
            },
          ]);
          ticket.closedBy = interaction.user.tag;
          ticket.closedAt = new Date();
          await ticket.save();
          return;
        }
      }

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    } catch (e) {
      console.error("Eroare închidere ticket:", e);
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
    return;
  }

  if (interaction.customId === "ticket_claim") {
    if (!isMod(interaction.member))
      return interaction.reply({
        content: "❌ Doar staff-ul poate prelua ticket-ul.",
        ephemeral: true,
      });

    const claimEmbed = new EmbedBuilder()
      .setColor("#57F287")
      .setTitle("✋ Ticket Preluat")
      .setDescription(
        `Ticket-ul a fost preluat de <@${interaction.user.id}>!\nVei fi ajutat de **${interaction.user.username}** în cel mai scurt timp. 🙂`,
      )
      .setTimestamp();

    return interaction.reply({ embeds: [claimEmbed] });
  }
}

async function clearMessages(interaction) {
  if (!isMod(interaction.member))
    return interaction.reply({
      content: "❌ Doar staff-ul poate folosi această comandă.",
      ephemeral: true,
    });

  const amount = interaction.options.getInteger("cantitate");

  try {
    const deleted = await interaction.channel.bulkDelete(amount, true);
    const embed = new EmbedBuilder()
      .setColor("#E74C3C")
      .setDescription(
        `🗑️ **${deleted.size}** mesaje șterse de <@${interaction.user.id}>.`,
      )
      .setTimestamp();
    const reply = await interaction.reply({
      embeds: [embed],
      fetchReply: true,
    });
    setTimeout(() => reply.delete().catch(() => {}), 5000);
  } catch (e) {
    console.error("Eroare clear:", e);
    await interaction.reply({
      content:
        "❌ Eroare la ștergerea mesajelor. Mesajele mai vechi de 14 zile nu pot fi șterse.",
      ephemeral: true,
    });
  }
}

async function setupVerify(interaction) {
  if (!isMod(interaction.member))
    return interaction.reply({
      content: "❌ Doar staff-ul poate face asta.",
      ephemeral: true,
    });

  const embed = new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle("🔐 Verificare Membru")
    .setDescription(
      [
        `Bun venit pe **${interaction.guild.name}**!`,
        ``,
        `Pentru a obține acces complet la server, apasă butonul de mai jos.`,
        ``,
        `> ⚠️ Prin verificare, confirmi că ai citit și ești de acord cu regulamentul serverului.`,
      ].join("\n"),
    )
    .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_btn")
      .setLabel("✅ Verifică-te!")
      .setStyle(ButtonStyle.Success),
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({
    content: "✅ Panoul de verificare a fost trimis!",
    ephemeral: true,
  });
}

async function setupTickets(interaction) {
  if (!isMod(interaction.member))
    return interaction.reply({
      content: "❌ Doar staff-ul poate face asta.",
      ephemeral: true,
    });

  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("🎫 Sistem Tickete")
    .setDescription(
      [
        `Ai nevoie de ajutor? Deschide un ticket selectând tipul din meniul de mai jos!`,
        ``,
        `🎫 **Support General** — Probleme generale pe server`,
        `❗ **Reclamație Jucător** — Raportează un jucător care încalcă regulile`,
        `⭐ **Reclamație Staff** — Raportează un abuz al unui membru din staff`,
        `🟡 **Appeal Ban** — Contestă un ban primit`,
        ``,
        `> ⚠️ Nu abuza de sistemul de tickete. Ticketele fără motiv vor fi închise.`,
      ].join("\n"),
    )
    .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 256 }))
    .setFooter({ text: interaction.guild.name })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("📋 Alege tipul de ticket...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Support General")
        .setDescription("Probleme generale pe server")
        .setEmoji("🎫")
        .setValue("support"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Reclamație Jucător")
        .setDescription("Raportează un jucător")
        .setEmoji("❗")
        .setValue("raportare"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Reclamație Staff")
        .setDescription("Raportează un staff")
        .setEmoji("⭐")
        .setValue("staff_rec"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Appeal Ban")
        .setDescription("Contestă un ban")
        .setEmoji("🟡")
        .setValue("appeal"),
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({
    content: "✅ Panoul de tickete a fost trimis!",
    ephemeral: true,
  });
}

const commands = [
  new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription("Trimite panoul de verificare în canalul curent"),
  new SlashCommandBuilder()
    .setName("setup-tickets")
    .setDescription("Trimite panoul de tickete în canalul curent"),
  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Șterge un număr de mesaje din canal (max 100)")
    .addIntegerOption((o) =>
      o
        .setName("cantitate")
        .setDescription("Câte mesaje să șteargă (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectat la MongoDB!");

    client.once("ready", async () => {
      console.log(`✅ Bot pornit ca ${client.user.tag}`);
      try {
        await rest.put(
          Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID,
          ),
          { body: commands },
        );
        console.log("✅ Slash commands înregistrate!");
      } catch (e) {
        console.error("Eroare comenzi:", e);
      }
    });

    client.login(process.env.TOKEN).catch((err) => {
      console.error("❌ Eroare la login Discord:", err);
    });
  } catch (e) {
    console.error("❌ Eroare conectare MongoDB:", e);
    process.exit(1);
  }
})();
