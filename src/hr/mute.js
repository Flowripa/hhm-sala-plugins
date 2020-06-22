/**
 * This is a Haxball Headless Manager plugin that enables authenticated
 * admins to mute players.
 *
 * The mute is IP based and will persist over room restarts. Use !clearmutes
 * to remove all mutes.
 *
 * This plugin provides following commands:
 *
 * - !mute #PLAYER_ID
 *   - Mutes player with given id.
 * - !unmute MUTE_NUMBER or #PLAYER_ID
 * - !mutelist
 *   - Use this to see muted players and get the MUTE_NUMBER for unmute command.
 * - !clearmutes
 *
 * And exports following functions:
 *
 * - room.getPlugin('hr/mute').isMuted(playerObject);
 *   - playerObject is the HaxBall PlayerObject.
 *   - Returns true if the player is muted.
 *
 */
let room = HBInit();

room.pluginSpec = {
  name: "hr/mute",
  author: "salamini",
  version: "1.0.1",
  config: {
    // This message will be sent to muted players when they try to write
    // something.
    muteMessage: "You cannot send messages because you are muted.",
    // These roles cannot be muted.
    protectedRoles: ["host", "admin"],
    // Only these roles can use the commands.
    allowedRoles: ["admin", "admin"],
    // Allow talking when team captain. If this is set to true, the player is
    // allowed to talk when (s)he is the first player in a team.
    allowTalkingWhenCaptain: false,
  },
  dependencies: ["sav/players", "sav/roles", "sav/commands", "hr/utils"],
  order: {},
  incompatible_with: [],
};

// Holds the muted players.
let muteMap = new Map();

/**
 * Parses the id into number. The id can be prefixed with #.
 *
 * @param {string|number} id
 * @returns {number|null} - Id or null if the given id cant be parsed.
 */
function parseId(id) {
  let pId = id;
  if (isNaN(+pId)) {
    if (typeof pId === "string" && pId.startsWith("#")) {
      pId = +pId.slice(1);
      return isNaN(pId) ? null : pId;
    } else {
      return null;
    }
  } else {
    return +pId;
  }
}

/**
 * Mutes the player.
 *
 * @param {PlayerObject} player - HaxBall PlayerObject.
 * @returns {void}
 */
function mutePlayer(player) {
  muteMap.set(player.conn, player);
  room.getPlugin("hhm/persistence").persistPluginData(room);
}
/**
 * Unmutes the player.
 *
 * The argument can be either index of muteMap or a player id prefixed with
 * #, but if player id is used the player needs to be in the room.
 *
 * Returns the removed player if the index or id was valid and player was
 * unmuted.
 *
 * @param {number|string} indexOrPlayerId - Index of the rule to remove.
 * @returns {PlayerObject} - Unmuted player or null if no player was unmuted.
 */
function removeMute(indexOrPlayerId) {
  if (typeof indexOrPlayerId === "string" && indexOrPlayerId.startsWith("#")) {
    const removedPlayer = room.getPlayer(parseId(indexOrPlayerId));
    if (!removedPlayer || !muteMap.has(removedPlayer.conn)) {
      return null;
    }
    muteMap.delete(removedPlayer.conn);
    room.getPlugin("hhm/persistence").persistPluginData(room);
    return removedPlayer;
  }

  const index = +indexOrPlayerId;
  if (isNaN(index)) return null;

  let i = 0;
  for (let key of muteMap.keys()) {
    if (i === indexOrPlayerId) {
      const removedPlayer = muteMap.get(key);
      muteMap.delete(key);
      room.getPlugin("hhm/persistence").persistPluginData(room);
      return removedPlayer;
    }
    i++;
  }
  return null;
}

/**
 * Checks if the player is team captain.
 *
 * Determines the captain by checking if the player is on top of either
 * teams list.
 *
 * @param {PlayerObject} player - HaxBall PlayerObject.
 * @returns {boolean} - Is the player team captain.
 */
function isPlayerTeamCaptain(player) {
  const playerList = room.getPlayerList();
  const redTeamCap = playerList.find((p) => p.team === 1);
  const blueTeamCap = playerList.find((p) => p.team === 2);
  if (
    (redTeamCap && redTeamCap.id === player.id) ||
    (blueTeamCap && blueTeamCap.id === player.id)
  ) {
    return true;
  }
  return false;
}

/**
 * Gets the player with given conn string in the room. If there is no player
 * with given conn string, then returns undefined.
 *
 * @param {string} conn - Player conn string.
 * @returns {PlayerObject} - Player in the room whos conn string
 *    matches the given one.
 */
function findPlayerInRoomWithConn(conn) {
  return room.getPlayerList().find((p) => p.conn === conn);
}

/**
 * Checks if the player with given id is protected against mute based on the
 * `config.protectedRoles` property.
 *
 * @param {number} playerId - The players id.
 * @returns {boolean} - Is the player protected.
 */
function isPlayerProtected(playerId) {
  const protectedRoles = room.getConfig("protectedRoles");

  if (!Array.isArray(protectedRoles)) {
    return false;
  }
  const roles = room.getPlugin("sav/roles");

  for (let role of protectedRoles) {
    if (roles.hasPlayerRole(playerId, role)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the player is allowed to run a command based on the
 * config.allowedRoles property.
 *
 * @param {PlayerObject} player - HaxBall PlayerObject.
 * @param {boolean} - Is player allowed to run command.
 */
function isPlayerAllowedToRunCommand(player) {
  const roles = room.getPlugin(`sav/roles`);
  if (!roles) return false;
  return roles.ensurePlayerRoles(
    player.id,
    room.getConfig("allowedRoles"),
    room
  );
}

/***************
 * PERSIST DATA
 ***************/

function serializeMuteMap(muteMap) {
  let serializedMuteMap = {};
  for (const [key, value] of muteMap) {
    serializedMuteMap[key] = value;
  }
  return JSON.stringify(serializedMuteMap);
}

function deserializeMuteMap(data) {
  let obj = JSON.parse(data);
  let deserializedMuteMap = new Map();
  for (const key of Object.getOwnPropertyNames(obj)) {
    deserializedMuteMap.set(key, obj[key]);
  }
  return deserializedMuteMap;
}

function handlePersistData() {
  return serializeMuteMap(muteMap);
}

function handleRestoreData(data) {
  if (data === undefined) return;
  muteMap = deserializeMuteMap(data);
}

/***********
 * COMMANDS
 ***********/

room.onCommand1_mute = {
  function: (byPlayer, [id]) => {
    if (!isPlayerAllowedToRunCommand(byPlayer)) return;
    const player = room.getPlayer(parseId(id));
    if (!player) {
      room.sendAnnouncement(`No player with id ${id}.`, byPlayer.id, 0xff0000);
      return;
    }
    if (isPlayerProtected(player.id)) {
      room.sendAnnouncement(
        `This player has immunity for mutes.`,
        byPlayer.id,
        0xff0000
      );
      return;
    }
    mutePlayer(player);
    room.sendAnnouncement(
      `Player ${player.name} muted.`,
      byPlayer.id,
      0x00ff00
    );
    room.sendAnnouncement(`You have been muted.`, player.id, 0xff0000);
  },
  data: {
    "sav/help": {
      text: " #PLAYER_ID (mutes player with the given id)",
      roles: room.getConfig("allowedRoles"),
    },
  },
};

room.onCommand1_unmute = {
  function: (byPlayer, [muteNumber]) => {
    if (!isPlayerAllowedToRunCommand(byPlayer)) return;

    const unmutedPlayer = removeMute(muteNumber);
    if (!unmutedPlayer) {
      room.sendAnnouncement(
        `Could not unmute ${muteNumber}! ` +
          `Make sure the argument is either a number listed ` +
          `in !mutelist or player ID prefixed with #.`,
        byPlayer.id,
        0xff0000
      );
      return;
    }
    room.sendAnnouncement(
      `Player ${unmutedPlayer.name} unmuted.`,
      byPlayer.id,
      0x00ff00
    );
    const playerInRoom = findPlayerInRoomWithConn(unmutedPlayer.conn);
    if (playerInRoom) {
      room.sendAnnouncement(
        `You have been unmuted.`,
        playerInRoom.id,
        0x00ff00
      );
    }
  },
  data: {
    "sav/help": {
      text:
        " MUTE_NUMBER or #PLAYER_ID (Unmutes player. " +
        "See !mutelist for the numbers or use #PLAYER_ID)",
      roles: room.getConfig("allowedRoles"),
    },
  },
};

room.onCommand0_clearmutes = {
  function: (byPlayer) => {
    if (!isPlayerAllowedToRunCommand(byPlayer)) return;
    muteMap.clear();
    room.sendAnnouncement(`All mutes cleared!`, null, 0x00ff00);
  },
  data: {
    "sav/help": {
      text: " (removes all mutes)",
      roles: room.getConfig("allowedRoles"),
    },
  },
};

room.onCommand0_mutelist = {
  function: (byPlayer) => {
    if (!isPlayerAllowedToRunCommand(byPlayer)) return;
    if (muteMap.size === 0) {
      room.sendAnnouncement("No muted players.", byPlayer.id, 0xff0000);
      return;
    }
    room.sendAnnouncement("MUTE_NUMBER - PLAYER", byPlayer.id, 0x00ff00);
    const mutelist = [...muteMap.values()].map((p, i) => `${i} - ${p.name}`);
    const utils = room.getPlugin('hr/utils');
    utils.sendLongAnnouncement(mutelist.join('\n'), byPlayer.id, 0x00FF00);
  },
  data: {
    "sav/help": {
      text: " (lists players that have been muted)",
      roles: room.getConfig("allowedRoles"),
    },
  },
};

/**********
 * EXPORTS
 **********/

/**
 * Checks if the player is muted.
 *
 * @param {PlayerObject} player - HaxBall PlayerObject.
 * @returns {boolean} - True if player is muted, false if not.
 */
function isMuted(player) {
  return muteMap.has(player.conn);
}

/*****************
 * EVENT HANDLERS
 *****************/

function handlePlayerChat(player) {
  if (isMuted(player)) {
    if (
      room.getConfig("allowTalkingWhenCaptain") &&
      isPlayerTeamCaptain(player)
    ) {
      return;
    }
    room.sendAnnouncement(room.getConfig("muteMessage"), player.id, 0xff0000);
    return false;
  }
}

room.isMuted = isMuted;
room.onPlayerChat = handlePlayerChat;
room.onPersist = handlePersistData;
room.onRestore = handleRestoreData;
