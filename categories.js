'use strict';

/* ==========================================================================
   Category catalog for map_data.json
   The data file stores only numeric category ids. This catalog follows
   MapGenie's own category panel for Breath of the Wild (same groups, names and
   icons), so the counts match what you see on their map.

   The sprite numbers are positions on markers.png. The sheet is ordered like
   MapGenie's panel (Locations A-Z, Services A-Z, Collectibles A-Z, ...), which is
   how each category got its icon. To change an icon, edit that category's number.

   groups      sidebar sections. flat: true makes a single toggle row (no list).
   categories  what the sidebar lists.  sprite: n = full pin  |  dot: n = small round icon
               text: { stops, fade, priority } = drawn as a text label on the map instead of a pin.
                 stops   [map zoom, font size] pairs, in this map's zoom units (about -4.75 = the
                         whole map in view, 0 = one image pixel per screen pixel). Sizes change
                         smoothly between pairs and stay flat outside them; a size of 0 hides it.
                 fade    [zoom, zoom]: the label fades out between these two zooms (optional).
                 priority  lower numbers win when labels would overlap.
                 Colors come from textColor / textHalo in app.js (or text: { color, halo }).
               on: false = switched off the first time the app runs
   ids         data category_id -> category key. An entry can also be an object:
                 to    category key
                 dot / sprite   a different icon just for this data category
                 dlc   true = markers tagged DLC / Master Mode are hidden unless
                       "Include DLC & Master Mode" is switched on
                 requires  { pattern, else }: markers whose text does not match go to "else"
   presets     layer sets for the quick buttons
   exclude     data category ids that are never loaded
   version     change this when you reorganize; everyone's saved layer choices reset once
   ========================================================================== */
window.HYRULE_CATALOG = {
  version: 'kyda-the-goat',

  groups: [
    { id: 'locations', name: "Locations", icon: 11, open: true },
    { id: 'services', name: "Services", icon: 22 },
    { id: 'collectibles', name: "Collectibles", icon: 25 },
    { id: 'treasure', name: "Treasure", icon: 33 },
    { id: 'quests', name: "Quests", icon: 35 },
    { id: 'enemies', name: "Enemies", icon: 40 },
    { id: 'other', name: "Other", icon: 53 },
    { id: 'ore-deposits', name: "Ore Deposits", flat: true },
    { id: 'materials', name: "Materials", flat: true },
    { id: 'creatures', name: "Creatures", flat: true },
  ],

  categories: {
    // Locations
    area: { name: "Area", group: 'locations', sprite: 0, on: false, text: { stops: [[-2, 0], [-1.5, 12], [1, 18]], priority: 3 } },
    'divine-beast': { name: "Divine Beast", group: 'locations', sprite: 1 },
    'goddess-statue': { name: "Goddess Statue", group: 'locations', sprite: 2 },
    'great-fairy': { name: "Great Fairy", group: 'locations', sprite: 3 },
    landmark: { name: "Landmark", group: 'locations', sprite: 4 },
    'point-of-interest': { name: "Point of Interest", group: 'locations', sprite: 5 },
    province: { name: "Province", group: 'locations', sprite: 6, text: { stops: [[-6, 20]], fade: [-4.5, -3.5], priority: 1 } },
    raft: { name: "Raft", group: 'locations', sprite: 7, on: false },
    region: { name: "Region", group: 'locations', sprite: 8, text: { stops: [[-6, 16]], fade: [1, 2.5], priority: 2 } },
    settlement: { name: "Settlement", group: 'locations', sprite: 9 },
    'sheikah-tower': { name: "Sheikah Tower", group: 'locations', sprite: 10 },
    shrine: { name: "Shrine", group: 'locations', sprite: 11 },
    'tech-lab': { name: "Tech Lab", group: 'locations', sprite: 12 },
    village: { name: "Village", group: 'locations', sprite: 13 },
    // Services
    'armor-shop': { name: "Armor Shop", group: 'services', sprite: 14, on: false },
    'dye-shop': { name: "Dye Shop", group: 'services', sprite: 15, on: false },
    'fang-and-bone': { name: "Fang and Bone", group: 'services', sprite: 16, on: false },
    'general-store': { name: "General Store", group: 'services', sprite: 17, on: false },
    hestu: { name: "Hestu", group: 'services', sprite: 18, on: false },
    inn: { name: "Inn", group: 'services', sprite: 19, on: false },
    'jewelry-shop': { name: "Jewelry Shop", group: 'services', sprite: 20, on: false },
    'mini-game': { name: "Mini-Game", group: 'services', sprite: 21, on: false },
    stable: { name: "Stable", group: 'services', sprite: 22, on: false },
    // Collectibles
    'key-item': { name: "Key Item", group: 'collectibles', sprite: 24, on: false },
    'korok-seed': { name: "Korok Seed", group: 'collectibles', sprite: 25 },
    'voice-memory': { name: "Voice Memory", group: 'collectibles', sprite: 26, on: false },
    // Treasure
    armor: { name: "Armor", group: 'treasure', sprite: 27, on: false },
    'arrow-chest': { name: "Arrow Chest", group: 'treasure', sprite: 28, on: false },
    blupee: { name: "Blupee", group: 'treasure', sprite: 29, on: false },
    gem: { name: "Gem", group: 'treasure', sprite: 30, on: false },
    rupees: { name: "Rupees", group: 'treasure', sprite: 31, on: false },
    shield: { name: "Shield", group: 'treasure', sprite: 32, on: false },
    'treasure-chest': { name: "Treasure Chest", group: 'treasure', sprite: 33, on: false },
    weapon: { name: "Weapon", group: 'treasure', sprite: 34, on: false },
    // Quests
    'main-quest': { name: "Main Quest", group: 'quests', sprite: 35, on: false },
    memory: { name: "Memory", group: 'quests', sprite: 36, on: false },
    'shrine-quest': { name: "Shrine Quest", group: 'quests', sprite: 37, on: false },
    'side-quest': { name: "Side Quest", group: 'quests', sprite: 38, on: false },
    // Enemies
    dragon: { name: "Dragon", group: 'enemies', sprite: 39, on: false },
    'enemy-camp': { name: "Enemy Camp", group: 'enemies', sprite: 40, on: false },
    guardian: { name: "Guardian", group: 'enemies', sprite: 41, on: false },
    hinox: { name: "Hinox", group: 'enemies', sprite: 42, on: false },
    lynel: { name: "Lynel", group: 'enemies', sprite: 43, on: false },
    molduga: { name: "Molduga", group: 'enemies', sprite: 44, on: false },
    stalnox: { name: "Stalnox", group: 'enemies', sprite: 45, on: false },
    talus: { name: "Talus", group: 'enemies', sprite: 46, on: false },
    'talus-rare': { name: "Talus (Rare)", group: 'enemies', sprite: 46, on: false },
    wizzrobe: { name: "Wizzrobe", group: 'enemies', sprite: 47, on: false },
    yiga: { name: "Yiga", group: 'enemies', sprite: 48, on: false },
    // Other
    'cooking-pot': { name: "Cooking Pot", group: 'other', sprite: 49, on: false },
    journal: { name: "Journal", group: 'other', sprite: 52, on: false },
    miscellaneous: { name: "Miscellaneous", group: 'other', sprite: 53, on: false },
    npc: { name: "NPC", group: 'other', sprite: 54, on: false },
    'quest-objective': { name: "Quest Objective", group: 'other', sprite: 56, on: false },
    'unique-horse': { name: "Unique Horse", group: 'other', sprite: 57, on: false },
    'zora-monument': { name: "Zora Monument", group: 'other', sprite: 55, on: false },
    // Toggles
    'ore-deposits': { name: "Ore Deposits", group: 'ore-deposits', dot: 58, on: false },
    materials: { name: "Materials", group: 'materials', dot: 59, on: false },
    creatures: { name: "Creatures", group: 'creatures', dot: 61, on: false },
  },

  ids: {
    6812: { to: 'landmark', requires: { pattern: "Required for 100%:\\*{0,2}\\s*Yes", else: 'area' } },   // Landmark
    6814: 'point-of-interest',   // Point of Interest
    6815: 'sheikah-tower',   // Sheikah Tower
    6816: { to: 'shrine', dlc: true },   // Shrine
    6817: 'tech-lab',   // Tech Lab
    6818: 'settlement',   // Settlement
    6819: 'goddess-statue',   // Goddess Statue
    6820: 'great-fairy',   // Great Fairy
    6821: 'divine-beast',   // Divine Beast
    6822: 'raft',   // Raft
    6823: 'stable',   // Stable
    6824: 'village',   // Village
    6825: 'inn',   // Inn
    6826: 'general-store',   // General Store
    6827: 'armor-shop',   // Armor Shop
    6828: 'dye-shop',   // Dye Shop
    6829: 'jewelry-shop',   // Jewelry Shop
    6830: { to: 'weapon', dlc: true },   // Weapon
    6831: { to: 'shield', dlc: true },   // Shield
    6832: { to: 'armor', dlc: true },   // Armor
    6833: { to: 'treasure-chest', dlc: true },   // Treasure Chest
    6834: { to: 'arrow-chest', dlc: true },   // Arrow Chest
    6835: 'blupee',   // Blupee
    6836: 'korok-seed',   // Korok Seed
    6837: 'voice-memory',   // Voice Memory
    6838: { to: 'main-quest', dlc: true },   // Main Quest
    6839: { to: 'side-quest', dlc: true },   // Side Quest
    6840: { to: 'shrine-quest', dlc: true },   // Shrine Quest
    6841: 'npc',   // NPC
    6842: 'memory',   // Memory
    6843: 'quest-objective',   // Quest Objective
    6844: 'talus-rare',   // Talus (Rare)
    6845: 'hinox',   // Hinox
    6846: 'lynel',   // Lynel
    6847: 'molduga',   // Molduga
    6848: 'guardian',   // Guardian
    6849: 'talus',   // Talus
    6850: 'wizzrobe',   // Wizzrobe
    6851: 'enemy-camp',   // Enemy Camp
    6852: 'yiga',   // Yiga
    6853: 'miscellaneous',   // Miscellaneous
    6855: 'unique-horse',   // Unique Horse
    6857: 'cooking-pot',   // Cooking Pot
    6858: 'journal',   // Journal
    6859: 'dragon',   // Dragon
    6860: 'zora-monument',   // Zora Monument
    6861: { to: 'materials', dot: 59 },   // Materials
    6862: { to: 'materials', dot: 59 },   // Materials
    6863: { to: 'materials', dot: 59 },   // Materials
    6864: { to: 'creatures', dot: 61 },   // Creatures
    6868: { to: 'gem', dlc: true },   // Gem
    6870: 'stalnox',   // Stalnox
    6873: { to: 'ore-deposits', dot: 58 },   // Ore Deposits
    6874: { to: 'ore-deposits', dot: 58 },   // Ore Deposits
    6875: 'key-item',   // Key Item
    6876: { to: 'materials', dot: 59 },   // Materials
    6877: { to: 'materials', dot: 59 },   // Materials
    6878: { to: 'materials', dot: 59 },   // Materials
    6879: { to: 'materials', dot: 59 },   // Materials
    6880: { to: 'materials', dot: 59 },   // Materials
    6881: { to: 'materials', dot: 59 },   // Materials
    6883: { to: 'materials', dot: 60 },   // Materials
    6884: { to: 'materials', dot: 60 },   // Materials
    6885: { to: 'materials', dot: 60 },   // Materials
    6887: { to: 'materials', dot: 60 },   // Materials
    6888: { to: 'materials', dot: 60 },   // Materials
    6889: { to: 'materials', dot: 60 },   // Materials
    6890: { to: 'materials', dot: 60 },   // Materials
    6891: { to: 'materials', dot: 60 },   // Materials
    6892: { to: 'materials', dot: 60 },   // Materials
    6893: { to: 'materials', dot: 60 },   // Materials
    6894: { to: 'materials', dot: 59 },   // Materials
    6895: { to: 'materials', dot: 59 },   // Materials
    7745: { to: 'materials', dot: 59 },   // Materials
    7746: { to: 'materials', dot: 59 },   // Materials
    7747: { to: 'materials', dot: 59 },   // Materials
    7748: { to: 'materials', dot: 59 },   // Materials
    7749: { to: 'materials', dot: 59 },   // Materials
    7750: { to: 'materials', dot: 59 },   // Materials
    7751: { to: 'materials', dot: 59 },   // Materials
    7752: { to: 'materials', dot: 59 },   // Materials
    7754: { to: 'materials', dot: 59 },   // Materials
    7755: { to: 'materials', dot: 59 },   // Materials
    7758: { to: 'materials', dot: 59 },   // Materials
    7759: { to: 'materials', dot: 59 },   // Materials
    7764: { to: 'creatures', dot: 61 },   // Creatures
    7765: { to: 'creatures', dot: 61 },   // Creatures
    7766: { to: 'creatures', dot: 61 },   // Creatures
    7767: { to: 'creatures', dot: 61 },   // Creatures
    7768: { to: 'creatures', dot: 61 },   // Creatures
    7769: { to: 'creatures', dot: 61 },   // Creatures
    7770: { to: 'creatures', dot: 61 },   // Creatures
    7771: { to: 'creatures', dot: 61 },   // Creatures
    7772: { to: 'creatures', dot: 61 },   // Creatures
    7773: { to: 'creatures', dot: 61 },   // Creatures
    7774: { to: 'creatures', dot: 61 },   // Creatures
    7775: { to: 'creatures', dot: 61 },   // Creatures
    7776: { to: 'creatures', dot: 61 },   // Creatures
    7777: { to: 'creatures', dot: 61 },   // Creatures
    7778: { to: 'creatures', dot: 61 },   // Creatures
    7779: { to: 'creatures', dot: 61 },   // Creatures
    7780: { to: 'creatures', dot: 61 },   // Creatures
    7781: { to: 'creatures', dot: 61 },   // Creatures
    7782: { to: 'creatures', dot: 61 },   // Creatures
    7783: { to: 'creatures', dot: 61 },   // Creatures
    7784: { to: 'creatures', dot: 61 },   // Creatures
    7785: { to: 'creatures', dot: 61 },   // Creatures
    7786: { to: 'creatures', dot: 61 },   // Creatures
    7787: { to: 'creatures', dot: 61 },   // Creatures
    7788: { to: 'creatures', dot: 61 },   // Creatures
    7790: { to: 'creatures', dot: 61 },   // Creatures
    7791: { to: 'creatures', dot: 61 },   // Creatures
    7792: { to: 'creatures', dot: 61 },   // Creatures
    7793: { to: 'creatures', dot: 61 },   // Creatures
    7794: { to: 'creatures', dot: 61 },   // Creatures
    7795: { to: 'creatures', dot: 61 },   // Creatures
    7796: { to: 'creatures', dot: 61 },   // Creatures
    7797: { to: 'creatures', dot: 61 },   // Creatures
    7798: { to: 'creatures', dot: 61 },   // Creatures
    7799: { to: 'creatures', dot: 61 },   // Creatures
    7800: { to: 'creatures', dot: 61 },   // Creatures
    7801: { to: 'creatures', dot: 61 },   // Creatures
    7803: { to: 'creatures', dot: 62 },   // Creatures
    7804: { to: 'creatures', dot: 62 },   // Creatures
    7805: { to: 'creatures', dot: 62 },   // Creatures
    7806: { to: 'creatures', dot: 62 },   // Creatures
    7807: { to: 'creatures', dot: 62 },   // Creatures
    7808: { to: 'creatures', dot: 62 },   // Creatures
    7809: { to: 'creatures', dot: 62 },   // Creatures
    7810: { to: 'creatures', dot: 62 },   // Creatures
    7811: { to: 'creatures', dot: 62 },   // Creatures
    7812: { to: 'creatures', dot: 62 },   // Creatures
    7813: { to: 'creatures', dot: 62 },   // Creatures
    7814: { to: 'creatures', dot: 62 },   // Creatures
    7817: { to: 'creatures', dot: 62 },   // Creatures
    7819: { to: 'creatures', dot: 62 },   // Creatures
    7820: { to: 'creatures', dot: 62 },   // Creatures
    7821: { to: 'creatures', dot: 62 },   // Creatures
    7822: { to: 'creatures', dot: 61 },   // Creatures
    7823: { to: 'creatures', dot: 61 },   // Creatures
    7824: { to: 'creatures', dot: 61 },   // Creatures
    7826: { to: 'creatures', dot: 61 },   // Creatures
    7827: { to: 'creatures', dot: 61 },   // Creatures
    7828: { to: 'creatures', dot: 61 },   // Creatures
    7829: { to: 'creatures', dot: 61 },   // Creatures
    7830: { to: 'creatures', dot: 61 },   // Creatures
    7831: { to: 'creatures', dot: 61 },   // Creatures
    7832: { to: 'creatures', dot: 61 },   // Creatures
    7833: { to: 'creatures', dot: 61 },   // Creatures
    7834: { to: 'creatures', dot: 61 },   // Creatures
    7835: { to: 'creatures', dot: 61 },   // Creatures
    7836: { to: 'creatures', dot: 61 },   // Creatures
    7837: { to: 'creatures', dot: 61 },   // Creatures
    7838: { to: 'creatures', dot: 61 },   // Creatures
    7839: 'region',   // Region
    7840: 'province',   // Province
    7841: 'mini-game',   // Mini-Game
    7842: { to: 'materials', dot: 59 },   // Materials
    7843: 'hestu',   // Hestu
    7844: 'fang-and-bone',   // Fang and Bone
    7847: 'area',   // Area
    7848: { to: 'rupees', dlc: true },   // Rupees
  },

  presets: {
    completion: ['shrine', 'korok-seed', 'divine-beast', 'landmark']   // what the in-game 100% counter tracks
  },

  exclude: []
};
